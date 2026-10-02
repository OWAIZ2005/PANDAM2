/**
 * REQUEST -> OFFER -> CHAT: an I NEED request receives an offer, but the
 * recipient CANNOT chat until they accept it — declining or leaving it
 * pending must never grant a conversation. Accepting opens the thread and
 * closes the request. Also covers the ownership rules (recipient derived
 * server-side, private conversations, sender-scoped image keys).
 */
import { newId, schema } from '@pandam/database';
import { type AuthSession, type MarketItem, type OfferView } from '@pandam/types';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { makeTestDb, testEnv, type TestDb } from './helpers/db';

let ctx: TestDb;
let catId = '';
beforeEach(async () => {
  ctx = await makeTestDb();
  catId = newId('category');
  await ctx.db
    .insert(schema.categories)
    .values([{ id: catId, name: 'Technology', slug: 'technology' }]);
});
afterEach(() => ctx.close());

type Ok<T> = { ok: true; data: T };
type App = ReturnType<TestDb['makeApp']>;
const json = <T>(r: Response) => r.json() as Promise<T>;
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

async function newUser(app: App, name: string): Promise<AuthSession> {
  const res = await app.request(
    '/api/v1/auth/register',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `${name.toLowerCase()}${Math.random().toString(36).slice(2)}@example.com`,
        password: 'a valid pw 12',
        displayName: name,
      }),
    },
    testEnv,
  );
  return (await json<Ok<AuthSession>>(res)).data;
}

async function post(app: App, token: string, path: string, body: unknown) {
  return app.request(
    path,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...bearer(token) },
      body: JSON.stringify(body),
    },
    testEnv,
  );
}
const get = (app: App, token: string, path: string) =>
  app.request(path, { headers: bearer(token) }, testEnv);

async function create(app: App, token: string, kind: 'listings' | 'needs', title: string) {
  const res = await post(app, token, `/api/v1/${kind}`, {
    categoryId: catId,
    type: 'service',
    title,
    description: 'I need beautiful screenshots for my website.',
    status: 'published',
  });
  expect(res.status).toBe(201);
  return (await json<Ok<{ item: MarketItem }>>(res)).data.item;
}

