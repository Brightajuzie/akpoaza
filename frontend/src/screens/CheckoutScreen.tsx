import React, { useState, useContext } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Alert, ActivityIndicator, ScrollView
} from 'react-native';
import { useStripe } from '@stripe/stripe-react-native';
import apiClient from '../api/client';
import { SettingsContext } from '../context/SettingsContext';
import PaymentWebView from '../components/PaymentWebView';

interface PaymentMethod {
  id: 'STRIPE' | 'PAYSTACK' | 'FLUTTERWAVE' | 'OPAY';
  label: string;
  icon: string;
  color: string;
  subtitle: string;
}

const PAYMENT_METHODS: PaymentMethod[] = [
  {
    id: 'STRIPE',
    label: 'Pay with Stripe',
    icon: '💳',
    color: '#635BFF',
    subtitle: 'Visa, Mastercard, American Express',
  },
  {
    id: 'PAYSTACK',
    label: 'Pay with Paystack',
    icon: '🏦',
    color: '#0BA4DB',
    subtitle: 'Cards, Bank Transfer, USSD',
  },
  {
    id: 'FLUTTERWAVE',
    label: 'Pay with Flutterwave',
    icon: '⚡',
    color: '#F5A623',
    subtitle: 'Cards, Mobile Money, Bank',
  },
  {
    id: 'OPAY',
    label: 'Pay with OPay',
    icon: '🔵',
    color: '#03A9F4',
    subtitle: 'OPay Wallet, Bank Transfer',
  },
];

