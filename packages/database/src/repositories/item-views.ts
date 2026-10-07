import { and, count, desc, eq } from 'drizzle-orm';

import { newId } from '../id';
import { type ItemKind, itemViews } from '../schema/item-views';

import { type Database } from './helpers';

export function itemViewsRepository(db: Database) {
  return {
    /**
     * Record that `userId` opened this item. The unique index on
     * (itemKind, itemId, userId) makes this idempotent — a repeat open by the
     * same user is silently ignored, so the count never inflates.
     */
    async record(itemKind: ItemKind, itemId: string, userId: string): Promise<void> {
      await db
        .insert(itemViews)
        .values({ id: newId('itemView'), itemKind, itemId, userId })
        .onConflictDoNothing();
    },

    async count(itemKind: ItemKind, itemId: string): Promise<number> {
      const rows = await db
        .select({ value: count() })
        .from(itemViews)
        .where(and(eq(itemViews.itemKind, itemKind), eq(itemViews.itemId, itemId)));
      return rows[0]?.value ?? 0;
    },

    /**
     * Every item of `itemKind` this user has ever opened, most recent first —
     * a read over the existing unique-view log, not a second tracking system.
     * Used by the recommendation engine as one of several behaviour signals;
     * never written to by it.
     */
    async listForUser(
      userId: string,
      itemKind: ItemKind,
      limit = 500,
    ): Promise<{ itemId: string; createdAt: number }[]> {
      return db
        .select({ itemId: itemViews.itemId, createdAt: itemViews.createdAt })
        .from(itemViews)
        .where(and(eq(itemViews.itemKind, itemKind), eq(itemViews.userId, userId)))
        .orderBy(desc(itemViews.createdAt))
        .limit(limit);
    },
  };
}

export type ItemViewsRepository = ReturnType<typeof itemViewsRepository>;
