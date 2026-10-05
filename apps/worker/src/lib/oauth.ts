/**
 * "Sign in with Google/Apple" — verifying the ID token the client hands us.
 *
 * PANDAM never talks to Google/Apple's *authorization* endpoints (the client
 * does that, entirely on-device, via `expo-auth-session` / native Apple
 * sign-in). All the Worker ever sees is the resulting signed ID token (a JWT),
 * which it verifies itself, offline, against the provider's published public
 * keys — no client secret, no server-to-server call needed for verification.
 *
 * `jose`'s `createRemoteJWKSet` fetches and caches each provider's JWKS
 * (their public signing keys, which rotate) and `jwtVerify` checks the
 * signature, expiry, issuer and audience in one call. This runs on the
 * Workers runtime with zero Node-only dependencies.
 *
 * A verified token proves three things: the provider issued it, it has not
 * expired, and it was issued for THIS app (the `aud` check). It does NOT
 * prove it was issued for THIS sign-in attempt — that is what `nonce`
 * verification (below) adds, defeating replay of a token captured elsewhere.
 */
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

import { ApiError } from './http';

/** What every verified provider token reduces to. */
export interface VerifiedOAuthIdentity {
  /** The provider's stable subject id — the actual linking key, never the email. */
  subject: string;
  /** May be absent (Apple omits it on repeat sign-ins to the same app). */
  email: string | null;
  /** Only trust `email` for account linking when the provider itself vouches for it. */
  emailVerified: boolean;
}

const GOOGLE_JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
const APPLE_JWKS = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));

function splitList(v: string | undefined): string[] {
  return (v ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function asString(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

async function verify(
  idToken: string,
  jwks: ReturnType<typeof createRemoteJWKSet>,
  issuer: string | string[],
  audiences: string[],
  providerLabel: string,
): Promise<JWTPayload> {
  if (audiences.length === 0) {
    // Not configured for this environment — fail clearly, not silently.
    throw new ApiError(
      'not_implemented',
      `${providerLabel} sign-in is not configured on this server yet.`,
    );
  }
  try {
    const { payload } = await jwtVerify(idToken, jwks, { issuer, audience: audiences });
    return payload;
  } catch {
    // Every failure mode (bad signature, expired, wrong audience/issuer,
    // malformed token) is equally "not a valid token" to the caller — never
    // hint at which check failed.
    throw new ApiError('unauthorized', `Could not verify the ${providerLabel} sign-in.`);
  }
}

/**
 * Verify a Google ID token. When the client sent a `nonce` (the web redirect
 * flow always does), it must match the token's own `nonce` claim exactly, so
 * that token cannot be replayed from elsewhere. When it did not (the native
 * iOS/Android flow via `@react-native-google-signin/google-signin`, whose
 * free tier has no nonce parameter to populate one with — there is nothing
 * client-side to check against), the nonce check is skipped and the token is
 * trusted on signature + issuer + audience + expiry alone, same as any other
 * bearer-token verification. This does not weaken anything Apple requires —
 * `verifyAppleIdToken` below always demands a nonce, unconditionally.
 */
export async function verifyGoogleIdToken(
  idToken: string,
  nonce: string | undefined,
  env: { GOOGLE_OAUTH_CLIENT_IDS?: string },
): Promise<VerifiedOAuthIdentity> {
  const audiences = splitList(env.GOOGLE_OAUTH_CLIENT_IDS);
  const payload = await verify(
    idToken,
    GOOGLE_JWKS,
    ['https://accounts.google.com', 'accounts.google.com'],
    audiences,
    'Google',
  );
  if (nonce !== undefined && payload.nonce !== nonce) {
    throw new ApiError('unauthorized', 'Could not verify the Google sign-in.');
  }
  const subject = asString(payload.sub);
  if (!subject) throw new ApiError('unauthorized', 'Could not verify the Google sign-in.');
  return {
    subject,
    email: asString(payload.email),
    emailVerified: payload.email_verified === true,
  };
}

/**
 * Verify an Apple ID token the same way. Apple always marks the email
 * verified when it is present on the token (it is either the user's real,
 * confirmed address or Apple's own private-relay address — either way Apple
 * is vouching for deliverability, which is what `emailVerified` means here).
 */
export async function verifyAppleIdToken(
  idToken: string,
  nonce: string | undefined,
  env: { APPLE_OAUTH_AUDIENCES?: string },
): Promise<VerifiedOAuthIdentity> {
  const audiences = splitList(env.APPLE_OAUTH_AUDIENCES);
  const payload = await verify(
    idToken,
    APPLE_JWKS,
    'https://appleid.apple.com',
    audiences,
    'Apple',
  );
  // Unlike Google, Apple's SDK always supplies a nonce (expo-apple-authentication
  // has no path that omits one) — a missing nonce here means a malformed or
  // tampered request, not a legitimate SDK limitation, so it is rejected
  // outright rather than silently skipped.
  if (nonce === undefined || payload.nonce !== nonce) {
    throw new ApiError('unauthorized', 'Could not verify the Apple sign-in.');
  }
  const subject = asString(payload.sub);
  if (!subject) throw new ApiError('unauthorized', 'Could not verify the Apple sign-in.');
  return {
    subject,
    email: asString(payload.email),
    emailVerified: asString(payload.email) !== null,
  };
}
