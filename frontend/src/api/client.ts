import axios, { AxiosError } from 'axios';
import { Platform, NativeModules } from 'react-native';
import Constants from 'expo-constants';

// ---------------------------------------------------------------------------
// URL resolution – Multi-strategy approach for all device/platform combos
// ---------------------------------------------------------------------------
const getBackendURL = (): string => {
  const envURL = process.env.EXPO_PUBLIC_API_URL;

  // ── Priority 1: Always respect an explicit env var (works for ALL platforms) ──
  // This is the correct production URL set in Vercel / EAS / .env
  if (envURL) {
    console.log('[ApiClient] Using EXPO_PUBLIC_API_URL:', envURL);
    return envURL;
  }

  // On Android emulators, default to 10.0.2.2 to connect to the local PC backend
  if (Platform.OS === 'android') {
    const fingerprint = (Platform.constants as any)?.Fingerprint ?? '';
    const brand      = (Platform.constants as any)?.Brand      ?? '';
    const model      = (Platform.constants as any)?.Model      ?? '';
    const hardware   = (Platform.constants as any)?.Hardware   ?? '';

    const isEmulator =
      fingerprint.startsWith('generic') ||
      brand.toLowerCase().startsWith('generic') ||
      model.includes('google_sdk') ||
      model.includes('Emulator') ||
      model.includes('Android SDK built for x86') ||
      hardware.includes('goldfish') ||
      hardware.includes('ranchu');

    if (isEmulator) {
      console.log('[ApiClient] Android emulator detected → auto-routing local requests to http://10.0.2.2:5000/api');
      return 'http://10.0.2.2:5000/api';
    }
  }

  // --- Web Platform (no EXPO_PUBLIC_API_URL set — local dev only) ---
  if (Platform.OS === 'web') {
    // Only use window.location in local dev (localhost / LAN IP)
    if (typeof window !== 'undefined') {
      const host = window.location.hostname;
      // Never proxy through the production Vercel domain to a local port
      const isLocalHost = host === 'localhost' || host === '127.0.0.1' || /^192\.168\.|^10\.|^172\.(1[6-9]|2\d|3[01])\./.test(host);
      if (isLocalHost) {
        const url = `http://${host}:5000/api`;
        console.log('[ApiClient] Web local dev mode, using window.location.hostname:', url);
        return url;
      }
    }
    // Production web with no env var — hard-coded fallback so nothing breaks
    console.warn('[ApiClient] ⚠️  EXPO_PUBLIC_API_URL not set on web. Falling back to localhost. Set this in Vercel env vars.');
    return 'http://localhost:5000/api';
  }

  // --- Mobile (Native) ---
  if (__DEV__) {
    // Strategy A: expo-constants hostUri (most reliable for Expo Go Wi-Fi connections)
    // This is populated when running via `expo start` on a LAN connection
    const expoHostUri = Constants.expoConfig?.hostUri || (Constants as any).manifest?.debuggerHost;
    if (expoHostUri) {
      const ip = expoHostUri.split(':')[0];
      if (ip && ip !== 'localhost' && ip !== '127.0.0.1') {
        const url = `http://${ip}:5000/api`;
        console.log('[ApiClient] Resolved from expo-constants hostUri:', url);
        return url;
      }
    }

    // Strategy B: SourceCode scriptURL (available in RN Metro bundler)
    const scriptURL = (NativeModules as any).SourceCode?.scriptURL as string | undefined;
    if (scriptURL) {
      const match = scriptURL.match(/^https?:\/\/([^:/]+)/);
      if (match) {
        const ip = match[1];

        // LAN IP from scriptURL
        if (ip !== 'localhost' && ip !== '127.0.0.1') {
          const url = `http://${ip}:5000/api`;
          console.log('[ApiClient] Resolved from scriptURL LAN IP:', url);
          return url;
        }

        // Localhost-served bundle → differentiate emulator vs physical
        if (Platform.OS === 'android') {
          const fingerprint = (Platform.constants as any)?.Fingerprint ?? '';
          const brand      = (Platform.constants as any)?.Brand      ?? '';
          const model      = (Platform.constants as any)?.Model      ?? '';
          const hardware   = (Platform.constants as any)?.Hardware   ?? '';

          const isEmulator =
            fingerprint.startsWith('generic') ||
            brand.toLowerCase().startsWith('generic') ||
            model.includes('google_sdk') ||
            model.includes('Emulator') ||
            model.includes('Android SDK built for x86') ||
            hardware.includes('goldfish') ||
            hardware.includes('ranchu');

          if (isEmulator) {
            console.log('[ApiClient] Android emulator detected → using 10.0.2.2');
            return 'http://10.0.2.2:5000/api';
          }

          // Physical Android via USB (requires `adb reverse tcp:5000 tcp:5000`)
          console.warn(
            '[ApiClient] ⚠️  Physical Android device detected.\n' +
            'Tip A: Run  adb reverse tcp:5000 tcp:5000  (USB tethering)\n' +
            'Tip B: Set  EXPO_PUBLIC_API_URL=http://<YOUR-PC-LAN-IP>:5000/api  in frontend/.env'
          );
          // Fall through to production URL — do NOT hardcode a personal hotspot IP here
        }

        // iOS Simulator: localhost works natively
        console.log('[ApiClient] iOS simulator → using localhost');
        return 'http://localhost:5000/api';
      }
    }
  }

  // Fallback for production / non-dev builds if no env var was provided
  const fallback = Platform.OS === 'android' ? 'http://10.0.2.2:5000/api' : 'http://localhost:5000/api';
  console.log('[ApiClient] Using fallback baseURL:', fallback);
  return fallback;
};

