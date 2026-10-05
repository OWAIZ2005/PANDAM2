/**
 * Authentication input schemas — shared by the Expo auth forms and the Worker
 * auth routes so both enforce the exact same rules.
 */
import { OAUTH_PROVIDER } from '@pandam/database/enums';

import { boundedString, usernameSchema, z } from './common';

export { usernameSchema };

/** Normalised email: trimmed + lower-cased, RFC-ish, length-bounded. */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(254)
  .email('must be a valid email address');

/**
 * Password policy: long enough to matter, capped so a huge input cannot be
 * used to burn CPU in the KDF, and required to mix letters + digits. No
 * punctuation/upper-case mandate — that hurts UX for little gain.
 */
export const passwordSchema = z
  .string()
  .min(10, 'must be at least 10 characters')
  .max(128, 'must be at most 128 characters')
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), {
    message: 'must contain at least one letter and one number',
  });

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: boundedString(1, 80),
  username: usernameSchema.optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  // Only bounded here — never apply the strength policy to a login attempt.
  password: z.string().min(1).max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

/**
 * "Sign in with Google/Apple". The client never sends a password — only the
 * provider's signed ID token, which the Worker verifies against the
 * provider's own public keys (see `apps/worker/src/lib/oauth.ts`). `nonce` is
 * the same random value the client embedded in the sign-in request; the
 * Worker checks it against the token's `nonce` claim so a token cannot be
 * replayed from a different sign-in attempt.
 *
 * `displayName` is only ever used the first time this identity is seen (a new
 * account) — Apple hands back a name exactly once, on the very first
 * authorization, so the client must capture and forward it right then.
 */
export const oauthLoginSchema = z.object({
  provider: z.enum(OAUTH_PROVIDER),
  idToken: z.string().min(1).max(4096),
  /**
   * Required for Apple (its SDK always supplies one) but OPTIONAL for
   * Google: `@react-native-google-signin/google-signin` — Google's own
   * native SDK, the production iOS/Android sign-in path — has no nonce
   * parameter in its free tier (confirmed against the installed version's
   * types; there is simply nothing to pass). The web Google flow
   * (`expo-auth-session`) still generates and sends one. The Worker enforces
   * "required for Apple" itself (`verifyAppleIdToken` always demands it);
   * `verifyGoogleIdToken` checks it only when the client supplied one.
   */
  nonce: z.string().min(16).max(256).optional(),
  displayName: boundedString(1, 80).optional(),
});
export type OAuthLoginInput = z.infer<typeof oauthLoginSchema>;

/**
 * One identity-verification step. Only `demo` exists today: a simulated
 * DigiLocker / face check used for client demos. A production provider will
 * add its own mode here (e.g. an authorization code the Worker exchanges with
 * the provider itself) — the client never asserts "I am verified" in production.
 */
export const verificationStepSchema = z.object({
  mode: z.literal('demo'),
});
export type VerificationStepInput = z.infer<typeof verificationStepSchema>;
