/**
 * `/api/v1/offers` — barter proposals between two users: "I give you my HAVE
 * for your HAVE". No money anywhere in this file — see `payments.ts` for that.
 *
 *   POST /attachments  upload an optional photo for an offer (auth)
 *   POST /             propose a trade for a listing OR an I NEED request (auth)
 *   GET  /incoming     offers sent TO the caller (auth)
 *   GET  /outgoing     offers the caller SENT (auth)
 *   GET  /:id          one offer (a party to it only)
 *   POST /:id/respond  accept / reject (recipient) / cancel (sender)
 *
 * Sending an offer does NOT open a conversation — the two people cannot chat
 * until the recipient accepts. Rejecting or cancelling leaves no conversation
 * at all. Accepting creates both the `barter_transactions` row and the
 * conversation (or reuses one from an older offer that still has it).
 */
import { type ItemRef, type OfferView } from '@pandam/types';
import { createOfferSchema, respondToOfferSchema } from '@pandam/validation';
import { type Context, Hono } from 'hono';

import { offerTransition } from '../../../domain/offers';
import { ApiError, sendOk } from '../../../lib/http';
import { mediaUrl, readUploadedImage, requireMedia } from '../../../lib/media';
import { toOwnerRef } from '../../../lib/serialize';
import { parseBody } from '../../../lib/validate';
import { authMiddleware, getAuth, requireAuth } from '../../../middleware/auth';
import { notify } from '../../../services/notify';
import { type AppEnv } from '../../../types';

export const offersRoute = new Hono<AppEnv>();

/**
 * Upload the optional photo for an offer BEFORE creating it; returns the key
 * to pass as `imageKey`. Keys are scoped to the uploader (`offers/<userId>/`)
 * and random, and the create step only accepts the caller's own prefix.
 */
offersRoute.post('/attachments', authMiddleware, requireAuth, async (c) => {
  const { user } = getAuth(c);
  const bucket = requireMedia(c.env);
  const { bytes, contentType, extension } = await readUploadedImage(c.req.raw);
  const key = `offers/${user.id}/${crypto.randomUUID()}.${extension}`;
  await bucket.put(key, bytes, { httpMetadata: { contentType } });
  return sendOk(c, { imageKey: key, imageUrl: mediaUrl(key) }, 201);
});

offersRoute.post('/', authMiddleware, requireAuth, async (c) => {
  const { user } = getAuth(c);
  const { repos } = c.get('ctx');
  const input = await parseBody(c, createOfferSchema);

  const offered = await repos.listings.findById(input.offeredListingId);
  if (!offered || offered.status !== 'published' || offered.ownerId !== user.id) {
    throw new ApiError('unprocessable', 'You can only offer your own published listing.');
  }
  if (offered.transactionType === 'sale') {
    throw new ApiError('unprocessable', 'A sale-only listing cannot be part of a barter offer.');
  }

  // The recipient is ALWAYS the owner of the requested item, never taken
  // from the request body. A supplied `toUserId` is only cross-checked.
  let toUserId: string;
  if (input.requestedListingId) {
    const requested = await repos.listings.findById(input.requestedListingId);
    if (!requested || requested.status !== 'published') {
      throw new ApiError('unprocessable', 'That listing is not available for trade.');
    }
    if (requested.transactionType === 'sale') {
      throw new ApiError('unprocessable', 'A sale-only listing cannot be part of a barter offer.');
    }
    toUserId = requested.ownerId;
  } else {
    const need = await repos.needs.findById(input.requestedNeedId!);
    if (!need || need.status !== 'published') {
      throw new ApiError('unprocessable', 'That request is not open any more.');
    }
    toUserId = need.ownerId;
  }
  if (input.toUserId && input.toUserId !== toUserId) {
    throw new ApiError('unprocessable', 'That item belongs to someone else.');
  }
  if (toUserId === user.id) {
    throw new ApiError('unprocessable', 'You cannot send an offer to yourself.');
  }
  if (input.imageKey && !input.imageKey.startsWith(`offers/${user.id}/`)) {
    throw new ApiError('forbidden', 'That image does not belong to you.');
  }
  // `matchId` is not cross-checked against a persisted `matches` row: the
  // deterministic matches this app shows today are computed on the fly (see
  // `routes/api/v1/matches.ts`) and never written to that table.

  const created = await repos.offers.create({
    matchId: input.matchId ?? null,
    fromUserId: user.id,
    toUserId,
    offeredListingId: input.offeredListingId,
    requestedListingId: input.requestedListingId ?? null,
    requestedNeedId: input.requestedNeedId ?? null,
    imageKey: input.imageKey ?? null,
    message: input.message ?? null,
    expiresAt: input.expiresAt ?? null,
  });

  // No conversation yet — the recipient has to accept before either side can
  // message the other (see `POST /:id/respond`).
  await notify(c, {
    userId: toUserId,
    type: 'offer_received',
    data: { offerId: created.id },
  });

  return sendOk(c, { offer: await hydrate(c, created, user.id) }, 201);
});