// ---------------------------------------------------------------------------
// Axios instance
// ---------------------------------------------------------------------------
const baseURL = getBackendURL();
console.log('[ApiClient] ✅ Resolved baseURL:', baseURL);

const apiClient = axios.create({
  baseURL,
  // 30 s gives Render.com free-tier backends enough time to cold-start
  // (free instances spin down after ~15 min of inactivity and need up to
  //  ~50 s to wake up before serving the first request).
  timeout: 30_000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// ---------------------------------------------------------------------------
// 401 / logout handler
// ---------------------------------------------------------------------------
let _unauthorizedHandler: (() => void) | null = null;

export const setUnauthorizedHandler = (handler: () => void): void => {
  _unauthorizedHandler = handler;
};

// ---------------------------------------------------------------------------
// Request interceptor – attach a retry counter so the response interceptor
// can attempt one automatic retry on transient network failures.
// ---------------------------------------------------------------------------
apiClient.interceptors.request.use((config: any) => {
  // Initialise the retry counter on the first attempt
  if (config._retryCount === undefined) {
    config._retryCount = 0;
  }
  return config;
});

// ---------------------------------------------------------------------------
// Response interceptor – human-readable diagnostics + 401 handling + retry
// ---------------------------------------------------------------------------
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const url = `${error.config?.baseURL ?? ''}${error.config?.url ?? ''}`;

    // ── 401 / 403 – token expired or revoked ────────────────────────────────
    if (error.response?.status === 401 || error.response?.status === 403) {
      console.warn(
        `[ApiClient] ${error.response.status} on ${url} – token invalid/expired. ` +
        'Clearing auth header and triggering logout.'
      );
      delete apiClient.defaults.headers.common['Authorization'];
      if (_unauthorizedHandler) {
        _unauthorizedHandler();
      }
      return Promise.reject(error);
    }

    // ── Timeout ──────────────────────────────────────────────────────────────
    if (error.code === 'ECONNABORTED') {
      console.error(
        `[ApiClient] Request timed out after 15 s.\n` +
        `URL: ${url}\n` +
        `Ensure the backend is running and reachable from this device.`
      );
    // ── Network unreachable / cold-start retry ───────────────────────────────
    } else if (
      error.message === 'Network Error' ||
      error.code === 'ERR_NETWORK' ||
      error.code === 'ECONNREFUSED' ||
      error.code === 'ECONNABORTED'
    ) {
      const platform = Platform.OS;
      const config: any = error.config;

      // Automatic single retry — handles Render.com free-tier cold starts where
      // the first request lands while the dyno is still waking up.
      if (config && config._retryCount < 1) {
        config._retryCount += 1;
        console.warn(
          `[ApiClient] ⚠️  Transient network error (${error.code}) — retrying (attempt ${config._retryCount})…\n` +
          `URL: ${url}`
        );
        // Wait 3 s before retrying so the server has more time to wake up
        await new Promise<void>((resolve) => setTimeout(resolve, 3000));
        return apiClient(config);
      }

      console.error(
        `[ApiClient] ❌ Network Error — server unreachable.\n` +
        `Failed URL : ${url}\n` +
        `Platform   : ${platform}\n\n` +
        `Fix checklist:\n` +
        `  1. Is the backend running?  →  cd backend && npm run dev\n` +
        (platform === 'android'
          ? `  2. Android emulator?  →  URL should start with http://10.0.2.2:5000\n` +
            `     Physical device (USB)?  →  run: adb reverse tcp:5000 tcp:5000\n` +
            `     Physical device (Wi-Fi)? →  set EXPO_PUBLIC_API_URL=http://<PC-LAN-IP>:5000/api\n`
          : platform === 'ios'
          ? `  2. iOS simulator  →  URL should be http://localhost:5000\n` +
            `     Physical iPhone (Wi-Fi)? →  set EXPO_PUBLIC_API_URL=http://<PC-LAN-IP>:5000/api\n`
          : `  2. Web browser  →  URL should match window.location.hostname:5000\n`) +
        `  3. android.usesCleartextTraffic = true  (required for local HTTP dev)\n` +
        `  4. Resolved baseURL → ${baseURL}`
      );
    }

    return Promise.reject(error);
  }
);

export const getSocketURL = (): string => {
  return baseURL.replace(/\/api\/?$/, '');
};

/**
 * Resolves any image URL (relative, local disk fallback, or remote Cloudinary URL)
 * into a valid image URI that loads across Web, Android, and iOS.
 */
export const getImageUri = (url?: string | null): string | null => {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('file:')
  ) {
    if (Platform.OS !== 'web' && (trimmed.includes('localhost:5000') || trimmed.includes('127.0.0.1:5000'))) {
      const origin = baseURL.replace(/\/api\/?$/, '');
      return trimmed.replace(/http:\/\/(localhost|127\.0\.0\.1):5000/, origin);
    }
    return trimmed;
  }
  if (trimmed.startsWith('/')) {
    const origin = baseURL.replace(/\/api\/?$/, '');
    return `${origin}${trimmed}`;
  }
  return trimmed;
};

export default apiClient;

