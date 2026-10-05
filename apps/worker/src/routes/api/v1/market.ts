/**
 * `/api/v1/listings` ("I HAVE") and `/api/v1/needs` ("I NEED") — identical
 * shapes, one factory.
 *
 *   GET  /              public discovery of PUBLISHED items (filters + cursor)
 *   GET  /mine          the caller's own items, every status (auth)
 *   POST /              create — owner is always the session user (auth)
 *   GET  /:id           one item; drafts/paused visible only to the owner
 *   PATCH /:id          update fields (auth + ownership)
 *   POST /:id/status    change publication status (auth + ownership)
 *   GET  /cities        cities that have published listings (listings only)
 *   POST /:id/images    upload a photo to R2 (listings only, auth + ownership)
 *   DELETE /:id/images/:imageId   remove a photo (listings only)
 *
 * A `need` never carries a price — it is a request, never itself for sale.
 * A `listing` may optionally carry `transactionType` (`barter` / `sale` /
 * `both`) + a price; see `routes/api/v1/payments.ts` for the money side.
 * Ownership always derives from the verified session — a client can never
 * pass an owner id.
 */
import { MAX_IMAGES_PER_LISTING } from '@pandam/database';
import {
  createListingSchema,
  createNeedSchema,
  discoverQuerySchema,
  setListingStatusSchema,
  updateListingSchema,
  updateNeedSchema,
  type ZodTypeAny,
} from '@pandam/validation';
import { type Context, Hono } from 'hono';

import { decodeCursor, encodeCursor } from '../../../lib/cursor';
import { ApiError, sendOk } from '../../../lib/http';
import { mediaUrl, readUploadedImage, requireMedia } from '../../../lib/media';
import { toMarketItem } from '../../../lib/serialize';
import { parseBody, parseQuery } from '../../../lib/validate';
import { authMiddleware, getAuth, requireAuth } from '../../../middleware/auth';
import { type AppEnv } from '../../../types';

type Kind = 'listing' | 'need';

/**
 * `createSchema`/`updateSchema` are typed as the general `ZodTypeAny` rather
 * than one concrete schema: the listing schemas are `ZodEffects` (they carry a
 * `superRefine` for the barter/price rule) while the need schemas are plain
 * `ZodObject`s, and forcing one shape onto both stops typechecking the moment
 * they diverge.
 */
interface KindConfig {
  kind: Kind;
  createSchema: ZodTypeAny;
  updateSchema: ZodTypeAny;
}

const CONFIG: Record<Kind, KindConfig> = {
  listing: {
    kind: 'listing',
    createSchema: createListingSchema,
    updateSchema: updateListingSchema,
  },
  need: { kind: 'need', createSchema: createNeedSchema, updateSchema: updateNeedSchema },
};

/**
 * A PATCH only carries the fields the client is changing, so whether the
 * barter/price pair stays consistent depends on the row already in the
 * database. This resolves that against `current`:
 *  - switching (or staying) `barter` clears any price,
 *  - switching to (or staying) `sale`/`both` requires a price from either the
 *    patch or the existing row.
 * A no-op for `need` — needs carry no pricing fields at all.
 */
function resolvePricingPatch(
  kind: Kind,
  current: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  if (kind !== 'listing') return patch;

  const effectiveType =
    (patch.transactionType as string | undefined) ??
    (current.transactionType as string | undefined);
  if (effectiveType === 'barter') {
    return { ...patch, priceAmount: null };
  }

  const patchPrice = patch.priceAmount as number | undefined;
  const currentPrice = current.priceAmount as number | null | undefined;
  const hasPrice = patchPrice !== undefined || currentPrice != null;
  if (!hasPrice) {
    throw new ApiError('validation_error', 'A price is required for a sale or "both" listing.', {
      priceAmount: ['is required'],
    });
  }
  return patch;
}

