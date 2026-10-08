import { asc, eq } from 'drizzle-orm';

import { newId } from '../id';
import { type MessageRow, messages } from '../schema/messages';

import { type Database, firstOrNull, now, one } from './helpers';

export interface CreateMessageInput {
  conversationId: string;
  senderId: string;
  body: string;
  imageKey?: string | null;
}

export function messagesRepository(db: Database) {
  return {
    async create(input: CreateMessageInput): Promise<MessageRow> {
      const rows = await db
        .insert(messages)
        .values({ ...input, id: newId('message') })
        .returning();
      return one(rows, 'messages.create');
    },

    async findById(id: string): Promise<MessageRow | null> {
      const rows = await db.select().from(messages).where(eq(messages.id, id)).limit(1);
      return firstOrNull(rows);
    },

    async listByConversation(conversationId: string): Promise<MessageRow[]> {
      return db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, conversationId))
        .orderBy(asc(messages.createdAt));
    },

    async softDelete(id: string): Promise<MessageRow | null> {
      const rows = await db
        .update(messages)
        .set({ deletedAt: now() })
        .where(eq(messages.id, id))
        .returning();
      return firstOrNull(rows);
    },
  };
}

export type MessagesRepository = ReturnType<typeof messagesRepository>;
