import { index, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import {
  CONVERSATION_ROLE,
  CONVERSATION_STATUS,
  type ConversationRole,
  type ConversationStatus,
} from '../enums';

import { createdAt, idColumn, nullableTimestamp, timestampNow, updatedAt } from './_shared';
import { offers } from './offers';
import { users } from './users';

export { CONVERSATION_ROLE, CONVERSATION_STATUS, type ConversationRole, type ConversationStatus };

/**
 * A negotiation thread. Usually tied to one offer, but the link is optional so
 * the model is not coupled to a particular realtime/chat implementation — this
 * phase only stores conversation state and messages relationally.
 */
export const conversations = sqliteTable(
  'conversations',
  {
    id: idColumn,
    offerId: text('offer_id').references(() => offers.id, { onDelete: 'set null' }),
    status: text('status', { enum: CONVERSATION_STATUS }).notNull().default('active'),
    createdAt,
    updatedAt,
  },
  (t) => [uniqueIndex('conversations_offer_unique').on(t.offerId)],
);

/**
 * Membership of a conversation, modelled as a proper join table (never an array
 * column). Composite primary key (conversationId, userId).
 */
export const conversationParticipants = sqliteTable(
  'conversation_participants',
  {
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role', { enum: CONVERSATION_ROLE }).notNull().default('member'),
    joinedAt: timestampNow('joined_at'),
    lastReadAt: nullableTimestamp('last_read_at'),
    /** Last time this participant signalled "typing". Short-lived — the API
     *  treats anything older than its TTL as stale, so a lost stop event can
     *  never wedge the indicator on. */
    typingAt: nullableTimestamp('typing_at'),
  },
  (t) => [
    primaryKey({ columns: [t.conversationId, t.userId] }),
    index('conversation_participants_user_idx').on(t.userId),
  ],
);

export type ConversationRow = typeof conversations.$inferSelect;
export type NewConversationRow = typeof conversations.$inferInsert;
export type ConversationParticipantRow = typeof conversationParticipants.$inferSelect;
export type NewConversationParticipantRow = typeof conversationParticipants.$inferInsert;