offersRoute.get('/incoming', authMiddleware, requireAuth, async (c) => {
  const { user } = getAuth(c);
  const { repos } = c.get('ctx');
  const status = parseStatusFilter(c);
  const rows = await repos.offers.listIncoming(user.id, status);
  return sendOk(c, { items: await Promise.all(rows.map((o) => hydrate(c, o, user.id))) });
});

offersRoute.get('/outgoing', authMiddleware, requireAuth, async (c) => {
  const { user } = getAuth(c);
  const { repos } = c.get('ctx');
  const status = parseStatusFilter(c);
  const rows = await repos.offers.listOutgoing(user.id, status);
  return sendOk(c, { items: await Promise.all(rows.map((o) => hydrate(c, o, user.id))) });
});

offersRoute.get('/:id', authMiddleware, requireAuth, async (c) => {
  const { user } = getAuth(c);
  const { repos } = c.get('ctx');
  const offer = await repos.offers.findById(c.req.param('id'));
  if (!offer || (offer.fromUserId !== user.id && offer.toUserId !== user.id)) {
    throw new ApiError('not_found', 'That offer does not exist.');
  }
  return sendOk(c, { offer: await hydrate(c, offer, user.id) });
});

offersRoute.post('/:id/respond', authMiddleware, requireAuth, async (c) => {
  const { user } = getAuth(c);
  const { repos } = c.get('ctx');
  const offer = await repos.offers.findById(c.req.param('id'));
  if (!offer || (offer.fromUserId !== user.id && offer.toUserId !== user.id)) {
    throw new ApiError('not_found', 'That offer does not exist.');
  }
  const { action } = await parseBody(c, respondToOfferSchema);

  if (action === 'cancel' && offer.fromUserId !== user.id) {
    throw new ApiError('forbidden', 'Only the sender can cancel an offer.');
  }
  if ((action === 'accept' || action === 'reject') && offer.toUserId !== user.id) {
    throw new ApiError('forbidden', 'Only the recipient can respond to an offer.');
  }

  const transition = offerTransition(offer.status, action);
  if (!transition.ok) {
    throw new ApiError('unprocessable', transition.error.message);
  }
  await repos.offers.applyStatus(offer.id, transition.next);

  if (action === 'accept') {
    const transaction = await repos.barterTransactions.create({
      offerId: offer.id,
      initiatedByUserId: offer.fromUserId,
      counterpartyUserId: offer.toUserId,
    });
    // Accepting is what opens the conversation. `findByOffer` first in case
    // this offer somehow already has one (e.g. a pre-fix row from before
    // chat was gated on accept).
    const conversation =
      (await repos.conversations.findByOffer(offer.id)) ??
      (await repos.conversations.create({
        offerId: offer.id,
        participantUserIds: [offer.fromUserId, offer.toUserId],
      }));
    const listingIds = [offer.offeredListingId, offer.requestedListingId].filter(
      (id): id is string => id !== null,
    );
    const needIds = offer.requestedNeedId ? [offer.requestedNeedId] : [];

    const [, , siblings] = await Promise.all([
      // The traded items leave the market; a fulfilled request closes.
      repos.listings.setStatus(offer.offeredListingId, 'traded'),
      offer.requestedListingId
        ? repos.listings.setStatus(offer.requestedListingId, 'traded')
        : repos.needs.setStatus(offer.requestedNeedId!, 'traded'),
      repos.offers.listPendingTouchingItems(listingIds, needIds, offer.id),
      notify(c, {
        userId: offer.fromUserId,
        type: 'offer_accepted',
        data: { offerId: offer.id, transactionId: transaction.id, conversationId: conversation.id },
      }),
    ]);

    // Only one offer can win per item: close every other pending offer that
    // touched either traded item, and tell its sender why.
    await Promise.all(
      siblings.map(async (sibling) => {
        await repos.offers.applyStatus(sibling.id, 'cancelled');
        await notify(c, {
          userId: sibling.fromUserId,
          type: 'offer_cancelled',
          data: { offerId: sibling.id },
        });
      }),
    );
  } else {
    await notify(c, {
      userId: offer.fromUserId,
      type: action === 'reject' ? 'offer_rejected' : 'offer_cancelled',
      data: { offerId: offer.id },
    });
  }

  const updated = await repos.offers.findById(offer.id);
  return sendOk(c, { offer: await hydrate(c, updated!, user.id) });
});