describe('request -> offer -> chat', () => {
  it('runs the whole journey between two users', async () => {
    const app = ctx.makeApp();
    const alice = await newUser(app, 'Alice');
    const bob = await newUser(app, 'Bob');

    // Alice posts an I NEED request.
    const need = await create(app, alice.token, 'needs', 'Beautiful website screenshots');

    // Bob discovers it.
    const found = await json<Ok<{ items: MarketItem[] }>>(
      await get(app, bob.token, '/api/v1/needs?limit=50'),
    );
    expect(found.data.items.map((i) => i.id)).toContain(need.id);

    // Bob offers one of his listings for it (recipient NOT sent by the client).
    const bobHas = await create(app, bob.token, 'listings', 'Logo design');
    const sent = await post(app, bob.token, '/api/v1/offers', {
      offeredListingId: bobHas.id,
      requestedNeedId: need.id,
      message: 'I can make these for you.',
    });
    expect(sent.status).toBe(201);
    const offer = (await json<Ok<{ offer: OfferView }>>(sent)).data.offer;
    expect(offer.status).toBe('pending');
    expect(offer.toUser.id).toBe(alice.user.id);
    expect(offer.requestedKind).toBe('need');
    expect(offer.requested.title).toBe('Beautiful website screenshots');
    // No chat yet — sending an offer must NOT open a conversation.
    expect(offer.conversationId).toBeNull();

    // Alice receives it: incoming list + notification (no conversation to
    // deep-link to yet, so the notification carries only the offer id).
    const incoming = await json<Ok<{ items: OfferView[] }>>(
      await get(app, alice.token, '/api/v1/offers/incoming'),
    );
    expect(incoming.data.items.map((o) => o.id)).toContain(offer.id);
    const notes = await json<Ok<{ items: { type: string; data: Record<string, string> }[] }>>(
      await get(app, alice.token, '/api/v1/notifications'),
    );
    const received = notes.data.items.find((n) => n.type === 'offer_received');
    expect(received).toBeTruthy();
    expect(received!.data.conversationId).toBeUndefined();

    // Neither side can message about a pending offer — there is no
    // conversation to hit yet.
    const conversationsForBobBefore = await json<Ok<{ items: { id: string }[] }>>(
      await get(app, bob.token, '/api/v1/conversations'),
    );
    expect(conversationsForBobBefore.data.items).toHaveLength(0);

    // A third user can read neither the offer nor (once it exists) the
    // conversation.
    const eve = await newUser(app, 'Eve');
    expect((await get(app, eve.token, `/api/v1/offers/${offer.id}`)).status).toBe(404);

    // Only Alice (the recipient) can accept.
    expect(
      (await post(app, bob.token, `/api/v1/offers/${offer.id}/respond`, { action: 'accept' }))
        .status,
    ).toBe(403);
    const acc = await post(app, alice.token, `/api/v1/offers/${offer.id}/respond`, {
      action: 'accept',
    });
    expect(acc.status).toBe(200);
    const accepted = (await json<Ok<{ offer: OfferView }>>(acc)).data.offer;
    expect(accepted.status).toBe('accepted');
    // Accepting is what opens the conversation.
    expect(accepted.conversationId).toBeTruthy();
    const bobView = (
      await json<Ok<{ offer: OfferView }>>(await get(app, bob.token, `/api/v1/offers/${offer.id}`))
    ).data.offer;
    expect(bobView.status).toBe('accepted');
    expect(bobView.conversationId).toBe(accepted.conversationId);
    const needAfter = await get(app, bob.token, `/api/v1/needs?limit=50`);
    expect(
      (await json<Ok<{ items: MarketItem[] }>>(needAfter)).data.items.map((i) => i.id),
    ).not.toContain(need.id);

    // Now that it's accepted, both sides can chat in the SAME conversation.
    const conv = `/api/v1/conversations/${accepted.conversationId}`;
    expect(
      (
        await post(app, bob.token, `${conv}/messages`, {
          body: 'Hey, I can create the screenshots.',
        })
      ).status,
    ).toBe(201);
    expect(
      (await post(app, alice.token, `${conv}/messages`, { body: 'Great, what style?' })).status,
    ).toBe(201);
    const thread = await json<Ok<{ items: { body: string }[] }>>(
      await get(app, alice.token, `${conv}/messages`),
    );
    expect(thread.data.items.map((m) => m.body)).toEqual(
      expect.arrayContaining(['Hey, I can create the screenshots.', 'Great, what style?']),
    );
    expect([403, 404]).toContain((await get(app, eve.token, `${conv}/messages`)).status);
  });

  it('declining an offer never creates a conversation', async () => {
    const app = ctx.makeApp();
    const alice = await newUser(app, 'Alice');
    const bob = await newUser(app, 'Bob');
    const need = await create(app, alice.token, 'needs', 'Screenshots');
    const bobHas = await create(app, bob.token, 'listings', 'Logo design');

    const sent = await post(app, bob.token, '/api/v1/offers', {
      offeredListingId: bobHas.id,
      requestedNeedId: need.id,
    });
    const offer = (await json<Ok<{ offer: OfferView }>>(sent)).data.offer;
    expect(offer.conversationId).toBeNull();

    const declined = await post(app, alice.token, `/api/v1/offers/${offer.id}/respond`, {
      action: 'reject',
    });
    expect(declined.status).toBe(200);
    const declinedOffer = (await json<Ok<{ offer: OfferView }>>(declined)).data.offer;
    expect(declinedOffer.status).toBe('rejected');
    expect(declinedOffer.conversationId).toBeNull();

    // Bob (the sender) gets no conversation list entry either.
    const conversationsForBob = await json<Ok<{ items: { id: string }[] }>>(
      await get(app, bob.token, '/api/v1/conversations'),
    );
    expect(conversationsForBob.data.items).toHaveLength(0);

    const notes = await json<Ok<{ items: { type: string }[] }>>(
      await get(app, bob.token, '/api/v1/notifications'),
    );
    expect(notes.data.items.some((n) => n.type === 'offer_rejected')).toBe(true);
  });

  it('never trusts a client-supplied recipient or someone else’s image', async () => {
    const app = ctx.makeApp();
    const alice = await newUser(app, 'Alice');
    const bob = await newUser(app, 'Bob');
    const eve = await newUser(app, 'Eve');
    const need = await create(app, alice.token, 'needs', 'Screenshots');
    const bobHas = await create(app, bob.token, 'listings', 'Logo design');

    const spoof = await post(app, bob.token, '/api/v1/offers', {
      toUserId: eve.user.id,
      offeredListingId: bobHas.id,
      requestedNeedId: need.id,
    });
    expect(spoof.status).toBe(422);

    const foreignImage = await post(app, bob.token, '/api/v1/offers', {
      offeredListingId: bobHas.id,
      requestedNeedId: need.id,
      imageKey: `offers/${eve.user.id}/x.jpg`,
    });
    expect(foreignImage.status).toBe(403);

    // Cannot offer on your own request.
    const aliceHas = await create(app, alice.token, 'listings', 'Something');
    const self = await post(app, alice.token, '/api/v1/offers', {
      offeredListingId: aliceHas.id,
      requestedNeedId: need.id,
    });
    expect(self.status).toBe(422);
  });

  it('requires exactly one target', async () => {
    const app = ctx.makeApp();
    const bob = await newUser(app, 'Bob');
    const bobHas = await create(app, bob.token, 'listings', 'Logo design');
    const none = await post(app, bob.token, '/api/v1/offers', { offeredListingId: bobHas.id });
    expect(none.status).toBe(422);
  });
});
