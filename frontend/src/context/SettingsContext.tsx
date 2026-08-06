import React, { createContext, useState, useEffect, useCallback } from 'react';
import { Platform, Appearance, ColorSchemeName } from 'react-native';
import apiClient from '../api/client';
import * as Storage from '../utils/storage';

export interface ThemeColors {
  primary: string;
  secondary: string;
  background: string;
  card: string;
  text: string;
  lightText: string;
  border: string;
}

export type ColorMode = 'light' | 'dark';

interface SettingsContextType {
  settings: Record<string, string>;
  theme: ThemeColors;
  colorMode: ColorMode;
  toggleColorMode: () => void;
  logoUrl: string | null;
  heroTitle: string;
  heroSubtitle: string;
  footerText: string;
  apkUrl: string;
  loading: boolean;
  refreshSettings: () => Promise<void>;
  updateSettings: (updates: Record<string, string>) => Promise<void>;
}

export const SettingsContext = createContext<SettingsContextType>({} as SettingsContextType);

const COLOR_MODE_KEY = 'fixmart_color_mode';

/** Build theme palettes using admin-configured accent colours */
function buildTheme(
  mode: ColorMode,
  primary: string,
  secondary: string,
): ThemeColors {
  if (mode === 'dark') {
    return {
      primary,
      secondary,
      background: '#0D0D0F',
      card:       '#1C1C1E',
      text:       '#F2F2F7',
      lightText:  '#8E8E93',
      border:     '#2C2C2E',
    };
  }
  return {
    primary,
    secondary,
    background: '#F8F9FA',
    card:       '#FFFFFF',
    text:       '#1C1C1E',
    lightText:  '#6E6E73',
    border:     '#E5E5EA',
  };
}

export const SettingsProvider = ({ children }: { children: React.ReactNode }) => {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  // ── Color Mode ─────────────────────────────────────────────────────────────
  const [colorMode, setColorMode] = useState<ColorMode>(() => {
    // Start with system preference synchronously; will be overridden by
    // persisted preference once it loads from storage.
    const systemScheme: ColorSchemeName = Appearance.getColorScheme();
    return systemScheme === 'dark' ? 'dark' : 'light';
  });

  // Load persisted preference on mount
  useEffect(() => {
    (async () => {
      try {
        const saved = await Storage.getItemAsync(COLOR_MODE_KEY);
        if (saved === 'dark' || saved === 'light') {
          setColorMode(saved);
        }
      } catch {
        // Silently ignore — system default already applied
      }
    })();
  }, []);

  const toggleColorMode = useCallback(async () => {
    const next: ColorMode = colorMode === 'light' ? 'dark' : 'light';
    setColorMode(next);
    try {
      await Storage.setItemAsync(COLOR_MODE_KEY, next);
    } catch {
      // ignore storage errors
    }
  }, [colorMode]);

  // ── Settings fetch ──────────────────────────────────────────────────────────
  const fetchSettings = async () => {
    try {
      const response = await apiClient.get('/settings');
      setSettings(response.data);
      applyFavicon(response.data.favicon_url || response.data.logo_url);
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
      const link =
        (document.querySelector("link[rel*='icon']") as HTMLLinkElement) ||
        document.createElement('link');
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
      applyFavicon(
        updates.favicon_url || updates.logo_url || settings.favicon_url || settings.logo_url,
      );
      return response.data;
    } catch (error) {
      console.error('Failed to update settings', error);
      throw error;
    }
  };

  // ── Derived values ──────────────────────────────────────────────────────────
  const primary   = settings.primary_color   || '#007AFF';
  const secondary = settings.secondary_color || '#5856D6';

  const theme = buildTheme(colorMode, primary, secondary);

  const logoUrl      = settings.logo_url      || null;
  const heroTitle    = settings.hero_title    || 'Find the Best Services & E-Commerce on FixMart';
  const heroSubtitle = settings.hero_subtitle || 'Professional services and premium equipment at your fingertips.';
  const footerText   = settings.footer_text   || '© 2026 FixMart. All rights reserved.';
  const apkUrl       = settings.apk_url       || '/fixmart-latest.apk';

  return (
    <SettingsContext.Provider
      value={{
        settings,
        theme,
        colorMode,
        toggleColorMode,
        logoUrl,
        heroTitle,
        heroSubtitle,
        footerText,
        apkUrl,
        loading,
        refreshSettings,
        updateSettings,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
};
