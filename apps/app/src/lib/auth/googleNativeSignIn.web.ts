/**
 * Web variant of `./googleNativeSignIn` — Metro picks this file automatically
 * on the `web` platform via the `.web.ts` extension, so the real
 * `@react-native-google-signin/google-signin` package (whose own bundled web
 * shim has a known Metro resolver bug in this pnpm monorepo) is never
 * imported into the web bundle at all. Google sign-in on web uses the
 * separate `expo-auth-session` redirect flow in `./oauth.ts` instead — these
 * exports exist only so `oauth.ts` can import this module unconditionally.
 */
/** Always false on web — this module is never reached (see doc comment above). */
export function isGoogleNativeSignInAvailable(): boolean {
  return false;
}

export function configureGoogleSignIn(_params: {
  webClientId: string;
  iosClientId?: string;
}): void {
  // No-op — web never calls this; `signInWithGoogle` branches to the
  // expo-auth-session flow before reaching anything in this module.
}

export type NativeGoogleResult = { idToken: string; displayName?: string } | null;

export async function signInWithGoogleNativeSdk(): Promise<NativeGoogleResult> {
  throw new Error('Native Google sign-in is not available on web.');
}
