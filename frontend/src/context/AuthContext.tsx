import React, { createContext, useState, useEffect } from 'react';
import Toast from 'react-native-toast-message';
import * as SecureStore from '../utils/storage';
import apiClient, { setUnauthorizedHandler } from '../api/client';
import { registerForPushNotificationsAsync, unregisterPushTokenAsync } from '../utils/pushNotifications';

export const AuthContext = createContext<any>(null);

const BIOMETRIC_TOKEN_KEY = 'biometric_auth_token';
const BIOMETRIC_ENABLED_KEY = 'biometric_enabled';

export const AuthProvider = ({ children }: any) => {
  const [userToken, setUserToken] = useState<string | null>(null);
  const [userInfo, setUserInfo] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  // The logout function
  const logout = async () => {
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
    setIsLoading(false);
  };

  useEffect(() => {
    // Register the unauthorized handler to cleanly log out on 401/403
    setUnauthorizedHandler(logout);

    const loadToken = async () => {
      try {
        const token = await SecureStore.getItemAsync('userToken');
        const user = await SecureStore.getItemAsync('userInfo');
        if (token && user) {
          // Set the auth header first so the /me call is authenticated
          apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;

          // Validate the token against the backend — catches deleted/banned accounts
          // and expired tokens that somehow persisted on disk.
          try {
            const meRes = await apiClient.get('/auth/me');
            const freshUser = { ...JSON.parse(user), ...meRes.data };
            setUserToken(token);
            setUserInfo(freshUser);
            await SecureStore.setItemAsync('userInfo', JSON.stringify(freshUser));
            // Register device for push notifications in background
            registerForPushNotificationsAsync().catch(() => {});
          } catch (validationErr: any) {
            // Token is invalid (401/403) or user no longer exists — clear everything
            const status = validationErr?.response?.status;
            if (status === 401 || status === 403 || status === 404) {
              console.warn('[AuthContext] Stored token is invalid/expired — logging out.');
              setUserToken(null);
              setUserInfo(null);
              await SecureStore.deleteItemAsync('userToken');
              await SecureStore.deleteItemAsync('userInfo');
              await SecureStore.deleteItemAsync(BIOMETRIC_TOKEN_KEY);
              await SecureStore.setItemAsync(BIOMETRIC_ENABLED_KEY, 'false');
              delete apiClient.defaults.headers.common['Authorization'];
            } else {
              // Network error / server down — trust the cached session and carry on
              console.warn('[AuthContext] Could not validate token (network issue) — using cached session.');
              setUserToken(token);
              setUserInfo(JSON.parse(user));
            }
          }
        }
      } catch (e) {
        console.error('Failed to load token', e);
      } finally {
        setIsLoading(false);
      }
    };
    loadToken();
  }, []);

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

  const refreshUser = async () => {
    if (!userToken) return null;
    try {
      const response = await apiClient.get('/auth/me');
      const updatedUser = response.data;
      // Merge keys or overwrite
      const mergedUser = { ...userInfo, ...updatedUser };
      setUserInfo(mergedUser);
      await SecureStore.setItemAsync('userInfo', JSON.stringify(mergedUser));
      return mergedUser;
    } catch (e) {
      console.error('Failed to refresh user info', e);
      return null;
    }
  };

  return (
    <AuthContext.Provider value={{ login, logout, refreshUser, userToken, userInfo, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
};
