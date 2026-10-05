/**
 * "Continue with Google" / "Continue with Apple" — native, on-device sign-in
 * that hands the Worker a signed ID token to verify (see
 * `apps/worker/src/lib/oauth.ts`). PANDAM never sees, stores or transmits a
 * Google/Apple password; the provider authenticates the person entirely on
 * their own device/browser, and all we receive back is a token.
 *
 * Apple and Google-on-web generate a random `nonce` and thread it through so
 * the ID token cannot be a replay of one issued for a different sign-in
 * attempt (the Worker checks the token's `nonce` claim against this exact
 * value — see `@pandam/validation#oauthLoginSchema`). Google on iOS/Android
 * has no nonce to send (see `signInWithGoogleNative` below) — the Worker
 * treats that as "no nonce supplied" and verifies the token on signature +
 * issuer + audience + expiry alone, exactly as it does for any other
 * provider call that genuinely cannot supply one.
 *
 * WHY EACH FLOW LOOKS DIFFERENT:
 *  - Google on iOS/Android uses `@react-native-google-signin/google-signin`
 *    — Google's own native SDK, the current Expo-recommended approach. This
 *    is a native module: it is NOT available in Expo Go and requires a
 *    custom development or production build (`expo-dev-client` / EAS Build).
 *    This is intentional — PANDAM targets a real build, not Expo Go, for
 *    Google sign-in. On `web` there is no native SDK to call, so that
 *    platform keeps the `expo-auth-session` system-browser redirect flow,
 *    which is the correct approach for web regardless.
 *  - Apple sign-in is only meaningful on Apple platforms and Apple requires
 *    it be presented as their own native button/sheet — that is
 *    `expo-apple-authentication`, a native module, same dev-build
 *    requirement as Google above. `isAppleSignInAvailable()` lets the UI
 *    hide the button rather than fail when it is missing.
 */
import * as AppleAuthentication from 'expo-apple-authentication';
import * as AuthSession from 'expo-auth-session';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { clientEnv } from '@/lib/env';
import {
  configureGoogleSignIn,
  isGoogleNativeSignInAvailable,
  signInWithGoogleNativeSdk,
} from '@/lib/auth/googleNativeSignIn';

// Lets a web redirect-back tab close itself and hand control back to the app.
// A no-op on native. Safe to call once at module load.
WebBrowser.maybeCompleteAuthSession();

/**
 * Configure the native Google SDK once before the first `signIn()` call.
 * Idempotent and cheap (the wrapper itself tracks "already configured"), so
 * every call site can call it unconditionally.
 */
function ensureGoogleConfigured(): void {
  const iosClientId = clientEnv.googleOAuthClientId.ios;
  const webClientId = clientEnv.googleOAuthClientId.web;
  if (!webClientId) {
    // webClientId is what makes Google sign the returned ID token's `aud`
    // claim as a value our Worker can verify — without it `signIn()`
    // resolves with no idToken at all, which would fail silently later.
    throw new Error('Google sign-in is not configured for this build yet.');
  }
  configureGoogleSignIn({ webClientId, iosClientId: iosClientId ?? undefined });
}

export type OAuthSignInResult = {
  idToken: string;
  /** Absent only for Google's native iOS/Android flow — see module doc. */
  nonce?: string;
  displayName?: string;
} | null; // null = the user cancelled/dismissed — not an error.

