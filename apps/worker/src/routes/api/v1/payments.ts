/**
 * `/api/v1/payments` — real-money purchase of a `sale`/`both` listing via a
 * Razorpay Payment Link. Deliberately separate from every barter route: a
 * payment never creates an offer, a barter transaction, or touches the
 * reciprocal-matching tables, and a barter never touches this one.
 *
 *   POST /                create a Payment Link for a listing (buyer, auth)
 *   GET  /mine             every payment where the caller is buyer or seller
 *   GET  /:id               one payment (buyer or seller only)
 *   POST /webhook          Razorpay webhook (NOT authenticated — verified by
 *                          HMAC signature instead; this is the only path that
 *                          can ever mark a payment `paid`)
 *
 * Money-safety invariants:
 *  - a client can never buy its own listing, or a `barter`-only listing,
 *  - Razorpay credentials are read from `env` (Worker secrets) only — never
 *    accepted from a request,
 *  - `paid` is reached exclusively through `POST /webhook` after signature
 *    verification; there is no "confirm my payment" endpoint a client can call.
 */
import { type Payment } from '@pandam/types';
import { createPaymentSchema } from '@pandam/validation';
import { type Context, Hono } from 'hono';

import { paymentTransition } from '../../../domain/payment';
import { ApiError, sendOk } from '../../../lib/http';
import {
  cancelPaymentLink,
  createPaymentLink,
  verifyWebhookSignature,
  type RazorpayWebhookPayload,
} from '../../../lib/razorpay';
import { parseBody } from '../../../lib/validate';
import { authMiddleware, getAuth, requireAuth } from '../../../middleware/auth';
import { notify } from '../../../services/notify';
import { type AppEnv } from '../../../types';

export const paymentsRoute = new Hono<AppEnv>();

/** Payment Links expire in 24h if unpaid — long enough to check out, short
 *  enough that a stale link doesn't linger indefinitely. */
const LINK_LIFETIME_SECONDS = 24 * 60 * 60;

function requireRazorpay(env: { RAZORPAY_KEY_ID?: string; RAZORPAY_KEY_SECRET?: string }): {
  keyId: string;
  keySecret: string;
} {
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
    throw new ApiError(
      'db_unavailable',
      'Payments are not configured on this server (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET missing).',
    );
  }
  return { keyId: env.RAZORPAY_KEY_ID, keySecret: env.RAZORPAY_KEY_SECRET };
}

paymentsRoute.post('/', authMiddleware, requireAuth, async (c) => {
  const { user } = getAuth(c);
  const { repos, env } = c.get('ctx');
  const creds = requireRazorpay(env);
  const { listingId } = await parseBody(c, createPaymentSchema);

  const listing = await repos.listings.findById(listingId);
  if (!listing || listing.status !== 'published') {
    throw new ApiError('not_found', 'That listing is not available to buy.');
  }
  if (listing.transactionType === 'barter') {
    throw new ApiError('unprocessable', 'This listing is barter-only and cannot be bought.');
  }
  if (listing.ownerId === user.id) {
    throw new ApiError('unprocessable', 'You cannot buy your own listing.');
  }
  if (listing.priceAmount === null) {
    // The DB CHECK constraint should make this unreachable; guard anyway
    // rather than ever creating a payment link with a bogus amount.
    throw new ApiError('internal_error', 'This listing has no price set.');
  }

  const profile = await repos.profiles.findByUserId(user.id);
  const link = await createPaymentLink(creds, {
    amount: listing.priceAmount,
    currency: listing.priceCurrency,
    description: listing.title.slice(0, 250),
    referenceId: `pending-${listing.id}-${user.id}-${Date.now()}`,
    buyerName: profile?.displayName ?? 'PANDAM buyer',
    expiresInSeconds: LINK_LIFETIME_SECONDS,
  });

  const payment = await repos.payments.create({
    listingId: listing.id,
    buyerId: user.id,
    sellerId: listing.ownerId,
    amount: listing.priceAmount,
    currency: listing.priceCurrency,
    razorpayPaymentLinkId: link.id,
    razorpayShortUrl: link.short_url,
    expiresAt: link.expire_by ? link.expire_by * 1000 : null,
  });

  return sendOk(c, { payment: await hydrate(c, payment) }, 201);
});

paymentsRoute.get('/mine', authMiddleware, requireAuth, async (c) => {
  const { user } = getAuth(c);
  const { repos } = c.get('ctx');
  const rows = await repos.payments.listForUser(user.id);
  const items = await Promise.all(rows.map((p) => hydrate(c, p)));
  return sendOk(c, { items });
});

