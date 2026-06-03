import 'react-native-gesture-handler';
import React, { useCallback } from 'react';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
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

  if (!fontsLoaded) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
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
  },
});