async function randomNonce(): Promise<string> {
  const bytes = await Crypto.getRandomBytesAsync(24);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Best-effort read of the Google ID token's `name` claim, purely for a nicer
 * default display name on a brand-new account. This does NOT verify the
 * token — the Worker does that from scratch — so a forged value here can, at
 * worst, put a silly name on an account the forger already fully controls.
 */
function unsafeReadName(idToken: string): string | undefined {
  try {
    const payloadB64 = idToken.split('.')[1];
    if (!payloadB64) return undefined;
    const json = atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(json) as { name?: unknown };
    return typeof payload.name === 'string' && payload.name.trim()
      ? payload.name.trim()
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Google sign-in on `web`: the `expo-auth-session` system-browser redirect
 * flow. Requires `EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB`.
 */
async function signInWithGoogleOnWeb(): Promise<OAuthSignInResult> {
  const clientId = clientEnv.googleOAuthClientId.web;
  if (!clientId) {
    throw new Error('Google sign-in is not configured for this build yet.');
  }

  const discovery = await AuthSession.fetchDiscoveryAsync('https://accounts.google.com');
  const redirectUri = AuthSession.makeRedirectUri({ path: 'oauthredirect' });
  const nonce = await randomNonce();

  const request = new AuthSession.AuthRequest({
    clientId,
    redirectUri,
    responseType: AuthSession.ResponseType.IdToken,
    scopes: ['openid', 'profile', 'email'],
    extraParams: { nonce },
  });

  const result = await request.promptAsync(discovery);
  if (result.type === 'dismiss' || result.type === 'cancel') return null;
  if (result.type !== 'success' || typeof result.params.id_token !== 'string') {
    throw new Error(result.type === 'error' ? result.error?.message : 'Google sign-in failed.');
  }

  const idToken = result.params.id_token;
  return { idToken, nonce, displayName: unsafeReadName(idToken) };
}

/**
 * Google sign-in on iOS (PANDAM's actual target platform for this flow):
 * Google's native Sign-In SDK via `@react-native-google-signin/google-signin`
 * — the account picker is a native system sheet, not a browser tab. This is
 * the production path; it requires a development or production build (not
 * Expo Go) because it is a native module.
 *
 * No nonce is generated or sent here: this library's `SignInParams` has no
 * nonce field at all (checked against the installed version's own type
 * definitions — there is nothing to populate one with, not an oversight).
 * The Worker's `verifyGoogleIdToken` is built to accept that: no nonce
 * supplied means the token is verified on signature + issuer + audience +
 * expiry alone, same as any bearer token.
 */
async function signInWithGoogleNative(): Promise<OAuthSignInResult> {
  ensureGoogleConfigured();
  // Cancellation is handled inside the wrapper (resolves `null`); any other
  // rejection propagates to the caller as-is.
  return signInWithGoogleNativeSdk();
}

export async function signInWithGoogle(): Promise<OAuthSignInResult> {
  return Platform.OS === 'web' ? signInWithGoogleOnWeb() : signInWithGoogleNative();
}

/**
 * True when Google sign-in can actually work right now: on `web` that just
 * means a client id is configured; on iOS/Android it ALSO requires the
 * native module to be linked, which it never is in Expo Go — only in a
 * development or production build. Lets the UI tell a real "needs a
 * development build" situation apart from a plain "not configured" one.
 */
export function isGoogleSignInAvailable(): boolean {
  if (Platform.OS === 'web') return clientEnv.googleOAuthClientId.web !== null;
  return isGoogleNativeSignInAvailable() && clientEnv.googleOAuthClientId.web !== null;
}

/** True only where Apple's native sign-in sheet can actually appear. */
export async function isAppleSignInAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    // Thrown when the native module isn't linked at all (plain Expo Go) —
    // the caller should treat this exactly like "not available".
    return false;
  }
}

/**
 * Apple's native sign-in sheet. `fullName` is handed back ONLY on the very
 * first authorization for this app — capture it into `displayName` right
 * here, because it is gone on every subsequent sign-in.
 */
export async function signInWithApple(): Promise<OAuthSignInResult> {
  const rawNonce = await randomNonce();
  // Apple requires the *hashed* nonce in the request; the ID token it returns
  // then carries that same hashed value in its `nonce` claim — so the value
  // we compare against later is the hash, not `rawNonce`.
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);

  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });
  } catch (err) {
    const code = (err as { code?: string } | null)?.code;
    if (code === 'ERR_REQUEST_CANCELED') return null;
    throw err;
  }

  if (!credential.identityToken) {
    throw new Error('Apple did not return a usable sign-in token.');
  }

  const displayName = credential.fullName
    ? [credential.fullName.givenName, credential.fullName.familyName].filter(Boolean).join(' ')
    : undefined;

  return {
    idToken: credential.identityToken,
    nonce: hashedNonce,
    displayName: displayName || undefined,
  };
}
