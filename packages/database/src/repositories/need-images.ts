import { asc, eq, inArray } from 'drizzle-orm';

import { MAX_LISTING_IMAGES } from '../enums';
import { newId } from '../id';
import { type NeedImageRow, type NewNeedImageRow, needImages } from '../schema/need-images';

import { type Database, firstOrNull, one } from './helpers';

export type AddNeedImageInput = Omit<NewNeedImageRow, 'id' | 'createdAt'>;

/** Hard cap per need — same limit as a listing's photo strip. */
export const MAX_IMAGES_PER_NEED = MAX_LISTING_IMAGES;

export function needImagesRepository(db: Database) {
  return {
    /**
     * Store image metadata. The object itself is written to R2 by the Worker
     * first, so a row here always points at bytes that exist.
     */
    async add(input: AddNeedImageInput): Promise<NeedImageRow> {
      const rows = await db
        .insert(needImages)
        .values({ ...input, id: newId('needImage') })
        .returning();
      return one(rows, 'needImages.add');
    },

    async findById(id: string): Promise<NeedImageRow | null> {
      const rows = await db.select().from(needImages).where(eq(needImages.id, id)).limit(1);
      return firstOrNull(rows);
    },

    async listByNeed(needId: string): Promise<NeedImageRow[]> {
      return db
        .select()
        .from(needImages)
        .where(eq(needImages.needId, needId))
        .orderBy(asc(needImages.sortOrder), asc(needImages.createdAt));
    },

    /**
     * Images for many needs in ONE query, grouped by need id. The discovery
     * feed needs photos for every row it returns, and doing that per row
     * would be a query per card.
     */
    async listByNeeds(needIds: string[]): Promise<Map<string, NeedImageRow[]>> {
      const map = new Map<string, NeedImageRow[]>();
      if (needIds.length === 0) return map;
      const rows = await db
        .select()
        .from(needImages)
        .where(inArray(needImages.needId, needIds))
        .orderBy(asc(needImages.sortOrder), asc(needImages.createdAt));
      for (const row of rows) {
        const list = map.get(row.needId);
        if (list) list.push(row);
        else map.set(row.needId, [row]);
      }
      return map;
    },

    /** Next free `sortOrder`, so uploads append rather than collide at 0. */
    async nextSortOrder(needId: string): Promise<number> {
      const existing = await this.listByNeed(needId);
      const last = existing[existing.length - 1];
      return last ? last.sortOrder + 1 : 0;
    },

    async countForNeed(needId: string): Promise<number> {
      return (await this.listByNeed(needId)).length;
    },

    async remove(id: string): Promise<void> {
      await db.delete(needImages).where(eq(needImages.id, id));
    },
  };
}

export type NeedImagesRepository = ReturnType<typeof needImagesRepository>;