export default function CheckoutScreen({ route, navigation }: any) {
  const { checkoutType = 'order', id = 'dummy-id', amount = 100, isRemainingPayment = false } = route.params || {};
  const [loadingProvider, setLoadingProvider] = useState<string | null>(null);
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [activeProvider, setActiveProvider] = useState<string | null>(null);
  const [isSplit, setIsSplit] = useState(false);

  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const { theme } = useContext(SettingsContext);

  // ── Stripe (native SDK) ───────────────────────────────────────────────────
  const handleStripePayment = async () => {
    setLoadingProvider('STRIPE');
    try {
      const response = await apiClient.post('/payments/checkout', {
        checkoutType,
        id,
        provider: 'STRIPE',
        isSplit: isRemainingPayment ? true : isSplit,
      });
      const { clientSecret } = response.data;

      const initSheet = await initPaymentSheet({
        paymentIntentClientSecret: clientSecret,
        merchantDisplayName: 'Handyman E-commerce',
      });

      if (initSheet.error) {
        Alert.alert('Setup Error', initSheet.error.message);
        return;
      }

      const presentSheet = await presentPaymentSheet();
      if (presentSheet.error) {
        if (presentSheet.error.code !== 'Canceled') {
          Alert.alert('Payment Error', presentSheet.error.message);
        }
      } else {
        Alert.alert('✅ Payment Successful', 'Your Stripe payment was completed successfully!');
        navigation.navigate('HomeTab');
      }
    } catch (error: any) {
      console.error('[CheckoutScreen] Stripe error:', error);
      Alert.alert(
        'Stripe Unavailable',
        error.response?.data?.error || 'Could not initialise Stripe. Please try another payment method.'
      );
    } finally {
      setLoadingProvider(null);
    }
  };

  // ── WebView-based gateways (Paystack, Flutterwave, OPay) ─────────────────
  const handleWebViewPayment = async (provider: 'PAYSTACK' | 'FLUTTERWAVE' | 'OPAY') => {
    setLoadingProvider(provider);
    try {
      const response = await apiClient.post('/payments/checkout', {
        checkoutType,
        id,
        provider,
        isSplit: isRemainingPayment ? true : isSplit,
      });

      let redirectUrl: string | null = null;

      if (provider === 'PAYSTACK') {
        redirectUrl = response.data.authorizationUrl;
      } else if (provider === 'FLUTTERWAVE') {
        redirectUrl = response.data.paymentLink;
      } else if (provider === 'OPAY') {
        redirectUrl = response.data.authorizationUrl;
      }

      if (redirectUrl) {
        setActiveProvider(provider);
        setPaymentUrl(redirectUrl);
      } else {
        throw new Error('No payment URL returned from server.');
      }
    } catch (error: any) {
      console.error(`[CheckoutScreen] ${provider} error:`, error);
      Alert.alert(
        `${provider} Unavailable`,
        error.response?.data?.error || `Could not initialise ${provider}. Please try another payment method.`
      );
      setLoadingProvider(null);
    }
  };

  // ── WebView success/cancel ────────────────────────────────────────────────
  const handlePaymentSuccess = () => {
    setPaymentUrl(null);
    setLoadingProvider(null);
    setActiveProvider(null);
    Alert.alert(
      '✅ Payment Successful',
      `Your ${activeProvider} payment was completed successfully!`,
      [{ text: 'Continue', onPress: () => navigation.navigate('HomeTab') }]
    );
  };

  const handlePaymentCancel = () => {
    setPaymentUrl(null);
    setLoadingProvider(null);
    setActiveProvider(null);
    Alert.alert('Cancelled', 'Payment was cancelled. You can try again or choose another method.');
  };

  // ── WebView renderer ──────────────────────────────────────────────────────
  if (paymentUrl) {
    return (
      <PaymentWebView
        url={paymentUrl}
        onPaymentSuccess={handlePaymentSuccess}
        onPaymentCancel={handlePaymentCancel}
      />
    );
  }

  const isAnyLoading = loadingProvider !== null;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerIcon}>🛒</Text>
        <Text style={[styles.title, { color: theme.text }]}>Secure Checkout</Text>
        <Text style={[styles.subtitle, { color: theme.lightText }]}>
          {checkoutType === 'booking' ? 'Booking Payment' : 'Order Payment'}
        </Text>
      </View>

      {/* Amount Card */}
      <View style={[styles.amountCard, { borderColor: theme.border }]}>
        <Text style={[styles.amountLabel, { color: theme.lightText }]}>
          {isRemainingPayment ? 'Remaining Amount Due (50%)' : 'Amount Due'}
        </Text>
        <Text style={[styles.amountValue, { color: theme.primary }]}>
          ₦{(isRemainingPayment ? amount : (isSplit ? amount / 2 : amount)).toFixed(2)}
        </Text>
        {isRemainingPayment && (
          <View style={[styles.badge, { backgroundColor: '#E8F5E9', marginBottom: 12 }]}>
            <Text style={{ color: '#34C759', fontWeight: '800', fontSize: 10 }}>REMAINING BALANCE SETTLEMENT</Text>
          </View>
        )}
        <View style={styles.securedRow}>
          <Text style={[styles.securedText, { color: theme.lightText }]}>
            🔒 256-bit SSL encrypted transaction
          </Text>
        </View>
      </View>

      {/* Disclaimer Card */}
      <View style={styles.disclaimerCard}>
        <Text style={styles.disclaimerText}>
          ⚠️ <Text style={{ fontWeight: '700' }}>Payment Warning:</Text> Always complete payments through this app to keep your funds secured in escrow. The company is not liable for any payments made outside this platform.
        </Text>
      </View>

      {/* Split Payment Selector (Only if not remaining payment) */}
      {!isRemainingPayment && (
        <View style={styles.splitSelectorContainer}>
          <Text style={[styles.methodsLabel, { color: theme.lightText, marginBottom: 8 }]}>
            PAYMENT SCHEME
          </Text>
          <View style={styles.splitOptionsRow}>
            <TouchableOpacity 
              style={[
                styles.splitOptionCard, 
                !isSplit && styles.splitOptionActive, 
                !isSplit && { borderColor: theme.primary }
              ]}
              onPress={() => setIsSplit(false)}
            >
              <Text style={[styles.splitOptionTitle, !isSplit && { color: theme.primary }]}>Full Payment</Text>
              <Text style={styles.splitOptionDesc}>Pay 100% upfront (₦{amount.toFixed(2)})</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[
                styles.splitOptionCard, 
                isSplit && styles.splitOptionActive, 
                isSplit && { borderColor: theme.primary }
              ]}
              onPress={() => setIsSplit(true)}
            >
              <Text style={[styles.splitOptionTitle, isSplit && { color: theme.primary }]}>Split 50/50</Text>
              <Text style={styles.splitOptionDesc}>Pay 50% deposit now (₦{(amount / 2).toFixed(2)})</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Payment Methods */}
      <Text style={[styles.methodsLabel, { color: theme.lightText }]}>
        SELECT PAYMENT METHOD
      </Text>

      {PAYMENT_METHODS.map(method => {
        const isLoading = loadingProvider === method.id;

        return (
          <TouchableOpacity
            key={method.id}
            style={[
              styles.methodCard,
              { borderColor: theme.border },
              isLoading && { opacity: 0.85 },
            ]}
            onPress={() => {
              if (method.id === 'STRIPE') {
                handleStripePayment();
              } else {
                handleWebViewPayment(method.id);
              }
            }}
            disabled={isAnyLoading}
            activeOpacity={0.75}
          >
            {/* Color accent bar */}
            <View style={[styles.methodAccent, { backgroundColor: method.color }]} />

            <View style={styles.methodContent}>
              <View style={[styles.methodIconWrap, { backgroundColor: method.color + '18' }]}>
                <Text style={styles.methodIcon}>{method.icon}</Text>
              </View>

              <View style={styles.methodInfo}>
                <Text style={[styles.methodLabel, { color: theme.text }]}>{method.label}</Text>
                <Text style={[styles.methodSubtitle, { color: theme.lightText }]}>
                  {method.subtitle}
                </Text>
              </View>

              {isLoading ? (
                <ActivityIndicator color={method.color} size="small" />
              ) : (
                <Text style={[styles.methodArrow, { color: theme.lightText }]}>›</Text>
              )}
            </View>
          </TouchableOpacity>
        );
      })}

      {/* Footer note */}
      <View style={styles.footer}>
        <Text style={[styles.footerText, { color: theme.lightText }]}>
          All payment gateways are PCI-DSS compliant. Your card details are never stored on our servers.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  contentContainer: { padding: 24, paddingBottom: 60 },

  header: { alignItems: 'center', marginBottom: 28 },
  headerIcon: { fontSize: 44, marginBottom: 10 },
  title: { fontSize: 26, fontWeight: '800', marginBottom: 4 },
  subtitle: { fontSize: 14, fontWeight: '500' },

  amountCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    marginBottom: 28,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },
  amountLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },
  amountValue: { fontSize: 42, fontWeight: '900', marginBottom: 12 },
  securedRow: { flexDirection: 'row', alignItems: 'center' },
  securedText: { fontSize: 12, fontWeight: '500' },

  methodsLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 14,
    textTransform: 'uppercase',
  },

  methodCard: {
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 14,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  methodAccent: { height: 3, width: '100%' },
  methodContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  methodIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  methodIcon: { fontSize: 22 },
  methodInfo: { flex: 1 },
  methodLabel: { fontSize: 15, fontWeight: '700', marginBottom: 3 },
  methodSubtitle: { fontSize: 12, fontWeight: '500' },
  methodArrow: { fontSize: 24, fontWeight: '300', marginLeft: 8 },

  footer: { marginTop: 24, alignItems: 'center' },
  footerText: { fontSize: 11, textAlign: 'center', lineHeight: 16, maxWidth: '85%' },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  disclaimerCard: {
    backgroundColor: 'rgba(255, 59, 48, 0.06)',
    borderColor: 'rgba(255, 59, 48, 0.15)',
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 24,
  },
  disclaimerText: {
    fontSize: 12.5,
    color: '#D32F2F',
    lineHeight: 18,
    textAlign: 'center',
  },
  splitSelectorContainer: {
    marginBottom: 24,
  },
  splitOptionsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  splitOptionCard: {
    flex: 1,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E5E5EA',
    backgroundColor: '#FFFFFF',
  },
  splitOptionActive: {
    backgroundColor: '#FFFFFF',
  },
  splitOptionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#8E8E93',
    marginBottom: 4,
  },
  splitOptionDesc: {
    fontSize: 11,
    color: '#8E8E93',
    fontWeight: '500',
  },
});
