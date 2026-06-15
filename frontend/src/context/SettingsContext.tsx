import React, { createContext, useState, useEffect } from 'react';
import { Platform } from 'react-native';
import apiClient from '../api/client';

export interface ThemeColors {
  primary: string;
  secondary: string;
  background: string;
  card: string;
  text: string;
  lightText: string;
  border: string;
}

interface SettingsContextType {
  settings: Record<string, string>;
  theme: ThemeColors;
  logoUrl: string | null;
  heroTitle: string;
  heroSubtitle: string;
  footerText: string;
  loading: boolean;
  refreshSettings: () => Promise<void>;
  updateSettings: (updates: Record<string, string>) => Promise<void>;
}

export const SettingsContext = createContext<SettingsContextType>({} as SettingsContextType);

export const SettingsProvider = ({ children }: { children: React.ReactNode }) => {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const fetchSettings = async () => {
    try {
      const response = await apiClient.get('/settings');
      setSettings(response.data);
      applyFavicon(response.data.favicon_url);
    } catch (error) {
      console.error('Failed to load settings', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const applyFavicon = (url?: string) => {
    if (Platform.OS === 'web' && url) {
      const link = (document.querySelector("link[rel*='icon']") as HTMLLinkElement) || document.createElement('link');
      link.type = 'image/x-icon';
      link.rel = 'shortcut icon';
      link.href = url;
      document.getElementsByTagName('head')[0].appendChild(link);
    }
  };

  const refreshSettings = async () => {
    await fetchSettings();
  };

  const updateSettings = async (updates: Record<string, string>) => {
    try {
      const response = await apiClient.put('/settings', updates);
      setSettings(prev => ({ ...prev, ...updates }));
      applyFavicon(updates.favicon_url || settings.favicon_url);
      return response.data;
    } catch (error) {
      console.error('Failed to update settings', error);
      throw error;
    }
  };

  // Derive theme colors from settings database with sensible defaults
  const theme: ThemeColors = {
    primary: settings.primary_color || '#007AFF',
    secondary: settings.secondary_color || '#5856D6',
    background: settings.background_color || '#F8F9FA',
    card: '#FFFFFF',
    text: '#1C1C1E',
    lightText: '#8E8E93',
    border: '#E5E5EA',
  };

  const logoUrl = settings.logo_url || null;
  const heroTitle = settings.hero_title || 'Find the Best Services & E-Commerce on FixMart';
  const heroSubtitle = settings.hero_subtitle || 'Professional services and premium equipment at your fingertips.';
  const footerText = settings.footer_text || '© 2026 FixMart. All rights reserved.';

  return (
    <SettingsContext.Provider
      value={{
        settings,
        theme,
        logoUrl,
        heroTitle,
        heroSubtitle,
        footerText,
        loading,
        refreshSettings,
        updateSettings,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
};
