import 'react-native-gesture-handler';
import React, { useCallback, useEffect } from 'react';
import { ActivityIndicator, View, StyleSheet, Platform, useWindowDimensions } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StripeProvider } from '@stripe/stripe-react-native';
import AppNavigator from './src/navigation/AppNavigator';
import { AuthProvider } from './src/context/AuthContext';
import { CartProvider } from './src/context/CartContext';
import { SettingsProvider } from './src/context/SettingsContext';
import { NetworkProvider } from './src/context/NetworkContext';
import NetworkBanner from './src/components/NetworkBanner';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';
import * as Font from 'expo-font';

export default function App() {
  const stripeKey = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY || "pk_test_dummy_key";

  const [fontsLoaded, setFontsLoaded] = React.useState(false);

  const loadFonts = useCallback(async () => {
    await Font.loadAsync({
      Inter: require('./assets/fonts/Inter-Regular.ttf'),
      'Inter-Bold': require('./assets/fonts/Inter-Bold.ttf'),
    });
    setFontsLoaded(true);
  }, []);

  React.useEffect(() => {
    loadFonts();
  }, []);

  // Inject viewport meta tag and body styles for web
  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      // Set viewport meta tag
      let meta = document.querySelector('meta[name="viewport"]');
      if (!meta) {
        meta = document.createElement('meta');
        meta.setAttribute('name', 'viewport');
        document.head.appendChild(meta);
      }
      meta.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=5, user-scalable=yes');

      // Style body/html to center the app
      document.documentElement.style.height = '100%';
      document.documentElement.style.width = '100%';
      document.documentElement.style.overflow = 'hidden';
      document.body.style.height = '100%';
      document.body.style.width = '100%';
      document.body.style.overflow = 'hidden';
      document.body.style.margin = '0';
      document.body.style.display = 'flex';
      document.body.style.flexDirection = 'column';
      document.body.style.backgroundColor = '#f8f9fa';
    }
  }, []);

  if (!fontsLoaded) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1, width: '100%' }}>
      <LinearGradient colors={['#0f2027', '#203a43', '#2c5364']} style={styles.gradient}>
        <StripeProvider publishableKey={stripeKey}>
          <AuthProvider>
            <SettingsProvider>
              <CartProvider>
                <NetworkProvider>
                  <SafeAreaProvider>
                    <NetworkBanner />
                    <AppNavigator />
                  </SafeAreaProvider>
                </NetworkProvider>
              </CartProvider>
            </SettingsProvider>
          </AuthProvider>
        </StripeProvider>
      </LinearGradient>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  gradient: {
    flex: 1,
    width: '100%',
  },
});
