import { integer, index, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { createdAt, idColumn } from './_shared';
import { needs } from './needs';

/**
 * Metadata for a reference image attached to a need ("I NEED"). Same shape
 * and rules as `listing_images` — the binary lives in R2, this row only
 * stores the object key and ordering, and the Worker writes the object
 * first and the row second so a row always points at bytes that exist.
 */
export const needImages = sqliteTable(
  'need_images',
  {
    id: idColumn,
    needId: text('need_id')
      .notNull()
      .references(() => needs.id, { onDelete: 'cascade' }),
    /** Key of the object in the R2 media bucket. */
    objectKey: text('object_key').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt,
  },
  (t) => [index('need_images_need_idx').on(t.needId, t.sortOrder)],
);

export type NeedImageRow = typeof needImages.$inferSelect;
export type NewNeedImageRow = typeof needImages.$inferInsert;
