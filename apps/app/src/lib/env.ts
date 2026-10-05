/**
 * Client environment. Only `EXPO_PUBLIC_*` values are readable in the bundle;
 * none of these are secret. Parsed once here so the rest of the app gets a
 * typed object instead of touching `process.env` directly.
 */
import Constants from 'expo-constants';

type ClientEnv = {
  apiUrl: string;
  wsUrl: string;
  env: 'development' | 'preview' | 'production';
  sentryDsn: string | null;
  posthogKey: string | null;
  posthogHost: string;
  /**
   * OAuth *client* ids — not secrets, they are meant to be embedded in the
   * app bundle (the security boundary is server-side ID-token verification,
   * see `apps/worker/src/lib/oauth.ts`). `null` cleanly disables that
   * provider's sign-in button rather than sending a request that can only
   * fail. See `@/lib/auth/oauth` for how each is used.
   */
  googleOAuthClientId: {
    /**
     * Web OAuth client — used two ways: (1) the redirect-based
     * `expo-auth-session` flow on the `web` platform itself, and (2) as
     * `webClientId` passed to `GoogleSignin.configure()` on iOS/Android,
     * which is what makes the native SDK return an ID token at all (Google
     * signs that token's `aud` claim as the web client, by design — it is
     * the client your *server* verifies against, see
     * `GOOGLE_OAUTH_CLIENT_IDS` in `apps/worker/.dev.vars`).
     */
    web: string | null;
    /**
     * iOS OAuth client — passed as `iosClientId` to `GoogleSignin.configure()`.
     * Required only on iOS; unused on web/Android. Must match the
     * `iosUrlScheme` (reversed client id) configured in `app.json`'s
     * `@react-native-google-signin/google-signin` plugin entry.
     */
    ios: string | null;
  };
};

/** Worker port used by `pnpm dev:worker`. */
const DEV_API_PORT = 8787;

/**
 * Host the JS bundle was served from — `192.168.0.4` on a phone running Expo
 * Go, `localhost` in a web browser.
 *
 * Deriving the dev API host this way (instead of pinning one value in `.env`)
 * is what lets the same build talk to the Worker from both surfaces: a phone
 * cannot reach `localhost`, and a desktop browser often cannot reach the LAN
 * address. Hard-coding either one breaks the other.
 */
function devHost(): string | null {
  const hostUri =
    Constants.expoConfig?.hostUri ??
    (Constants.expoGoConfig as { debuggerHost?: string } | undefined)?.debuggerHost ??
    null;
  const host = hostUri?.split(':')[0]?.trim();
  return host ? host : null;
}

function required(value: string | undefined, fallback: string): string {
  return value && value.length > 0 ? value : fallback;
}

const derivedHost = devHost() ?? 'localhost';

export const clientEnv: ClientEnv = {
  apiUrl: required(process.env.EXPO_PUBLIC_API_URL, `http://${derivedHost}:${DEV_API_PORT}`),
  wsUrl: required(process.env.EXPO_PUBLIC_WS_URL, `ws://${derivedHost}:${DEV_API_PORT}`),
  env: (process.env.EXPO_PUBLIC_ENV as ClientEnv['env']) || 'development',
  sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN || null,
  posthogKey: process.env.EXPO_PUBLIC_POSTHOG_KEY || null,
  posthogHost: required(process.env.EXPO_PUBLIC_POSTHOG_HOST, 'https://us.i.posthog.com'),
  googleOAuthClientId: {
    web: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB || null,
    ios: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS || null,
  },
};