paymentsRoute.get('/:id', authMiddleware, requireAuth, async (c) => {
  const { user } = getAuth(c);
  const { repos } = c.get('ctx');
  const payment = await repos.payments.findById(c.req.param('id'));
  if (!payment || (payment.buyerId !== user.id && payment.sellerId !== user.id)) {
    throw new ApiError('not_found', 'That payment does not exist.');
  }
  return sendOk(c, { payment: await hydrate(c, payment) });
});

paymentsRoute.post('/:id/cancel', authMiddleware, requireAuth, async (c) => {
  const { user } = getAuth(c);
  const { repos, env } = c.get('ctx');
  const creds = requireRazorpay(env);
  const payment = await repos.payments.findById(c.req.param('id'));
  if (!payment || (payment.buyerId !== user.id && payment.sellerId !== user.id)) {
    throw new ApiError('not_found', 'That payment does not exist.');
  }
  const transition = paymentTransition(payment.status, 'cancel');
  if (!transition.ok) {
    throw new ApiError('unprocessable', transition.error.message);
  }
  await cancelPaymentLink(creds, payment.razorpayPaymentLinkId);
  const updated = await repos.payments.applyStatus(payment.id, 'cancelled');
  return sendOk(c, { payment: await hydrate(c, updated!) });
});

/**
 * Razorpay webhook — NOT behind `authMiddleware`. Trust comes entirely from
 * the HMAC signature on the raw body, verified before anything is parsed as
 * JSON or acted on. Always returns 200 once the signature checks out (even
 * for an event this handler ignores) so Razorpay does not retry forever.
 */
paymentsRoute.post('/webhook', async (c) => {
  const { repos, env } = c.get('ctx');
  if (!env.RAZORPAY_WEBHOOK_SECRET) {
    throw new ApiError('db_unavailable', 'Webhook secret is not configured.');
  }

  const rawBody = await c.req.text();
  const signature = c.req.header('X-Razorpay-Signature');
  const verified = await verifyWebhookSignature(
    rawBody,
    signature ?? null,
    env.RAZORPAY_WEBHOOK_SECRET,
  );
  if (!verified) {
    throw new ApiError('unauthorized', 'Invalid webhook signature.');
  }

  let payload: RazorpayWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    throw new ApiError('bad_request', 'Webhook body must be valid JSON.');
  }

  const linkId = payload.payload.payment_link?.entity.id;
  if (!linkId) return sendOk(c, { received: true });

  const payment = await repos.payments.findByPaymentLinkId(linkId);
  if (!payment) return sendOk(c, { received: true }); // unknown link — ignore, don't error

  if (payload.event === 'payment_link.paid') {
    const transition = paymentTransition(payment.status, 'mark_paid');
    if (transition.ok) {
      const razorpayPaymentId = payload.payload.payment?.entity.id;
      await repos.payments.applyStatus(payment.id, 'paid', {
        webhookVerified: true,
        ...(razorpayPaymentId ? { razorpayPaymentId } : {}),
      });
      await repos.listings.setStatus(payment.listingId, 'sold');
      await notify(c, {
        userId: payment.sellerId,
        type: 'transaction_updated',
        data: { paymentId: payment.id, listingId: payment.listingId },
        title: 'Your item sold',
        body: 'A buyer paid for one of your listings.',
      });
    }
  } else if (payload.event === 'payment_link.expired') {
    const transition = paymentTransition(payment.status, 'mark_expired');
    if (transition.ok) {
      await repos.payments.applyStatus(payment.id, 'expired', { webhookVerified: true });
    }
  }

  return sendOk(c, { received: true });
});

async function hydrate(c: Context<AppEnv>, payment: Payment) {
  const { repos } = c.get('ctx');
  const [listing, buyer, seller] = await Promise.all([
    repos.market.getListing(payment.listingId),
    repos.profiles.findByUserId(payment.buyerId),
    repos.profiles.findByUserId(payment.sellerId),
  ]);
  return {
    id: payment.id,
    status: payment.status,
    listing: listing
      ? { id: listing.id, title: listing.title, type: listing.type, category: listing.category }
      : { id: payment.listingId, title: 'Listing removed', type: 'product', category: null },
    buyer: {
      id: payment.buyerId,
      displayName: buyer?.displayName ?? 'PANDAM user',
      username: buyer?.username ?? null,
    },
    seller: {
      id: payment.sellerId,
      displayName: seller?.displayName ?? 'PANDAM user',
      username: seller?.username ?? null,
    },
    amount: payment.amount,
    currency: payment.currency,
    checkoutUrl: payment.status === 'created' ? payment.razorpayShortUrl : null,
    expiresAt: payment.expiresAt,
    paidAt: payment.paidAt,
    cancelledAt: payment.cancelledAt,
    refundedAt: payment.refundedAt,
    createdAt: payment.createdAt,
    updatedAt: payment.updatedAt,
  };
}
