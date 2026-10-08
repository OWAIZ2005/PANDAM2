/**
 * `/api/v1/conversations` — negotiation threads created automatically when an
 * offer is accepted (see `routes/api/v1/offers.ts`). Storage + REST only in
 * this phase; realtime delivery (WebSockets / Durable Objects) is later.
 *
 *   GET  /                        every conversation the caller is in
 *   GET  /:id                     one conversation (a participant only)
 *   POST /:id/read                mark the caller's read position current
 *   GET  /:id/messages            messages, oldest first
 *   POST /:id/messages            send a message
 *   POST /:id/attachments         upload an optional photo for a message (auth)
 *   GET  /:id/typing              whether another participant is typing
 *   POST /:id/typing              signal the caller's own typing state
 */
import {
  type ConversationView,
  type MessageView,
  type OwnerRef,
  type TypingStatusView,
} from '@pandam/types';
import { createMessageSchema, setTypingSchema } from '@pandam/validation';
import { type Context, Hono } from 'hono';

import { ApiError, sendOk } from '../../../lib/http';
import { mediaUrl, readUploadedImage, requireMedia } from '../../../lib/media';
import { toOwnerRef } from '../../../lib/serialize';
import { parseBody } from '../../../lib/validate';
import { authMiddleware, getAuth, requireAuth } from '../../../middleware/auth';
import { notify } from '../../../services/notify';
import { type AppEnv } from '../../../types';

export const conversationsRoute = new Hono<AppEnv>();

async function requireParticipant(c: Context<AppEnv>, conversationId: string, userId: string) {
  const { repos } = c.get('ctx');
  const conversation = await repos.conversations.findById(conversationId);
  if (!conversation) throw new ApiError('not_found', 'That conversation does not exist.');
  const isIn = await repos.conversations.isParticipant(conversationId, userId);
  if (!isIn) throw new ApiError('not_found', 'That conversation does not exist.');
  return conversation;
}

conversationsRoute.get('/', authMiddleware, requireAuth, async (c) => {
  const { user } = getAuth(c);
  const { repos } = c.get('ctx');
  // No "list my conversations" query exists on the repo yet (it only supports
  // lookups by id/offer); every conversation currently starts from an
  // accepted offer, so derive the list from the caller's offers.
  const [incoming, outgoing] = await Promise.all([
    repos.offers.listIncoming(user.id, 'accepted'),
    repos.offers.listOutgoing(user.id, 'accepted'),
  ]);
  const offerIds = [...incoming, ...outgoing].map((o) => o.id);
  const conversations = (
    await Promise.all(offerIds.map((id) => repos.conversations.findByOffer(id)))
  ).filter((cv): cv is NonNullable<typeof cv> => cv !== null);

  const items = await Promise.all(conversations.map((cv) => hydrate(c, cv, user.id)));
  items.sort((a, b) => b.updatedAt - a.updatedAt);
  return sendOk(c, { items });
});

conversationsRoute.get('/:id', authMiddleware, requireAuth, async (c) => {
  const { user } = getAuth(c);
  const conversation = await requireParticipant(c, c.req.param('id'), user.id);
  return sendOk(c, { conversation: await hydrate(c, conversation, user.id) });
});

conversationsRoute.post('/:id/read', authMiddleware, requireAuth, async (c) => {
  const { user } = getAuth(c);
  const { repos } = c.get('ctx');
  const conversation = await requireParticipant(c, c.req.param('id'), user.id);
  await repos.conversations.markRead(conversation.id, user.id);
  return sendOk(c, { read: true });
});

conversationsRoute.get('/:id/messages', authMiddleware, requireAuth, async (c) => {
  const { user } = getAuth(c);
  const { repos } = c.get('ctx');
  const conversation = await requireParticipant(c, c.req.param('id'), user.id);
  const rows = await repos.messages.listByConversation(conversation.id);
  const items: MessageView[] = rows
    .filter((m) => !m.deletedAt)
    .map((m) => ({
      id: m.id,
      conversationId: m.conversationId,
      senderId: m.senderId,
      isMine: m.senderId === user.id,
      body: m.body,
      imageUrl: m.imageKey ? mediaUrl(m.imageKey) : null,
      createdAt: m.createdAt,
      editedAt: m.editedAt,
    }));
  return sendOk(c, { items });
});

/**
 * Upload the optional photo for a message BEFORE sending it; returns the key
 * to pass as `imageKey`. Keys are scoped to the uploader
 * (`messages/<userId>/`), mirroring `POST /offers/attachments`.
 */
