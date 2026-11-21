import React, { createContext, useState, useEffect, useCallback, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import Toast from 'react-native-toast-message';
import * as SecureStore from '../utils/storage';
import apiClient, { setUnauthorizedHandler } from '../api/client';
import { registerForPushNotificationsAsync, unregisterPushTokenAsync } from '../utils/pushNotifications';

export const AuthContext = createContext<any>(null);

const BIOMETRIC_TOKEN_KEY = 'biometric_auth_token';
const BIOMETRIC_ENABLED_KEY = 'biometric_enabled';

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
      // Clear stale biometric token so it doesn't auto-login with expired session
      await SecureStore.deleteItemAsync(BIOMETRIC_TOKEN_KEY);
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
    } catch (e) {
      console.error('[AuthContext] Error during logout', e);
    } finally {
      setIsLoading(false);
      isLoggingOutRef.current = false;
    }
  }, []);

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

          // Set the auth header first so the /me call is authenticated
          apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;

          // Validate the token against the backend to verify account status
          try {
            const meRes = await apiClient.get('/auth/me');
            const freshUser = { ...JSON.parse(user), ...meRes.data };
            setUserToken(token);
            setUserInfo(freshUser);
            await SecureStore.setItemAsync('userInfo', JSON.stringify(freshUser));
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
  }, [logout]);

  // ── Proactive Session Expiry Check on AppState Change (Resume from Background)
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active' && userToken) {
        if (isTokenExpired(userToken)) {
          console.warn('[AuthContext] Token expired while app was backgrounded — logging out.');
          logout('Your session has expired. Please log in again.');
        }
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, [userToken, logout]);

  // ── Continuous Periodic Heartbeat Check (Every 15s While App Is Open) ─────
  useEffect(() => {
    if (!userToken) return;

    const interval = setInterval(() => {
      if (isTokenExpired(userToken)) {
        console.warn('[AuthContext] Session expired during active usage — logging out.');
        logout('Your session has expired. Please log in again.');
      }
    }, 15000);

    return () => clearInterval(interval);
  }, [userToken, logout]);

  // ── Login Function ────────────────────────────────────────────────────────
  const login = async (token: string, user: any) => {
    setIsLoading(true);
    setUserToken(token);
    setUserInfo(user);
    await SecureStore.setItemAsync('userToken', token);
    await SecureStore.setItemAsync('userInfo', JSON.stringify(user));
    apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    // Register device for push notifications in background
    registerForPushNotificationsAsync().catch(() => {});
    setIsLoading(false);
    Toast.show({ type: 'success', text1: 'Login successful' });
  };

  // ── Refresh User Info ─────────────────────────────────────────────────────
  const refreshUser = async () => {
    if (!userToken) return null;
    if (isTokenExpired(userToken)) {
      logout('Your session has expired. Please log in again.');
      return null;
    }
    try {
      const response = await apiClient.get('/auth/me');
      const updatedUser = response.data;
      const mergedUser = { ...userInfo, ...updatedUser };
      setUserInfo(mergedUser);
      await SecureStore.setItemAsync('userInfo', JSON.stringify(mergedUser));
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
        isTokenExpired: () => isTokenExpired(userToken),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
