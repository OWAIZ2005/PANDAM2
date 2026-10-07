import { and, desc, eq, inArray, ne, or } from 'drizzle-orm';

import { newId } from '../id';
import { type NewOfferRow, type OfferRow, type OfferStatus, offers } from '../schema/offers';

import { type Database, firstOrNull, now, one, touch } from './helpers';

export type CreateOfferInput = Omit<
  NewOfferRow,
  'id' | 'status' | 'respondedAt' | 'createdAt' | 'updatedAt'
>;

export function offersRepository(db: Database) {
  return {
    async create(input: CreateOfferInput): Promise<OfferRow> {
      const rows = await db
        .insert(offers)
        .values({ ...input, id: newId('offer'), status: 'pending' })
        .returning();
      return one(rows, 'offers.create');
    },

    async findById(id: string): Promise<OfferRow | null> {
      const rows = await db.select().from(offers).where(eq(offers.id, id)).limit(1);
      return firstOrNull(rows);
    },

    /**
     * An existing `pending` offer from this sender against this exact
     * requested item (listing XOR need), if any. Used to reject a duplicate
     * request before it is created — one pending ask per (sender, item) at a
     * time; the sender can always try again after a reject/cancel/expiry.
     */
    async findPendingDuplicate(
      fromUserId: string,
      requestedListingId: string | null,
      requestedNeedId: string | null,
    ): Promise<OfferRow | null> {
      const itemClause = requestedListingId
        ? eq(offers.requestedListingId, requestedListingId)
        : eq(offers.requestedNeedId, requestedNeedId!);
      const rows = await db
        .select()
        .from(offers)
        .where(and(eq(offers.fromUserId, fromUserId), eq(offers.status, 'pending'), itemClause))
        .limit(1);
      return firstOrNull(rows);
    },

    async listIncoming(userId: string, status?: OfferStatus): Promise<OfferRow[]> {
      const where = status
        ? and(eq(offers.toUserId, userId), eq(offers.status, status))
        : eq(offers.toUserId, userId);
      return db.select().from(offers).where(where).orderBy(desc(offers.createdAt));
    },

    async listOutgoing(userId: string, status?: OfferStatus): Promise<OfferRow[]> {
      const where = status
        ? and(eq(offers.fromUserId, userId), eq(offers.status, status))
        : eq(offers.fromUserId, userId);
      return db.select().from(offers).where(where).orderBy(desc(offers.createdAt));
    },

    /**
     * Persist a status transition. Callers MUST validate the transition with
     * `assertOfferTransition` (Worker domain layer) first; this method only
     * writes and stamps `respondedAt` for terminal responses.
     */
    async applyStatus(id: string, status: OfferStatus): Promise<OfferRow | null> {
      const respondedAt = status === 'pending' ? undefined : now();
      const rows = await db
        .update(offers)
        .set({ status, ...(respondedAt ? { respondedAt } : {}), ...touch() })
        .where(eq(offers.id, id))
        .returning();
      return firstOrNull(rows);
    },

    /**
     * Other still-`pending` offers that touch either item side of the offer
     * being accepted (as the offered listing OR the requested listing/need,
     * on either side of that other offer). Used to auto-close siblings once
     * one offer on the same item is accepted — an item can only be traded
     * once.
     */
    async listPendingTouchingItems(
      listingIds: string[],
      needIds: string[],
      excludeOfferId: string,
    ): Promise<OfferRow[]> {
      if (listingIds.length === 0 && needIds.length === 0) return [];
      const itemClauses = [
        listingIds.length > 0 ? inArray(offers.offeredListingId, listingIds) : undefined,
        listingIds.length > 0 ? inArray(offers.requestedListingId, listingIds) : undefined,
        needIds.length > 0 ? inArray(offers.requestedNeedId, needIds) : undefined,
      ].filter((c): c is NonNullable<typeof c> => c !== undefined);

      return db
        .select()
        .from(offers)
        .where(
          and(eq(offers.status, 'pending'), ne(offers.id, excludeOfferId), or(...itemClauses)),
        );
    },
  };
}

export type OffersRepository = ReturnType<typeof offersRepository>;
