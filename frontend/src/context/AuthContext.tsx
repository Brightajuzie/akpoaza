import React, { createContext, useState, useEffect, useCallback, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import Toast from 'react-native-toast-message';
import * as SecureStore from '../utils/storage';
import apiClient, { setUnauthorizedHandler, setActivityHandler } from '../api/client';
import { registerForPushNotificationsAsync, unregisterPushTokenAsync } from '../utils/pushNotifications';
import { resetToLogin } from '../navigation/navigationRef';

export const AuthContext = createContext<any>(null);

const BIOMETRIC_TOKEN_KEY = 'biometric_auth_token';
const BIOMETRIC_ENABLED_KEY = 'biometric_enabled';
const SESSION_LAST_ACTIVE_KEY = 'session_last_active_timestamp';

// Inactivity timeout: 60 minutes of zero user/network activity while logged in
const INACTIVITY_TIMEOUT_MS = 60 * 60 * 1000;

/**
 * Robust, cross-platform base64url decoder.
 * Works uniformly on Web, Android, and iOS without external dependencies.
 */
function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  if (typeof atob === 'function') {
    return atob(base64);
  }
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  let output = '';
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < base64.length; i++) {
    const c = base64.charAt(i);
    if (c === '=') break;
    const idx = chars.indexOf(c);
    if (idx === -1) continue;
    buffer = (buffer << 6) | idx;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output += String.fromCharCode((buffer >> bits) & 0xff);
    }
  }
  return output;
}

/**
 * Checks whether a JWT session token has expired.
 * Compares current timestamp against the token's payload `exp` claim with a 5-second buffer.
 */
export const isTokenExpired = (token: string | null): boolean => {
  if (!token || typeof token !== 'string') return true;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return true;
    const jsonPayload = base64UrlDecode(parts[1]);
    const decoded = JSON.parse(jsonPayload);
    if (!decoded || typeof decoded.exp !== 'number') return false;
    // exp is in seconds, Date.now() is in milliseconds. 5000ms buffer to prevent edge-case race conditions.
    return Date.now() >= decoded.exp * 1000 - 5000;
  } catch (e) {
    console.warn('[AuthContext] Error decoding token expiry:', e);
    return true;
  }
};

