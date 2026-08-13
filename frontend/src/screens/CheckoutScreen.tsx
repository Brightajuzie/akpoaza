import React, { useState, useContext, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert,
  ActivityIndicator, ScrollView, TextInput, Modal, useWindowDimensions,
} from 'react-native';
import { useStripe } from '@stripe/stripe-react-native';
import apiClient from '../api/client';
import { AuthContext } from '../context/AuthContext';
import { CartContext } from '../context/CartContext';
import { SettingsContext } from '../context/SettingsContext';
import { useCurrency } from '../context/CurrencyContext';
import PaymentWebView from '../components/PaymentWebView';

interface PaymentMethod {
  id: 'STRIPE' | 'PAYSTACK' | 'FLUTTERWAVE' | 'OPAY';
  label: string;
  icon: string;
  color: string;
  subtitle: string;
  enabledKey: string;
}

const ALL_PAYMENT_METHODS: PaymentMethod[] = [
  { id: 'STRIPE', label: 'Pay with Stripe', icon: '💳', color: '#635BFF', subtitle: 'Visa, Mastercard, AMEX', enabledKey: 'stripe_enabled' },
  { id: 'PAYSTACK', label: 'Pay with Paystack', icon: '🏦', color: '#0BA4DB', subtitle: 'Cards, Bank Transfer, USSD', enabledKey: 'paystack_enabled' },
  { id: 'FLUTTERWAVE', label: 'Pay with Flutterwave', icon: '⚡', color: '#F5A623', subtitle: 'Cards, Mobile Money, Bank', enabledKey: 'flutterwave_enabled' },
  { id: 'OPAY', label: 'Pay with OPay', icon: '🔵', color: '#03A9F4', subtitle: 'OPay Wallet, Bank Transfer', enabledKey: 'opay_enabled' },
];

