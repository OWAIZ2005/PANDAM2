/**
 * Behavior-Based Recommendation Engine — a deterministic, explainable
 * "Recommended For You" ranking built entirely from existing marketplace
 * activity (views, offers, accepted offers, completed trades). No AI, no
 * embeddings, no external calls: every number here is produced by a plain
 * arithmetic formula over rows the app already persists for other reasons.
 *
 * This module is pure (no DB, no fetch) so the scoring itself stays
 * trivially testable and auditable — `routes/api/v1/recommendations.ts` is
 * the only caller, and it does all the I/O (reading behaviour history and
 * candidate listings) before handing data in here.
 *
 * ---------------------------------------------------------------------------
 * ALGORITHM, IN ONE PASS
 *
 * 1. Every past behaviour event (a view, a sent offer, an accepted offer, a
 *    completed trade) on a listing contributes a weight (`EVENT_WEIGHTS`),
 *    decayed by how long ago it happened (`recencyDecay`) — a trade from
 *    today counts far more than a view from 4 months ago.
 * 2. Those decayed weights are summed per category and per item `type`
 *    (PANDAM's only existing "subcategory" axis — see the type's own doc
 *    comment) to build a `PreferenceProfile`: which categories/types the
 *    user actually engages with, and — PER CATEGORY, never globally — what
 *    price range they tend to engage with inside each one (a user's
 *    Technology range and Grocery range are tracked completely separately;
 *    see `PreferenceProfile.categoryPrice`).
 * 3. Each *candidate* listing (already filtered to "available" by the exact
 *    same `published`-status query Home/Discover use — see the route) is
 *    scored against that profile: category match (40) + category-aware
 *    price similarity (30) + type match (20) + listing recency (10) — that
 *    priority order is deliberate: which broad category a user is into
 *    matters far more than the exact product, and price range within that
 *    category matters more than the item's finer `type`.
 * 4. A user with too little history (`MIN_PERSONALIZATION_WEIGHT`) gets no
 *    profile-based score at all — every candidate's category/type/price
 *    score is exactly 0, so ranking collapses to pure listing recency. That
 *    IS the cold-start fallback: no separate code path, just the formula
 *    degrading gracefully (see `scoreCandidate`'s doc comment).
 */
import { type ListingWithRefs } from '@pandam/database';

/** One historical interaction with a listing, already resolved to its item's attributes. */
export interface BehaviorSignal {
  listingId: string;
  categoryId: string;
  type: string;
  priceAmount: number | null;
  /** Epoch ms the event happened at — used for recency decay, nothing else. */
  occurredAt: number;
  tier: EventTier;
}

export type EventTier = 'view' | 'interest' | 'accepted' | 'traded';

/**
 * Raw weight per behaviour tier, centralised here (not scattered across the
 * route/repos) so the "sensible weights" the product spec asks for can be
 * tuned in one place. Roughly: looking counts a little, asking counts more,
 * getting accepted counts more still, an actual completed trade — the
 * strongest possible signal that this is genuinely what the user wants —
 * counts most.
 */
export const EVENT_WEIGHTS: Record<EventTier, number> = {
  view: 1,
  interest: 5,
  accepted: 7,
  traded: 10,
};

/**
 * Final score = sum of these, each normalised to its own 0..weight range.
 * Priority order (highest weight first) is deliberate, per product spec:
 *   1. category     — "this user is into Technology", not "this exact calculator"
 *   2. price (category-aware — see `PreferenceProfile.categoryPrice`)
 *   3. (recency of *behaviour* is already baked into every weight above via
 *      `recencyDecay` at signal-collection time — there is no separate score
 *      term for it, so there is nothing to double-count)
 *   4. type          — product/service/skill, the only existing sub-category axis
 *   5. recency       — listing freshness, lowest priority, mainly a cold-start tiebreak
 * Tunable without touching any scoring logic below.
 */
export const SCORE_WEIGHTS = {
  category: 40,
  price: 30,
  type: 20,
  recency: 10,
} as const;

/** Half-life, in days, for both behaviour-signal decay and listing-recency decay. */
export const RECENCY_HALF_LIFE_DAYS = 30;
/** A decayed weight never drops below this floor — an old signal still counts a little. */
export const MIN_DECAY = 0.05;