export function createMarketRoute(kind: Kind) {
  const cfg = CONFIG[kind];
  const route = new Hono<AppEnv>();

  const repo = (c: Context<AppEnv>) => {
    const { repos } = c.get('ctx');
    return kind === 'listing'
      ? {
          crud: repos.listings,
          discover: repos.market.discoverListings,
          mine: repos.market.listOwnerListings,
          one: repos.market.getListing,
        }
      : {
          crud: repos.needs,
          discover: repos.market.discoverNeeds,
          mine: repos.market.listOwnerNeeds,
          one: repos.market.getNeed,
        };
  };

  // Public discovery — auth is optional, only PUBLISHED rows are returned.
  route.get('/', authMiddleware, async (c) => {
    const q = parseQuery(c, discoverQuerySchema);
    const { discover } = repo(c);
    const items = await discover({
      categoryId: q.category,
      type: q.type,
      q: q.q,
      ownerId: q.owner,
      city: q.city,
      since: q.since,
      limit: q.limit + 1,
      cursor: decodeCursor(q.cursor),
    });
    const hasMore = items.length > q.limit;
    const page = hasMore ? items.slice(0, q.limit) : items;
    const last = page[page.length - 1];
    return sendOk(c, {
      items: page.map((r) => toMarketItem(r, cfg.kind)),
      nextCursor: hasMore && last ? encodeCursor({ createdAt: last.createdAt, id: last.id }) : null,
    });
  });

  route.get('/mine', authMiddleware, requireAuth, async (c) => {
    const { user } = getAuth(c);
    const rows = await repo(c).mine(user.id);
    return sendOk(c, { items: rows.map((r) => toMarketItem(r, cfg.kind)) });
  });

  // Registered before `/:id` so the literal path wins the match.
  if (kind === 'listing') {
    route.get('/cities', async (c) => {
      const { repos } = c.get('ctx');
      return sendOk(c, { items: await repos.market.citiesWithListings() });
    });
  }

  route.post('/', authMiddleware, requireAuth, async (c) => {
    const { user } = getAuth(c);
    const input = await parseBody(c, cfg.createSchema);
    const { crud, one } = repo(c);
    const created = await crud.create({ ...input, ownerId: user.id });
    const withRefs = await one(created.id);
    if (!withRefs) throw new ApiError('internal_error', 'Created item could not be loaded.');
    return sendOk(c, { item: toMarketItem(withRefs, cfg.kind) }, 201);
  });

  route.get('/:id', authMiddleware, async (c) => {
    const id = c.req.param('id');
    const row = await repo(c).one(id);
    if (!row) throw new ApiError('not_found', `That ${cfg.kind} does not exist.`);
    const auth = c.get('auth');
    if (row.status !== 'published') {
      if (!auth || auth.user.id !== row.ownerId) {
        throw new ApiError('not_found', `That ${cfg.kind} does not exist.`);
      }
    }

    const { repos } = c.get('ctx');
    // A signed-in, non-owner viewer opening a published item counts as a
    // unique view; the owner opening their own listing never does (that's
    // not "interest" in your own item).
    if (auth && auth.user.id !== row.ownerId && row.status === 'published') {
      await repos.itemViews.record(cfg.kind, id, auth.user.id);
    }
    const viewCount = await repos.itemViews.count(cfg.kind, id);

    return sendOk(c, { item: toMarketItem(row, cfg.kind, viewCount) });
  });

  route.patch('/:id', authMiddleware, requireAuth, async (c) => {
    const { user } = getAuth(c);
    const id = c.req.param('id');
    const { crud, one } = repo(c);
    const current = await crud.findById(id);
    if (!current) throw new ApiError('not_found', `That ${cfg.kind} does not exist.`);
    if (current.ownerId !== user.id) {
      throw new ApiError('forbidden', `You can only edit your own ${cfg.kind}s.`);
    }
    const patch = await parseBody(c, cfg.updateSchema);
    const resolved = resolvePricingPatch(
      cfg.kind,
      current as unknown as Record<string, unknown>,
      patch as Record<string, unknown>,
    );
    // `crud` is one of two repos depending on `kind`; `resolved` was already
    // validated against the matching Zod schema above, so this narrows back
    // what the earlier `Record<string, unknown>` cast lost.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (crud.update as any)(id, resolved);
    const withRefs = await one(id);
    return sendOk(c, { item: toMarketItem(withRefs!, cfg.kind) });
  });

  route.post('/:id/status', authMiddleware, requireAuth, async (c) => {
    const { user } = getAuth(c);
    const id = c.req.param('id');
    const { crud, one } = repo(c);
    const current = await crud.findById(id);
    if (!current) throw new ApiError('not_found', `That ${cfg.kind} does not exist.`);
    if (current.ownerId !== user.id) {
      throw new ApiError('forbidden', `You can only change your own ${cfg.kind}s.`);
    }
    const { status } = await parseBody(c, setListingStatusSchema);
    await crud.setStatus(id, status);
    const withRefs = await one(id);
    return sendOk(c, { item: toMarketItem(withRefs!, cfg.kind) });
  });

  // ------------------------------------------------------------- photos --
  // Listings only: a need is a request for something, so it has nothing of
  // its own to photograph.
  if (kind === 'listing') {
    /**
     * The item the caller is about to modify images on, or a thrown error.
     * Ownership is re-checked on every image call — a photo write is a write
     * to the listing.
     */
    const ownedListing = async (c: Context<AppEnv>) => {
      const { user } = getAuth(c);
      const { repos } = c.get('ctx');
      const listingId = c.req.param('id');
      const listing = listingId ? await repos.listings.findById(listingId) : null;
      if (!listing) throw new ApiError('not_found', 'That listing does not exist.');
      if (listing.ownerId !== user.id) {
        throw new ApiError('forbidden', 'You can only change photos on your own listings.');
      }
      return listing;
    };

    route.post('/:id/images', authMiddleware, requireAuth, async (c) => {
      const listing = await ownedListing(c);
      const { repos } = c.get('ctx');
      const bucket = requireMedia(c.env);

      const existing = await repos.listingImages.countForListing(listing.id);
      if (existing >= MAX_IMAGES_PER_LISTING) {
        throw new ApiError(
          'unprocessable',
          `A listing can have at most ${MAX_IMAGES_PER_LISTING} photos.`,
        );
      }

      const { bytes, contentType, extension } = await readUploadedImage(c.req.raw);
      // The key is built here, never taken from the client: `${listing}/${random}`
      // keys a caller cannot guess, collide with, or point outside its prefix.
      const objectKey = `listings/${listing.id}/${crypto.randomUUID()}.${extension}`;
      await bucket.put(objectKey, bytes, { httpMetadata: { contentType } });

      // R2 first, row second: a row that points at missing bytes would render
      // as a broken image forever, whereas an orphaned object is invisible.
      const image = await repos.listingImages.add({
        listingId: listing.id,
        objectKey,
        sortOrder: await repos.listingImages.nextSortOrder(listing.id),
      });

      return sendOk(
        c,
        { image: { id: image.id, url: mediaUrl(image.objectKey), sortOrder: image.sortOrder } },
        201,
      );
    });

    route.delete('/:id/images/:imageId', authMiddleware, requireAuth, async (c) => {
      const listing = await ownedListing(c);
      const { repos } = c.get('ctx');
      const imageId = c.req.param('imageId');
      const image = imageId ? await repos.listingImages.findById(imageId) : null;
      if (!image || image.listingId !== listing.id) {
        throw new ApiError('not_found', 'That photo does not exist.');
      }

      // Row first this time, for the mirror-image reason: if the R2 delete
      // fails the listing simply keeps an unreferenced object, rather than
      // showing a photo the owner has already removed.
      await repos.listingImages.remove(image.id);
      if (c.env.MEDIA) await c.env.MEDIA.delete(image.objectKey);

      return sendOk(c, { deleted: true });
    });
  }

  return route;
}
