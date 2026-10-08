import { and, eq } from 'drizzle-orm';

import { newId } from '../id';
import {
  type ConversationParticipantRow,
  type ConversationRow,
  conversationParticipants,
  conversations,
} from '../schema/conversations';

import { type Database, firstOrNull, now, one, touch } from './helpers';

export interface CreateConversationInput {
  offerId?: string | null;
  participantUserIds: string[];
}

export function conversationsRepository(db: Database) {
  return {
    async create({
      offerId = null,
      participantUserIds,
    }: CreateConversationInput): Promise<ConversationRow> {
      const rows = await db
        .insert(conversations)
        .values({ id: newId('conversation'), offerId })
        .returning();
      const conversation = one(rows, 'conversations.create');

      if (participantUserIds.length > 0) {
        await db.insert(conversationParticipants).values(
          participantUserIds.map((userId) => ({
            conversationId: conversation.id,
            userId,
            joinedAt: now(),
          })),
        );
      }
      return conversation;
    },

    async findById(id: string): Promise<ConversationRow | null> {
      const rows = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
      return firstOrNull(rows);
    },

    async findByOffer(offerId: string): Promise<ConversationRow | null> {
      const rows = await db
        .select()
        .from(conversations)
        .where(eq(conversations.offerId, offerId))
        .limit(1);
      return firstOrNull(rows);
    },

    async listParticipants(conversationId: string): Promise<ConversationParticipantRow[]> {
      return db
        .select()
        .from(conversationParticipants)
        .where(eq(conversationParticipants.conversationId, conversationId));
    },

    async isParticipant(conversationId: string, userId: string): Promise<boolean> {
      const rows = await db
        .select({ userId: conversationParticipants.userId })
        .from(conversationParticipants)
        .where(
          and(
            eq(conversationParticipants.conversationId, conversationId),
            eq(conversationParticipants.userId, userId),
          ),
        )
        .limit(1);
      return rows.length > 0;
    },

    async markRead(conversationId: string, userId: string): Promise<void> {
      await db
        .update(conversationParticipants)
        .set({ lastReadAt: now() })
        .where(
          and(
            eq(conversationParticipants.conversationId, conversationId),
            eq(conversationParticipants.userId, userId),
          ),
        );
    },

    async setTyping(conversationId: string, userId: string): Promise<void> {
      await db
        .update(conversationParticipants)
        .set({ typingAt: now() })
        .where(
          and(
            eq(conversationParticipants.conversationId, conversationId),
            eq(conversationParticipants.userId, userId),
          ),
        );
    },

    async clearTyping(conversationId: string, userId: string): Promise<void> {
      await db
        .update(conversationParticipants)
        .set({ typingAt: null })
        .where(
          and(
            eq(conversationParticipants.conversationId, conversationId),
            eq(conversationParticipants.userId, userId),
          ),
        );
    },

    async archive(id: string): Promise<ConversationRow | null> {
      const rows = await db
        .update(conversations)
        .set({ status: 'archived', ...touch() })
        .where(eq(conversations.id, id))
        .returning();
      return firstOrNull(rows);
    },
  };
}

export type ConversationsRepository = ReturnType<typeof conversationsRepository>;
