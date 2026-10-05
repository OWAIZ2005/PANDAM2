import { index, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';

import { ITEM_KIND, type ItemKind } from '../enums';

import { createdAt, idColumn } from './_shared';
import { users } from './users';

export { ITEM_KIND, type ItemKind };

/**
 * One row per (itemKind, itemId, userId) — a unique index enforces this, so
 * repeatedly opening the same item never inflates its view count. The owner
 * opening their own item is still recorded (harmless) but the route never
 * counts it as "interest"; interest comes from `offers`, not views.
 */
export const itemViews = sqliteTable(
  'item_views',
  {
    id: idColumn,
    itemKind: text('item_kind', { enum: ITEM_KIND }).notNull(),
    itemId: text('item_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt,
  },
  (t) => [
    unique('item_views_unique').on(t.itemKind, t.itemId, t.userId),
    index('item_views_item_idx').on(t.itemKind, t.itemId),
  ],
);

export type ItemViewRow = typeof itemViews.$inferSelect;
export type NewItemViewRow = typeof itemViews.$inferInsert;