/**
 * Below this much *total* decayed behaviour weight, a user is "cold start":
 * category/type/price scoring is skipped entirely (see `scoreCandidate`) and
 * ranking falls back to pure recency. One sent offer (5) or five plain views
 * (5×1) is enough to start personalizing.
 */
export const MIN_PERSONALIZATION_WEIGHT = 5;

/** How many of the most recent published listings to score per request. Keeps
 *  this O(MAX_CANDIDATES), not O(all listings ever), on every call. */
export const MAX_CANDIDATES = 200;
export const DEFAULT_LIMIT = 10;
export const MAX_LIMIT = 30;

/** Exponential decay, floored so nothing ever reaches exactly zero. */
export function recencyDecay(ageMs: number, halfLifeDays = RECENCY_HALF_LIFE_DAYS): number {
  const ageDays = Math.max(0, ageMs) / (24 * 60 * 60 * 1000);
  const decayed = Math.pow(0.5, ageDays / halfLifeDays);
  return Math.max(MIN_DECAY, decayed);
}

export interface PreferenceProfile {
  /** Sum of decayed weight per category — the raw affinity / "category weight" signal. */
  categoryWeight: Map<string, number>;
  /** Sum of decayed weight per item `type` (product/service/skill). */
  typeWeight: Map<string, number>;
  /**
   * Decay-weighted average price PER CATEGORY — a user's Technology price
   * range (e.g. ₹10,000–30,000) is completely independent of their Grocery
   * range (e.g. ₹100–500). A single global average would wrongly penalise a
   * ₹300 grocery item for not looking like a ₹20,000 laptop. Only categories
   * that had at least one *priced* signal get an entry; a pure-barter
   * category has none, and `scoreCandidate` treats that as "no price
   * opinion" rather than "expensive" or "cheap".
   */
  categoryPrice: Map<string, number>;
  /** Total decayed weight across every signal — the "how much do we actually know" number. */
  totalWeight: number;
  topCategoryId: string | null;
  topTypeId: string | null;
}

/**
 * Fold a user's raw behaviour history into a `PreferenceProfile`. Nothing
 * here is persisted — it is cheap enough (a few hundred rows, at most) to
 * recompute per request, so there is no separate "profile" table to keep in
 * sync (see the route's doc comment on why that is the right call here).
 */
export function buildPreferenceProfile(signals: BehaviorSignal[], now: number): PreferenceProfile {
  const categoryWeight = new Map<string, number>();
  const typeWeight = new Map<string, number>();
  // Per-category running (weightSum, weightedPriceTotal) — collapsed to a
  // single per-category average below, once every signal has been folded in.
  const priceWeightByCategory = new Map<string, number>();
  const priceWeightedTotalByCategory = new Map<string, number>();
  let totalWeight = 0;

  for (const s of signals) {
    const base = EVENT_WEIGHTS[s.tier];
    const decayed = base * recencyDecay(now - s.occurredAt);
    totalWeight += decayed;
    categoryWeight.set(s.categoryId, (categoryWeight.get(s.categoryId) ?? 0) + decayed);
    typeWeight.set(s.type, (typeWeight.get(s.type) ?? 0) + decayed);
    if (s.priceAmount != null) {
      priceWeightByCategory.set(
        s.categoryId,
        (priceWeightByCategory.get(s.categoryId) ?? 0) + decayed,
      );
      priceWeightedTotalByCategory.set(
        s.categoryId,
        (priceWeightedTotalByCategory.get(s.categoryId) ?? 0) + decayed * s.priceAmount,
      );
    }
  }

  const categoryPrice = new Map<string, number>();
  for (const [categoryId, weightSum] of priceWeightByCategory) {
    if (weightSum > 0) {
      categoryPrice.set(categoryId, (priceWeightedTotalByCategory.get(categoryId) ?? 0) / weightSum);
    }
  }

  const top = (m: Map<string, number>): string | null => {
    let bestId: string | null = null;
    let bestW = -Infinity;
    for (const [id, w] of m) {
      if (w > bestW) {
        bestW = w;
        bestId = id;
      }
    }
    return bestId;
  };

  return {
    categoryWeight,
    typeWeight,
    categoryPrice,
    totalWeight,
    topCategoryId: top(categoryWeight),
    topTypeId: top(typeWeight),
  };
}

