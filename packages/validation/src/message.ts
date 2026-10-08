import { boundedString, z } from './common';

/**
 * A message needs text, an attached photo, or both — never neither. `body`
 * stays optional at the schema level (an image-only message has no caption)
 * so the "must have one or the other" rule lives in the one `refine` below
 * rather than being encoded twice.
 */
export const createMessageSchema = z
  .object({
    body: boundedString(0, 4000).optional(),
    imageKey: z.string().trim().min(1).optional(),
  })
  .refine((v) => !!v.body?.trim() || !!v.imageKey, {
    message: 'A message needs text or a photo.',
    path: ['body'],
  });
export type CreateMessageInput = z.infer<typeof createMessageSchema>;

export const setTypingSchema = z.object({
  typing: z.boolean(),
});
export type SetTypingInput = z.infer<typeof setTypingSchema>;