export const AuthProvider = ({ children }: any) => {
  const [userToken, setUserToken] = useState<string | null>(null);
  const [userInfo, setUserInfo] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const isLoggingOutRef = useRef(false);
  const lastActiveRef = useRef<number>(Date.now());

  // ── Touch / Record Activity to Reset Idle Timer ───────────────────────────
  const touchSession = useCallback(() => {
    const now = Date.now();
    lastActiveRef.current = now;
    SecureStore.setItemAsync(SESSION_LAST_ACTIVE_KEY, String(now)).catch(() => {});
  }, []);

  // Register touch session handler with apiClient to keep session active during requests
  useEffect(() => {
    setActivityHandler(touchSession);
  }, [touchSession]);

  // ── Logout Function ───────────────────────────────────────────────────────
  // Clears credentials, storage, push tokens, and notifies user if session expired
  const logout = useCallback(async (reason?: string) => {
    if (isLoggingOutRef.current) return;
    isLoggingOutRef.current = true;

    try {
      setIsLoading(true);
      // Unregister push token before deleting user token
      await unregisterPushTokenAsync().catch(() => {});
      setUserToken(null);
      setUserInfo(null);

      await SecureStore.deleteItemAsync('userToken');
      await SecureStore.deleteItemAsync('userInfo');
      await SecureStore.deleteItemAsync(BIOMETRIC_TOKEN_KEY);
      await SecureStore.deleteItemAsync(SESSION_LAST_ACTIVE_KEY);
      await SecureStore.setItemAsync(BIOMETRIC_ENABLED_KEY, 'false');
      delete apiClient.defaults.headers.common['Authorization'];

      if (reason) {
        Toast.show({
          type: 'error',
          text1: 'Session Expired',
          text2: typeof reason === 'string' ? reason : 'Your session has expired. Please log in again.',
          visibilityTime: 4000,
        });
      }

      // Automatically reset navigation and bring the user to Login screen
      resetToLogin();
    } catch (e) {
      console.error('[AuthContext] Error during logout', e);
    } finally {
      setIsLoading(false);
      isLoggingOutRef.current = false;
    }
  }, []);

  // ── Check Session Validity (Token Expiry & Idle Timeout) ─────────────────
  const checkSessionValidity = useCallback(async () => {
    if (!userToken) return true;

    // 1. Check if token itself has expired
    if (isTokenExpired(userToken)) {
      console.warn('[AuthContext] Token expired — automatically logging off user.');
      await logout('Your session has expired. Please log in again.');
      return false;
    }

    // 2. Check if inactivity timeout exceeded
    const lastActiveStr = await SecureStore.getItemAsync(SESSION_LAST_ACTIVE_KEY).catch(() => null);
    const lastActive = lastActiveStr ? parseInt(lastActiveStr, 10) : lastActiveRef.current;
    if (lastActive && Date.now() - lastActive > INACTIVITY_TIMEOUT_MS) {
      console.warn('[AuthContext] Session timed out due to inactivity — automatically logging off.');
      await logout('Your session timed out due to inactivity. Please log in again.');
      return false;
    }

    return true;
  }, [userToken, logout]);

  // ── Register 401/403 API Response Handler ──────────────────────────────────
  useEffect(() => {
    setUnauthorizedHandler((reason) => {
      logout(reason || 'Your session has expired. Please log in again.');
    });
  }, [logout]);

  // ── Initial Token & Session Loading on App Launch ─────────────────────────
  useEffect(() => {
    const loadToken = async () => {
      try {
        const token = await SecureStore.getItemAsync('userToken');
        const user = await SecureStore.getItemAsync('userInfo');

        if (token && user) {
          // Check if the stored token is already expired before making network requests
          if (isTokenExpired(token)) {
            console.warn('[AuthContext] Stored session token is expired — logging out immediately.');
            await logout('Your session has expired. Please log in again.');
            return;
          }

          // Check if previous session timed out from inactivity while app was closed
          const lastActiveStr = await SecureStore.getItemAsync(SESSION_LAST_ACTIVE_KEY).catch(() => null);
          if (lastActiveStr) {
            const lastActive = parseInt(lastActiveStr, 10);
            if (lastActive && Date.now() - lastActive > INACTIVITY_TIMEOUT_MS) {
              console.warn('[AuthContext] Stored session exceeded inactivity threshold — logging out.');
              await logout('Your session timed out due to inactivity. Please log in again.');
              return;
            }
          }

          // Set the auth header first so the /me call is authenticated
          apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;

          // Validate the token against the backend to verify account status
          try {
            const meRes = await apiClient.get('/auth/me');
            const freshUser = { ...JSON.parse(user), ...meRes.data };
            setUserToken(token);
            setUserInfo(freshUser);
            await SecureStore.setItemAsync('userInfo', JSON.stringify(freshUser));
            touchSession();
            // Register device for push notifications in background
            registerForPushNotificationsAsync().catch(() => {});
          } catch (validationErr: any) {
            const status = validationErr?.response?.status;
            if (status === 401 || status === 403 || status === 404) {
              console.warn('[AuthContext] Backend rejected token — session expired or account revoked.');
              await logout('Your session has expired. Please log in again.');
            } else {
              // Network error / server cold start — trust the local non-expired session
              console.warn('[AuthContext] Network issue validating token — using cached valid session.');
              setUserToken(token);
              setUserInfo(JSON.parse(user));
              touchSession();
            }
          }
        }
      } catch (e) {
        console.error('[AuthContext] Failed to load token', e);
      } finally {
        setIsLoading(false);
      }
    };

    loadToken();
  }, [logout, touchSession]);

  // ── Proactive Session Expiry Check on AppState Change (Resume from Background)
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active' && userToken) {
        checkSessionValidity();
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, [userToken, checkSessionValidity]);

  // ── Continuous Periodic Heartbeat Check (Every 15s While App Is Open) ─────
  useEffect(() => {
    if (!userToken) return;

    const interval = setInterval(() => {
      checkSessionValidity();
    }, 15000);

    return () => clearInterval(interval);
  }, [userToken, checkSessionValidity]);

  // ── Login Function ────────────────────────────────────────────────────────
  const login = async (token: string, user: any) => {
    setIsLoading(true);
    setUserToken(token);
    setUserInfo(user);
    await SecureStore.setItemAsync('userToken', token);
    await SecureStore.setItemAsync('userInfo', JSON.stringify(user));
    touchSession();
    apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    // Register device for push notifications in background
    registerForPushNotificationsAsync().catch(() => {});
    setIsLoading(false);
    Toast.show({ type: 'success', text1: 'Login successful' });
  };

  // ── Refresh User Info ─────────────────────────────────────────────────────
  const refreshUser = async () => {
    if (!userToken) return null;
    const isValid = await checkSessionValidity();
    if (!isValid) return null;

    try {
      const response = await apiClient.get('/auth/me');
      const updatedUser = response.data;
      const mergedUser = { ...userInfo, ...updatedUser };
      setUserInfo(mergedUser);
      await SecureStore.setItemAsync('userInfo', JSON.stringify(mergedUser));
      touchSession();
      return mergedUser;
    } catch (e) {
      console.error('[AuthContext] Failed to refresh user info', e);
      return null;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        login,
        logout,
        refreshUser,
        userToken,
        userInfo,
        isLoading,
        touchSession,
        checkSessionValidity,
        isTokenExpired: () => isTokenExpired(userToken),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