function parseStatusFilter(c: Context<AppEnv>) {
  const raw = c.req.query('status');
  const allowed = ['pending', 'accepted', 'rejected', 'cancelled', 'expired'] as const;
  return allowed.includes(raw as (typeof allowed)[number])
    ? (raw as (typeof allowed)[number])
    : undefined;
}

async function hydrate(
  c: Context<AppEnv>,
  offer: {
    id: string;
    status: string;
    fromUserId: string;
    toUserId: string;
    offeredListingId: string;
    requestedListingId: string | null;
    requestedNeedId: string | null;
    imageKey: string | null;
    message: string | null;
    matchId: string | null;
    expiresAt: number | null;
    respondedAt: number | null;
    createdAt: number;
    updatedAt: number;
  },
  meId: string,
): Promise<OfferView> {
  const { repos } = c.get('ctx');
  const [fromProfile, toProfile, offeredListing, requestedItem, conversation] = await Promise.all([
    repos.profiles.findByUserId(offer.fromUserId),
    repos.profiles.findByUserId(offer.toUserId),
    repos.market.getListing(offer.offeredListingId),
    offer.requestedListingId
      ? repos.market.getListing(offer.requestedListingId)
      : repos.market.getNeed(offer.requestedNeedId!),
    repos.conversations.findByOffer(offer.id),
  ]);

  const toItemRef = (
    id: string,
    item: {
      title: string;
      type: string;
      category: { id: string; name: string; slug: string };
    } | null,
  ): ItemRef => ({
    id,
    title: item?.title ?? 'No longer available',
    type: (item?.type ?? 'product') as ItemRef['type'],
    category: item?.category ?? { id: '', name: 'Unknown', slug: 'unknown' },
  });

  return {
    id: offer.id,
    status: offer.status as OfferView['status'],
    isMine: offer.fromUserId === meId,
    fromUser: toOwnerRef(offer.fromUserId, fromProfile),
    toUser: toOwnerRef(offer.toUserId, toProfile),
    offered: toItemRef(offer.offeredListingId, offeredListing),
    requested: toItemRef(offer.requestedListingId ?? offer.requestedNeedId!, requestedItem),
    requestedKind: offer.requestedListingId ? 'listing' : 'need',
    imageUrl: offer.imageKey ? mediaUrl(offer.imageKey) : null,
    conversationId: conversation?.id ?? null,
    message: offer.message,
    matchId: offer.matchId,
    expiresAt: offer.expiresAt,
    respondedAt: offer.respondedAt,
    createdAt: offer.createdAt,
    updatedAt: offer.updatedAt,
  };
}
