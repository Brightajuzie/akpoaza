import React, { createContext, useState, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
import apiClient, { setUnauthorizedHandler } from '../api/client';

export const AuthContext = createContext<any>(null);

export const AuthProvider = ({ children }: any) => {
  const [userToken, setUserToken] = useState<string | null>(null);
  const [userInfo, setUserInfo] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  // The logout function
  const logout = async () => {
    setIsLoading(true);
    setUserToken(null);
    setUserInfo(null);
    await SecureStore.deleteItemAsync('userToken');
    await SecureStore.deleteItemAsync('userInfo');
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
          setUserToken(token);
          setUserInfo(JSON.parse(user));
          apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
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
    setIsLoading(false);
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