export default function CheckoutScreen({ route, navigation }: any) {
  const {
    checkoutType = 'order', id: initialId, amount = 100,
    isRemainingPayment = false, isGuest = false, cartItems = [],
    bookingParams = null, parcelParams = null,
  } = route.params || {};

  const { userToken, userInfo, login } = useContext(AuthContext);
  const { clearCart } = useContext(CartContext);
  const { theme, settings, colorMode } = useContext(SettingsContext);
  const { fmt, toLocal, currency } = useCurrency();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const isDark = colorMode === 'dark';

  const { width } = useWindowDimensions();
  const isLarge = width >= 768;

  // State
  const [activeRecordId, setActiveRecordId] = useState<string | null>(initialId && initialId !== 'dummy-id' ? initialId : null);
  const [loadingProvider, setLoadingProvider] = useState<string | null>(null);
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [activeProvider, setActiveProvider] = useState<string | null>(null);
  const [isSplit, setIsSplit] = useState(false);

  // Guest inputs
  const [guestName, setGuestName] = useState(userInfo?.name || '');
  const [guestEmail, setGuestEmail] = useState(userInfo?.email || '');
  const [guestPhone, setGuestPhone] = useState(userInfo?.phone || '');
  const [guestAddress, setGuestAddress] = useState(userInfo?.address || bookingParams?.address || parcelParams?.pickupAddress || '');

  // Proximity info
  const [assignedProviderInfo, setAssignedProviderInfo] = useState<{ name?: string; distance?: number } | null>(null);

  // Post-checkout registration prompt
  const [showRegisterPrompt, setShowRegisterPrompt] = useState(false);
  const [registerPassword, setRegisterPassword] = useState('');
  const [registerLoading, setRegisterLoading] = useState(false);

  const displayAmount = isRemainingPayment ? amount : isSplit ? amount / 2 : amount;
  const localAmount = toLocal(displayAmount);

  const availableMethods = useMemo(() => {
    if (!settings || Object.keys(settings).length === 0) return ALL_PAYMENT_METHODS;
    return ALL_PAYMENT_METHODS.filter(m => settings[m.enabledKey] !== 'false');
  }, [settings]);

  const ensureRecordCreated = async (provider: string): Promise<string | null> => {
    if (activeRecordId) return activeRecordId;
    if (!userToken && (!guestName.trim() || !guestEmail.trim())) {
      Alert.alert('Details Required', 'Please enter your Full Name and Email Address to continue.');
      return null;
    }

    try {
      if (checkoutType === 'order') {
        const endpoint = userToken ? '/orders/checkout' : '/orders/guest-checkout';
        const payload: any = { items: cartItems, paymentProvider: provider, deliveryAddress: guestAddress.trim() || undefined };
        if (!userToken) { payload.guestName = guestName.trim(); payload.guestEmail = guestEmail.trim(); payload.guestPhone = guestPhone.trim(); }

        const res = await apiClient.post(endpoint, payload);
        const createdId = res.data?.order?.id;
        if (createdId) {
          setActiveRecordId(createdId); clearCart();
          if (res.data?.riderDistance !== undefined || res.data?.order?.rider?.name) {
            setAssignedProviderInfo({ name: res.data?.order?.rider?.name, distance: res.data?.riderDistance });
          }
          return createdId;
        }
      } else if (checkoutType === 'booking') {
        const endpoint = userToken ? '/bookings' : '/bookings/guest-booking';
        const payload: any = { ...bookingParams, address: guestAddress.trim() || bookingParams?.address };
        if (!userToken) { payload.guestName = guestName.trim(); payload.guestEmail = guestEmail.trim(); payload.guestPhone = guestPhone.trim(); }

        const res = await apiClient.post(endpoint, payload);
        const createdId = res.data?.id;
        if (createdId) {
          setActiveRecordId(createdId);
          if (res.data?.matchDistance !== undefined || res.data?.handyman?.name) {
            setAssignedProviderInfo({ name: res.data?.handyman?.name, distance: res.data?.matchDistance });
          }
          return createdId;
        }
      } else if (checkoutType === 'parcel') {
        const endpoint = userToken ? '/parcels/checkout' : '/parcels/guest-checkout';
        const payload: any = { ...parcelParams };
        if (!userToken) { payload.guestName = guestName.trim(); payload.guestEmail = guestEmail.trim(); payload.guestPhone = guestPhone.trim(); }

        const res = await apiClient.post(endpoint, payload);
        const createdId = res.data?.parcel?.id;
        if (createdId) {
          setActiveRecordId(createdId);
          if (res.data?.riderDistance !== undefined || res.data?.parcel?.rider?.name) {
            setAssignedProviderInfo({ name: res.data?.parcel?.rider?.name, distance: res.data?.riderDistance });
          }
          return createdId;
        }
      }
    } catch (err: any) {
      console.error('[CheckoutScreen] Record creation failed:', err);
      Alert.alert('Checkout Error', err.response?.data?.error || 'Failed to create order record.');
      return null;
    }
    return null;
  };

  const handlePaymentCompleted = (refMessage?: string) => {
    clearCart();
    if (!userToken) {
      setShowRegisterPrompt(true);
    } else {
      Alert.alert(
        '✅ Payment Successful',
        refMessage || 'Your payment was completed successfully!',
        [{ text: 'View History', onPress: () => navigation.navigate('History') }]
      );
    }
  };

  const handleRegisterPostCheckout = async () => {
    if (!registerPassword || registerPassword.length < 4) {
      Alert.alert('Password Required', 'Please enter a password of at least 4 characters.');
      return;
    }
    setRegisterLoading(true);
    try {
      const response = await apiClient.post('/auth/register', {
        email: guestEmail.trim(), name: guestName.trim(),
        phone: guestPhone.trim(), address: guestAddress.trim(),
        password: registerPassword, role: 'CUSTOMER',
      });
      const { token, user } = response.data;
      await login(token, user);
      setShowRegisterPrompt(false);
      Alert.alert('🎉 Account Created!', 'Your account has been saved and your order is linked.');
      navigation.navigate('HomeTab');
    } catch (err: any) {
      Alert.alert('Registration Error', err.response?.data?.error || 'Failed to create account.');
    } finally {
      setRegisterLoading(false);
    }
  };

  const handleStripePayment = async () => {
    setLoadingProvider('STRIPE');
    try {
      const recId = await ensureRecordCreated('STRIPE');
      if (!recId) { setLoadingProvider(null); return; }

      const response = await apiClient.post('/payments/checkout', {
        checkoutType, id: recId, provider: 'STRIPE',
        isSplit: isRemainingPayment ? true : isSplit, currency, localAmount,
      });
      const { clientSecret } = response.data;

      const initSheet = await initPaymentSheet({
        paymentIntentClientSecret: clientSecret, merchantDisplayName: 'FixMart',
      });

      if (initSheet.error) {
        Alert.alert('Setup Error', initSheet.error.message);
        setLoadingProvider(null); return;
      }

      const presentSheet = await presentPaymentSheet();
      if (presentSheet.error) {
        if (presentSheet.error.code !== 'Canceled') Alert.alert('Payment Error', presentSheet.error.message);
      } else {
        handlePaymentCompleted('Your Stripe payment was completed successfully!');
      }
    } catch (error: any) {
      Alert.alert('Stripe Unavailable', error.response?.data?.error || 'Could not initialise Stripe. Please try another payment method.');
    } finally {
      setLoadingProvider(null);
    }
  };

  const handleWebViewPayment = async (provider: 'PAYSTACK' | 'FLUTTERWAVE' | 'OPAY') => {
    setLoadingProvider(provider);
    try {
      const recId = await ensureRecordCreated(provider);
      if (!recId) { setLoadingProvider(null); return; }

      const response = await apiClient.post('/payments/checkout', {
        checkoutType, id: recId, provider,
        isSplit: isRemainingPayment ? true : isSplit, currency, localAmount,
      });

      let redirectUrl: string | null = null;
      if (provider === 'PAYSTACK') redirectUrl = response.data.authorizationUrl;
      else if (provider === 'FLUTTERWAVE') redirectUrl = response.data.paymentLink;
      else if (provider === 'OPAY') redirectUrl = response.data.authorizationUrl;

      if (redirectUrl) {
        setActiveProvider(provider);
        setPaymentUrl(redirectUrl);
      } else {
        throw new Error('No payment URL returned from server.');
      }
    } catch (error: any) {
      Alert.alert(`${provider} Unavailable`, error.response?.data?.error || `Could not initialise ${provider}.`);
      setLoadingProvider(null);
    }
  };

  const handlePaymentSuccess = (reference: string) => {
    setPaymentUrl(null); setLoadingProvider(null);
    const providerName = activeProvider; setActiveProvider(null);
    handlePaymentCompleted(`Your ${providerName} payment was completed successfully!\nReference: ${reference}`);
  };

  const handlePaymentCancel = () => {
    setPaymentUrl(null); setLoadingProvider(null); setActiveProvider(null);
    Alert.alert('Cancelled', 'Payment was cancelled. You can try again or choose another method.');
  };

  if (paymentUrl) {
    return (
      <PaymentWebView
        url={paymentUrl}
        provider={activeProvider as any}
        onPaymentSuccess={handlePaymentSuccess}
        onPaymentCancel={handlePaymentCancel}
      />
    );
  }

  const isAnyLoading = loadingProvider !== null;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC' }]}
      contentContainerStyle={[styles.contentContainer, isLarge && styles.contentContainerDesktop]}
      showsVerticalScrollIndicator={false}
    >
      {/* Account Registration Prompt Modal */}
      <Modal visible={showRegisterPrompt} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderColor: isDark ? '#334155' : '#E2E8F0' }]}>
            <Text style={styles.modalEmoji}>🎉</Text>
            <Text style={[styles.modalTitle, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>Order Confirmed!</Text>
            <Text style={[styles.modalSub, { color: isDark ? '#64748B' : '#94A3B8' }]}>
              Create a password to save your account for{' '}
              <Text style={{ fontWeight: '800', color: theme.primary }}>{guestEmail}</Text> so you can track your order live and access your history anytime.
            </Text>

            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>Create Password</Text>
              <TextInput
                style={[styles.input, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderColor: isDark ? '#334155' : '#E2E8F0', color: isDark ? '#F1F5F9' : '#0F172A' }]}
                placeholder="Enter password (min. 4 characters)..."
                value={registerPassword}
                onChangeText={setRegisterPassword}
                secureTextEntry
                placeholderTextColor={isDark ? '#475569' : '#94A3B8'}
              />
            </View>

            <TouchableOpacity
              style={[styles.modalPrimaryBtn, { backgroundColor: theme.primary }]}
              onPress={handleRegisterPostCheckout}
              disabled={registerLoading}
            >
              {registerLoading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.modalPrimaryText}>Save Account & View Order →</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.modalCancelBtn}
              onPress={() => { setShowRegisterPrompt(false); navigation.navigate('HomeTab'); }}
            >
              <Text style={[styles.modalCancelText, { color: isDark ? '#475569' : '#94A3B8' }]}>Skip for Now</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerIcon}>🔒</Text>
        <Text style={[styles.title, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>Secure Checkout</Text>
        <Text style={[styles.subtitle, { color: isDark ? '#64748B' : '#94A3B8' }]}>
          {checkoutType === 'booking' ? 'Booking Payment' : checkoutType === 'parcel' ? 'Parcel Delivery Payment' : 'Order Payment'}
        </Text>
      </View>

      {/* Guest Contact Details Card */}
      {!userToken && (
        <View style={[styles.card, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderColor: isDark ? '#334155' : '#E2E8F0' }]}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardHeaderIcon}>👤</Text>
            <Text style={[styles.cardHeaderTitle, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>Guest Contact & Delivery Details</Text>
          </View>
          <Text style={[styles.cardSubText, { color: isDark ? '#64748B' : '#94A3B8' }]}>No registration required! Enter details for delivery updates.</Text>

          <View style={styles.inputGroup}>
            <Text style={[styles.inputLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>Full Name *</Text>
            <TextInput
              style={[styles.input, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderColor: isDark ? '#334155' : '#E2E8F0', color: isDark ? '#F1F5F9' : '#0F172A' }]}
              placeholder="e.g. Jane Doe"
              value={guestName}
              onChangeText={setGuestName}
              placeholderTextColor={isDark ? '#475569' : '#94A3B8'}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.inputLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>Email Address *</Text>
            <TextInput
              style={[styles.input, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderColor: isDark ? '#334155' : '#E2E8F0', color: isDark ? '#F1F5F9' : '#0F172A' }]}
              placeholder="jane@example.com"
              value={guestEmail}
              onChangeText={setGuestEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              placeholderTextColor={isDark ? '#475569' : '#94A3B8'}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.inputLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>Phone Number</Text>
            <TextInput
              style={[styles.input, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderColor: isDark ? '#334155' : '#E2E8F0', color: isDark ? '#F1F5F9' : '#0F172A' }]}
              placeholder="+234..."
              value={guestPhone}
              onChangeText={setGuestPhone}
              keyboardType="phone-pad"
              placeholderTextColor={isDark ? '#475569' : '#94A3B8'}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.inputLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>Delivery Address</Text>
            <TextInput
              style={[styles.input, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderColor: isDark ? '#334155' : '#E2E8F0', color: isDark ? '#F1F5F9' : '#0F172A' }]}
              placeholder="Street address, City..."
              value={guestAddress}
              onChangeText={setGuestAddress}
              placeholderTextColor={isDark ? '#475569' : '#94A3B8'}
            />
          </View>
        </View>
      )}

      {/* Assigned Proximity Provider Card */}
      {assignedProviderInfo && (
        <View style={styles.proximityCard}>
          <Text style={styles.proximityIcon}>⚡</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.proximityTitle}>
              {assignedProviderInfo.name ? `Assigned: ${assignedProviderInfo.name}` : 'Nearest Provider Matched'}
            </Text>
            <Text style={styles.proximityDesc}>
              {assignedProviderInfo.distance !== undefined
                ? `Closest verified professional located ${assignedProviderInfo.distance} km away!`
                : 'A verified professional near your area has been assigned.'}
            </Text>
          </View>
        </View>
      )}

      {/* Amount Card */}
      <View style={[styles.amountCard, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderColor: isDark ? '#334155' : '#E2E8F0' }]}>
        <Text style={[styles.amountLabel, { color: isDark ? '#64748B' : '#94A3B8' }]}>
          {isRemainingPayment ? 'Remaining Amount Due (50%)' : 'Amount Due'}
        </Text>
        <Text style={[styles.amountValue, { color: theme.primary }]}>
          {fmt(displayAmount)}
        </Text>
        {isRemainingPayment && (
          <View style={styles.remainingBadge}>
            <Text style={styles.remainingBadgeText}>REMAINING BALANCE SETTLEMENT</Text>
          </View>
        )}
        <Text style={[styles.securedText, { color: isDark ? '#475569' : '#94A3B8' }]}>
          🔒 256-bit SSL Encrypted & Escrow Protected
        </Text>
      </View>

      {/* Split Payment Selector */}
      {!isRemainingPayment && (
        <View style={styles.sectionWrap}>
          <Text style={[styles.sectionLabel, { color: isDark ? '#64748B' : '#94A3B8' }]}>PAYMENT SCHEME</Text>
          <View style={styles.splitRow}>
            <TouchableOpacity
              style={[
                styles.splitTile,
                { backgroundColor: !isSplit ? theme.primary + '12' : (isDark ? '#1E293B' : '#FFFFFF'), borderColor: !isSplit ? theme.primary : (isDark ? '#334155' : '#E2E8F0') }
              ]}
              onPress={() => setIsSplit(false)}
            >
              <Text style={[styles.splitTitle, { color: !isSplit ? theme.primary : (isDark ? '#F1F5F9' : '#0F172A') }]}>Full Payment</Text>
              <Text style={[styles.splitSub, { color: isDark ? '#64748B' : '#94A3B8' }]}>Pay 100% now ({fmt(amount)})</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.splitTile,
                { backgroundColor: isSplit ? theme.primary + '12' : (isDark ? '#1E293B' : '#FFFFFF'), borderColor: isSplit ? theme.primary : (isDark ? '#334155' : '#E2E8F0') }
              ]}
              onPress={() => setIsSplit(true)}
            >
              <Text style={[styles.splitTitle, { color: isSplit ? theme.primary : (isDark ? '#F1F5F9' : '#0F172A') }]}>Split 50/50</Text>
              <Text style={[styles.splitSub, { color: isDark ? '#64748B' : '#94A3B8' }]}>Pay 50% deposit ({fmt(amount / 2)})</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Payment Methods */}
      <View style={styles.sectionWrap}>
        <Text style={[styles.sectionLabel, { color: isDark ? '#64748B' : '#94A3B8' }]}>SELECT PAYMENT METHOD</Text>

        {availableMethods.length === 0 ? (
          <View style={[styles.noGatewayCard, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderColor: isDark ? '#334155' : '#E2E8F0' }]}>
            <Text style={styles.noGatewayIcon}>⚙️</Text>
            <Text style={[styles.noGatewayTitle, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>No Payment Gateways Available</Text>
            <Text style={[styles.noGatewaySubtitle, { color: isDark ? '#64748B' : '#94A3B8' }]}>
              Please contact the administrator to enable payment methods.
            </Text>
          </View>
        ) : (
          availableMethods.map(method => {
            const isLoading = loadingProvider === method.id;
            return (
              <TouchableOpacity
                key={method.id}
                style={[
                  styles.methodCard,
                  { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderColor: isDark ? '#334155' : '#E2E8F0' },
                  isLoading && { opacity: 0.85 },
                ]}
                onPress={() => {
                  if (method.id === 'STRIPE') handleStripePayment();
                  else handleWebViewPayment(method.id);
                }}
                disabled={isAnyLoading}
                activeOpacity={0.82}
              >
                <View style={[styles.methodAccent, { backgroundColor: method.color }]} />

                <View style={styles.methodContent}>
                  <View style={[styles.methodIconWrap, { backgroundColor: method.color + '18' }]}>
                    <Text style={styles.methodIcon}>{method.icon}</Text>
                  </View>

                  <View style={styles.methodInfo}>
                    <Text style={[styles.methodLabel, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>{method.label}</Text>
                    <Text style={[styles.methodSubtitle, { color: isDark ? '#64748B' : '#94A3B8' }]}>{method.subtitle}</Text>
                  </View>

                  {isLoading ? (
                    <ActivityIndicator color={method.color} size="small" />
                  ) : (
                    <Text style={[styles.methodArrow, { color: isDark ? '#64748B' : '#94A3B8' }]}>→</Text>
                  )}
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  contentContainer: { padding: 16 },
  contentContainerDesktop: { maxWidth: 640, alignSelf: 'center', width: '100%', paddingHorizontal: 24, paddingVertical: 24 },

  header: { alignItems: 'center', marginBottom: 20, paddingTop: 8 },
  headerIcon: { fontSize: 38, marginBottom: 6 },
  title: { fontSize: 24, fontWeight: '900', letterSpacing: -0.5, marginBottom: 2 },
  subtitle: { fontSize: 13, fontWeight: '500' },

  card: { borderRadius: 18, borderWidth: 1, padding: 18, marginBottom: 14 },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  cardHeaderIcon: { fontSize: 20 },
  cardHeaderTitle: { fontSize: 16, fontWeight: '800' },
  cardSubText: { fontSize: 12, marginBottom: 14 },

  inputGroup: { marginBottom: 12 },
  inputLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 },
  input: { borderRadius: 12, borderWidth: 1.5, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14 },

  proximityCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#3B82F615', borderRadius: 16, borderWidth: 1, borderColor: '#3B82F640',
    padding: 16, marginBottom: 14,
  },
  proximityIcon: { fontSize: 28 },
  proximityTitle: { color: '#3B82F6', fontSize: 14, fontWeight: '800', marginBottom: 2 },
  proximityDesc: { color: '#64748B', fontSize: 12, lineHeight: 17 },

  amountCard: { borderRadius: 20, borderWidth: 1, padding: 22, alignItems: 'center', marginBottom: 14 },
  amountLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  amountValue: { fontSize: 36, fontWeight: '900', letterSpacing: -1, marginBottom: 8 },
  remainingBadge: { backgroundColor: '#22C55E18', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, marginBottom: 8 },
  remainingBadgeText: { color: '#22C55E', fontSize: 10, fontWeight: '800' },
  securedText: { fontSize: 11, fontWeight: '500' },

  sectionWrap: { marginBottom: 14 },
  sectionLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6, marginBottom: 8 },

  splitRow: { flexDirection: 'row', gap: 10 },
  splitTile: { flex: 1, borderRadius: 14, borderWidth: 1.5, padding: 14, gap: 2 },
  splitTitle: { fontSize: 14, fontWeight: '800' },
  splitSub: { fontSize: 11 },

  noGatewayCard: { borderRadius: 16, borderWidth: 1, padding: 24, alignItems: 'center' },
  noGatewayIcon: { fontSize: 32, marginBottom: 8 },
  noGatewayTitle: { fontSize: 16, fontWeight: '800', marginBottom: 4 },
  noGatewaySubtitle: { fontSize: 12, textAlign: 'center' },

  methodCard: {
    borderRadius: 16, borderWidth: 1, overflow: 'hidden', marginBottom: 10,
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 2,
  },
  methodAccent: { height: 3, width: '100%' },
  methodContent: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  methodIconWrap: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  methodIcon: { fontSize: 22 },
  methodInfo: { flex: 1 },
  methodLabel: { fontSize: 15, fontWeight: '800', marginBottom: 2 },
  methodSubtitle: { fontSize: 12 },
  methodArrow: { fontSize: 18, fontWeight: '700' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalCard: { width: '100%', maxWidth: 400, borderRadius: 24, padding: 28, alignItems: 'center', borderWidth: 1 },
  modalEmoji: { fontSize: 44, marginBottom: 12 },
  modalTitle: { fontSize: 22, fontWeight: '900', marginBottom: 8, textAlign: 'center' },
  modalSub: { fontSize: 14, textAlign: 'center', lineHeight: 21, marginBottom: 20 },
  modalPrimaryBtn: { width: '100%', paddingVertical: 15, borderRadius: 12, alignItems: 'center', marginBottom: 10 },
  modalPrimaryText: { color: '#FFF', fontSize: 15, fontWeight: '800' },
  modalCancelBtn: { paddingVertical: 8 },
  modalCancelText: { fontSize: 13, fontWeight: '500' },
});
