import 'react-native-gesture-handler';
import React, { useCallback, useContext, useEffect } from 'react';
import { ActivityIndicator, View, StyleSheet, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/navigation/AppNavigator';
import { AuthProvider, AuthContext } from './src/context/AuthContext';
import { CartProvider } from './src/context/CartContext';
import { SettingsProvider, SettingsContext } from './src/context/SettingsContext';
import { NetworkProvider } from './src/context/NetworkContext';
import { CurrencyProvider } from './src/context/CurrencyContext';
import NetworkBanner from './src/components/NetworkBanner';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Font from 'expo-font';
import ToastProvider from './src/components/ToastProvider';
import { StatusBar } from 'expo-status-bar';

// ── Platform-safe imports ─────────────────────────────────────────────────────
// On web, @stripe/stripe-react-native crashes at import time because it
// references native modules that don't exist in a browser environment.
// We import the mock (which returns safe no-op wrappers) on web instead.
let StripeProvider: React.ComponentType<any>;
if (Platform.OS === 'web') {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  StripeProvider = require('./src/mocks/stripe-mock').StripeProvider;
} else {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  StripeProvider = require('@stripe/stripe-react-native').StripeProvider;
}

// LinearGradient is only used on native (it breaks on web)
let LinearGradient: React.ComponentType<any> | null = null;
if (Platform.OS !== 'web') {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  LinearGradient = require('expo-linear-gradient').LinearGradient;
}

// ── Root wrapper: gradient on native, plain View on web ───────────────────────
function RootWrapper({ children }: { children: React.ReactNode }) {
  if (Platform.OS !== 'web' && LinearGradient) {
    return (
      <LinearGradient
        colors={['#0f2027', '#203a43', '#2c5364']}
        style={styles.gradient}
      >
        {children}
      </LinearGradient>
    );
  }
  return <View style={styles.gradient}>{children}</View>;
}

// ── AppContent: reads AuthContext + SettingsContext (provided above) ───────────
function AppContent() {
  const { userInfo } = useContext(AuthContext);
  const { theme, colorMode } = useContext(SettingsContext);

  // Sync web body background color with current theme
  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.body.style.backgroundColor = theme.background;
    }
  }, [theme.background]);

  return (
    <CurrencyProvider userCountry={userInfo?.country}>
      <CartProvider>
        <NetworkProvider>
          <SafeAreaProvider style={{ flex: 1, backgroundColor: theme.background }}>
            <StatusBar style={colorMode === 'dark' ? 'light' : 'dark'} />
            <NetworkBanner />
            <AppNavigator />
            <ToastProvider />
          </SafeAreaProvider>
        </NetworkProvider>
      </CartProvider>
    </CurrencyProvider>
  );
}

// ── Root App ──────────────────────────────────────────────────────────────────
export default function App() {
  const stripeKey = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY || 'pk_test_dummy_key';

  const [fontsLoaded, setFontsLoaded] = React.useState(false);

  const loadFonts = useCallback(async () => {
    try {
      await Font.loadAsync({
        Inter: require('./assets/fonts/Inter-Regular.ttf'),
        'Inter-Bold': require('./assets/fonts/Inter-Bold.ttf'),
      });
    } catch (e) {
      // Fonts are optional — app still works with system fonts
      console.warn('Font load failed, using system fonts', e);
    } finally {
      setFontsLoaded(true);
    }
  }, []);

  useEffect(() => {
    loadFonts();
  }, []);

  // Inject viewport meta + body reset for web
  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      let meta = document.querySelector('meta[name="viewport"]') as HTMLMetaElement | null;
      if (!meta) {
        meta = document.createElement('meta');
        meta.setAttribute('name', 'viewport');
        document.head.appendChild(meta);
      }
      meta.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=5, user-scalable=yes');
      document.documentElement.style.cssText = 'height:100%;min-height:100%;width:100%;';
      document.body.style.cssText = 'height:100%;min-height:100%;width:100%;margin:0;display:flex;flex-direction:column;background-color:#f8f9fa;';
    }
  }, []);

  if (!fontsLoaded) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <RootWrapper>
        <StripeProvider publishableKey={stripeKey}>
          <AuthProvider>
            <SettingsProvider>
              <AppContent />
            </SettingsProvider>
          </AuthProvider>
        </StripeProvider>
      </RootWrapper>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    width: '100%',
    minHeight: '100%',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
  },
  gradient: {
    flex: 1,
    width: '100%',
    minHeight: '100%',
  },
});
