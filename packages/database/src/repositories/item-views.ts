import { and, count, eq } from 'drizzle-orm';

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
  };
}

export type ItemViewsRepository = ReturnType<typeof itemViewsRepository>;
