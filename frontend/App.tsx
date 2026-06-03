import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StripeProvider } from '@stripe/stripe-react-native';
import AppNavigator from './src/navigation/AppNavigator';
import { AuthProvider } from './src/context/AuthContext';
import { CartProvider } from './src/context/CartContext';
import { SettingsProvider } from './src/context/SettingsContext';

export default function App() {
  const stripeKey = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY || "pk_test_dummy_key";

  return (
    <StripeProvider publishableKey={stripeKey}>
      <AuthProvider>
        <SettingsProvider>
          <CartProvider>
            <SafeAreaProvider>
              <AppNavigator />
            </SafeAreaProvider>
          </CartProvider>
        </SettingsProvider>
      </AuthProvider>
    </StripeProvider>
  );
}
