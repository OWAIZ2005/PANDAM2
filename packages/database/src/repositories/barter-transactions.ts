import { and, eq, or } from 'drizzle-orm';

import { newId } from '../id';
import {
  type BarterTransactionRow,
  type BarterTransactionStatus,
  type NewBarterTransactionRow,
  barterTransactions,
} from '../schema/barter-transactions';
import { offers } from '../schema/offers';

import { type Database, firstOrNull, now, one, touch } from './helpers';

export type CreateBarterTransactionInput = Omit<
  NewBarterTransactionRow,
  'id' | 'status' | 'completedAt' | 'cancelledAt' | 'createdAt' | 'updatedAt'
>;

export function barterTransactionsRepository(db: Database) {
  return {
    async create(input: CreateBarterTransactionInput): Promise<BarterTransactionRow> {
      const rows = await db
        .insert(barterTransactions)
        .values({ ...input, id: newId('barterTransaction'), status: 'created' })
        .returning();
      return one(rows, 'barterTransactions.create');
    },

    async findById(id: string): Promise<BarterTransactionRow | null> {
      const rows = await db
        .select()
        .from(barterTransactions)
        .where(eq(barterTransactions.id, id))
        .limit(1);
      return firstOrNull(rows);
    },

    async findByOffer(offerId: string): Promise<BarterTransactionRow | null> {
      const rows = await db
        .select()
        .from(barterTransactions)
        .where(eq(barterTransactions.offerId, offerId))
        .limit(1);
      return firstOrNull(rows);
    },

    /**
     * Persist a status transition. Validate with `assertBarterTransition`
     * (Worker domain layer) first. Sets `completedAt` / `cancelledAt` markers.
     */
    async applyStatus(
      id: string,
      status: BarterTransactionStatus,
    ): Promise<BarterTransactionRow | null> {
      const stamp =
        status === 'completed'
          ? { completedAt: now() }
          : status === 'cancelled'
            ? { cancelledAt: now() }
            : {};
      const rows = await db
        .update(barterTransactions)
        .set({ status, ...stamp, ...touch() })
        .where(eq(barterTransactions.id, id))
        .returning();
      return firstOrNull(rows);
    },

    /**
     * Every `completed` trade this user was a party to, with the realised
     * offer's item ids attached — a read over the existing transaction +
     * offer tables, joined once here rather than N+1'd by callers. Used by
     * the recommendation engine's "successful trade" signal (the strongest
     * one); never written to by it.
     */
    async listCompletedForUser(
      userId: string,
      limit = 200,
    ): Promise<
      {
        completedAt: number | null;
        offerFromUserId: string;
        requestedListingId: string | null;
        requestedNeedId: string | null;
        offeredListingId: string;
      }[]
    > {
      const rows = await db
        .select({
          completedAt: barterTransactions.completedAt,
          offerFromUserId: offers.fromUserId,
          requestedListingId: offers.requestedListingId,
          requestedNeedId: offers.requestedNeedId,
          offeredListingId: offers.offeredListingId,
        })
        .from(barterTransactions)
        .innerJoin(offers, eq(offers.id, barterTransactions.offerId))
        .where(
          and(
            eq(barterTransactions.status, 'completed'),
            or(
              eq(barterTransactions.initiatedByUserId, userId),
              eq(barterTransactions.counterpartyUserId, userId),
            ),
          ),
        )
        .limit(limit);
      return rows;
    },
  };
}

export type BarterTransactionsRepository = ReturnType<typeof barterTransactionsRepository>;
