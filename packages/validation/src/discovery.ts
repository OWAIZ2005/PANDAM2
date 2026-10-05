import { idSchema, itemTypeSchema, z } from './common';

/** Query params for `GET /api/v1/{listings,needs}` discovery. */
export const discoverQuerySchema = z.object({
  category: idSchema('cat').optional(),
  type: itemTypeSchema.optional(),
  q: z.string().trim().min(1).max(80).optional(),
  owner: idSchema('usr').optional(),
  /** Coarse city match against the owner's profile — barter happens in person. */
  city: z.string().trim().min(1).max(120).optional(),
  cursor: z.string().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  /** Epoch ms — only items published/created at or after this instant. Used
   *  by Home's "Fresh near you" recency filter; Discover never sends this. */
  since: z.coerce.number().int().positive().optional(),
});
export type DiscoverQuery = z.infer<typeof discoverQuerySchema>;
