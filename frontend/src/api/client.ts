import axios, { AxiosError } from 'axios';
import { Platform, NativeModules } from 'react-native';
import Constants from 'expo-constants';

// ---------------------------------------------------------------------------
// URL resolution – Multi-strategy approach for all device/platform combos
// ---------------------------------------------------------------------------
const getBackendURL = (): string => {
  const envURL = process.env.EXPO_PUBLIC_API_URL;

  // Priority 1: Use explicitly defined environment variable if it exists
  if (envURL) {
    console.log('[ApiClient] Using EXPO_PUBLIC_API_URL:', envURL);
    return envURL;
  }

  // --- Web Platform ---
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') {
      const url = `http://${window.location.hostname}:5000/api`;
      console.log('[ApiClient] Web mode, using window.location.hostname:', url);
      return url;
    }
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
          return 'http://172.20.10.2:5000/api';
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
  timeout: 15_000,
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
// Response interceptor – human-readable diagnostics + 401 handling
// ---------------------------------------------------------------------------
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
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
    // ── Network unreachable ──────────────────────────────────────────────────
    } else if (
      error.message === 'Network Error' ||
      error.code === 'ERR_NETWORK' ||
      error.code === 'ECONNREFUSED'
    ) {
      const platform = Platform.OS;
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
        `  3. android.usesCleartextTraffic = true  (already set in app.json)\n` +
        `  4. Resolved baseURL → ${baseURL}`
      );
    }

    return Promise.reject(error);
  }
);

export default apiClient;