export interface ScoreBreakdown {
  category: number;
  type: number;
  price: number;
  recency: number;
  total: number;
}

export interface ScoredCandidate {
  item: ListingWithRefs;
  breakdown: ScoreBreakdown;
  reason: string;
}

/**
 * Score one candidate listing against a profile.
 *
 * When `profile.totalWeight < MIN_PERSONALIZATION_WEIGHT` (cold start), every
 * component except `recency` is forced to 0 — there is nothing yet to call
 * "the user's category" or "the user's price range", and pretending
 * otherwise would mean scoring every candidate identically by accident of
 * Map iteration order. Ranking then runs purely on listing recency, which is
 * exactly the documented cold-start fallback (recently published first).
 */
export function scoreCandidate(
  item: ListingWithRefs,
  profile: PreferenceProfile,
  now: number,
): ScoredCandidate {
  const personalizing = profile.totalWeight >= MIN_PERSONALIZATION_WEIGHT;

  const maxCategoryWeight = personalizing ? Math.max(0, ...profile.categoryWeight.values()) : 0;
  const maxTypeWeight = personalizing ? Math.max(0, ...profile.typeWeight.values()) : 0;

  const categoryAffinity =
    personalizing && maxCategoryWeight > 0
      ? (profile.categoryWeight.get(item.categoryId) ?? 0) / maxCategoryWeight
      : 0;
  const typeAffinity =
    personalizing && maxTypeWeight > 0
      ? (profile.typeWeight.get(item.type) ?? 0) / maxTypeWeight
      : 0;

  // Price similarity: exponential falloff from the user's decay-weighted
  // average price IN THIS CANDIDATE'S OWN CATEGORY — never a single global
  // average (a ₹300 grocery item must never be penalised for not looking
  // like a ₹20,000 laptop just because the user also shops for electronics).
  // Relative to that category's average (not an absolute rupee gap) so it
  // scales sensibly whether the category runs in tens or tens of thousands.
  // A barter listing (no price), or a category the user has never shown a
  // priced signal in, gets a neutral half-credit rather than 0 — absence of
  // a price signal is not evidence of a mismatch.
  const categoryAvgPrice = profile.categoryPrice.get(item.categoryId) ?? null;
  let priceAffinity = 0.5;
  if (personalizing && categoryAvgPrice != null && categoryAvgPrice > 0 && item.pricing.priceAmount != null) {
    const relGap = Math.abs(item.pricing.priceAmount - categoryAvgPrice) / categoryAvgPrice;
    priceAffinity = Math.exp(-relGap);
  }

  const recencyAffinity = recencyDecay(now - item.createdAt);

  const category = SCORE_WEIGHTS.category * categoryAffinity;
  const type = SCORE_WEIGHTS.type * typeAffinity;
  const price = SCORE_WEIGHTS.price * priceAffinity;
  const recency = SCORE_WEIGHTS.recency * recencyAffinity;
  const total = category + type + price + recency;

  const breakdown: ScoreBreakdown = { category, type, price, recency, total };
  return {
    item,
    breakdown,
    reason: explain(breakdown, item, personalizing),
  };
}

/**
 * Deterministic, template-based explanation — NOT generated text. Picks the
 * single largest contributing component and names it; ties break in a fixed
 * order (category > type > price > recency) so the same breakdown always
 * produces the same sentence.
 */
function explain(b: ScoreBreakdown, item: ListingWithRefs, personalizing: boolean): string {
  if (!personalizing) {
    return 'Recently published on PANDAM';
  }
  const categoryName = item.category.name;
  // Priority mirrors SCORE_WEIGHTS: category first, then category-aware
  // price, then type — the same order the score itself is dominated by.
  if (b.category >= b.price && b.category >= b.type && b.category > 0) {
    return `Because you frequently interact with ${categoryName} items`;
  }
  if (b.price >= b.type && b.price > SCORE_WEIGHTS.price * 0.6) {
    return `Matches your usual ${categoryName} price range`;
  }
  if (b.type > 0) {
    return `Similar product type to items you've shown interest in`;
  }
  if (b.category > 0 || b.price > 0) {
    return `Similar category and price to items you're interested in`;
  }
  return 'Recently published on PANDAM';
}