conversationsRoute.post('/:id/attachments', authMiddleware, requireAuth, async (c) => {
  const { user } = getAuth(c);
  await requireParticipant(c, c.req.param('id'), user.id);
  const bucket = requireMedia(c.env);
  const { bytes, contentType, extension } = await readUploadedImage(c.req.raw);
  const key = `messages/${user.id}/${crypto.randomUUID()}.${extension}`;
  await bucket.put(key, bytes, { httpMetadata: { contentType } });
  return sendOk(c, { imageKey: key, imageUrl: mediaUrl(key) }, 201);
});

conversationsRoute.post('/:id/messages', authMiddleware, requireAuth, async (c) => {
  const { user } = getAuth(c);
  const { repos } = c.get('ctx');
  const conversation = await requireParticipant(c, c.req.param('id'), user.id);
  if (conversation.status === 'archived') {
    throw new ApiError('unprocessable', 'This conversation is archived.');
  }
  const { body, imageKey } = await parseBody(c, createMessageSchema);
  if (imageKey && !imageKey.startsWith(`messages/${user.id}/`)) {
    throw new ApiError('forbidden', 'That image was not uploaded by you.');
  }
  const message = await repos.messages.create({
    conversationId: conversation.id,
    senderId: user.id,
    body: body?.trim() ?? '',
    imageKey: imageKey ?? null,
  });

  const others = (await repos.conversations.listParticipants(conversation.id)).filter(
    (p) => p.userId !== user.id,
  );
  await Promise.all(
    others.map((p) =>
      notify(c, {
        userId: p.userId,
        type: 'message_received',
        data: { conversationId: conversation.id, messageId: message.id },
      }),
    ),
  );

  const view: MessageView = {
    id: message.id,
    conversationId: message.conversationId,
    senderId: message.senderId,
    isMine: true,
    body: message.body,
    imageUrl: message.imageKey ? mediaUrl(message.imageKey) : null,
    createdAt: message.createdAt,
    editedAt: message.editedAt,
  };
  return sendOk(c, { message: view }, 201);
});

/**
 * How long a typing signal stays live without a refresh. The client debounces
 * its own "stop" event, but this is the server-side safety net: if a stop
 * event (or the client itself) never arrives, the indicator still clears
 * within this window rather than staying stuck on forever.
 */
const TYPING_TTL_MS = 6_000;

conversationsRoute.get('/:id/typing', authMiddleware, requireAuth, async (c) => {
  const { user } = getAuth(c);
  const { repos } = c.get('ctx');
  const conversation = await requireParticipant(c, c.req.param('id'), user.id);
  const participants = await repos.conversations.listParticipants(conversation.id);
  const typing = participants.some(
    (p) => p.userId !== user.id && p.typingAt !== null && Date.now() - p.typingAt < TYPING_TTL_MS,
  );
  const view: TypingStatusView = { typing };
  return sendOk(c, view);
});

conversationsRoute.post('/:id/typing', authMiddleware, requireAuth, async (c) => {
  const { user } = getAuth(c);
  const { repos } = c.get('ctx');
  const conversation = await requireParticipant(c, c.req.param('id'), user.id);
  const { typing } = await parseBody(c, setTypingSchema);
  if (typing) {
    await repos.conversations.setTyping(conversation.id, user.id);
  } else {
    await repos.conversations.clearTyping(conversation.id, user.id);
  }
  return sendOk(c, { typing });
});

async function hydrate(
  c: Context<AppEnv>,
  conversation: {
    id: string;
    offerId: string | null;
    status: string;
    createdAt: number;
    updatedAt: number;
  },
  meId: string,
): Promise<ConversationView> {
  const { repos } = c.get('ctx');
  const [participants, lastMessages, me] = await Promise.all([
    repos.conversations.listParticipants(conversation.id),
    repos.messages.listByConversation(conversation.id),
    repos.conversations
      .listParticipants(conversation.id)
      .then((ps) => ps.find((p) => p.userId === meId)),
  ]);

  const others = participants.filter((p) => p.userId !== meId);
  const otherRefs: OwnerRef[] = await Promise.all(
    others.map(async (p) => toOwnerRef(p.userId, await repos.profiles.findByUserId(p.userId))),
  );

  const visible = lastMessages.filter((m) => !m.deletedAt);
  const last = visible[visible.length - 1] ?? null;
  const lastReadAt = me?.lastReadAt ?? null;
  const unread =
    !!last && last.senderId !== meId && (lastReadAt === null || last.createdAt > lastReadAt);

  return {
    id: conversation.id,
    status: conversation.status as ConversationView['status'],
    offerId: conversation.offerId,
    participants: otherRefs,
    lastMessage: last
      ? {
          id: last.id,
          conversationId: last.conversationId,
          senderId: last.senderId,
          isMine: last.senderId === meId,
          body: last.body,
          imageUrl: last.imageKey ? mediaUrl(last.imageKey) : null,
          createdAt: last.createdAt,
          editedAt: last.editedAt,
        }
      : null,
    unread,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
  };
}
