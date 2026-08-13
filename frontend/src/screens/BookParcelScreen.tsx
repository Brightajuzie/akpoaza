import React, { useState, useEffect, useContext } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, ActivityIndicator, Alert, KeyboardAvoidingView,
  Platform, useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import AddressInput from '../components/AddressInput';
import { AuthContext } from '../context/AuthContext';
import { SettingsContext } from '../context/SettingsContext';
import { useCurrency } from '../context/CurrencyContext';
import apiClient from '../api/client';

const PARCEL_SIZES = [
  { label: 'Documents', icon: '📄', desc: 'Letters, papers' },
  { label: 'Small Box', icon: '📦', desc: 'Up to 5 kg' },
  { label: 'Medium Box', icon: '🗃️', desc: '5 – 20 kg' },
  { label: 'Heavy Item', icon: '🪨', desc: '20 kg+' },
];

const HOW_IT_WORKS = [
  { icon: '📍', step: 'Enter pickup & drop-off locations' },
  { icon: '💸', step: 'Get an instant price quote' },
  { icon: '✅', step: 'Book & a rider gets assigned nearby' },
  { icon: '📡', step: 'Track your delivery live on the map' },
];

export default function BookParcelScreen({ route, navigation }: any) {
  const { theme, colorMode } = useContext(SettingsContext) || {};
  const isDark = colorMode === 'dark';
  const { userToken } = useContext(AuthContext);
  const { fmt } = useCurrency();
  const { width } = useWindowDimensions();
  const isLarge = width >= 768;

  const safeTheme = theme || {
    primary: '#22A45D', background: '#F8FAFC',
    card: '#FFFFFF', text: '#0F172A',
    border: '#E2E8F0',
  };

  // ── Form State ────────────────────────────────────────────────────────────
  const [pickupAddress, setPickupAddress] = useState('');
  const [dropoffAddress, setDropoffAddress] = useState('');
  const [pickupLat, setPickupLat] = useState<number | null>(null);
  const [pickupLng, setPickupLng] = useState<number | null>(null);
  const [dropoffLat, setDropoffLat] = useState<number | null>(null);
  const [dropoffLng, setDropoffLng] = useState<number | null>(null);
  const [parcelDescription, setParcelDescription] = useState('');
  const [parcelSize, setParcelSize] = useState('');
  const [descFocused, setDescFocused] = useState(false);

  const [quote, setQuote] = useState<{
    price: number; distanceKm: string;
    durationMins: number | null; routeType: 'road' | 'straight-line';
    baseFare: number; perKmRate: number;
  } | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // ── Pre-fill from route params ────────────────────────────────────────────
  useEffect(() => {
    if (!route?.params) return;
    const { pickupAddress: pA, dropoffAddress: dA, pickupLat: pLat, pickupLng: pLng, dropoffLat: dLat, dropoffLng: dLng, parcelDescription: pDesc, parcelSize: pSize } = route.params;
    if (pA) setPickupAddress(pA);
    if (dA) setDropoffAddress(dA);
    if (pLat !== undefined) setPickupLat(pLat);
    if (pLng !== undefined) setPickupLng(pLng);
    if (dLat !== undefined) setDropoffLat(dLat);
    if (dLng !== undefined) setDropoffLng(dLng);
    if (pDesc) setParcelDescription(pDesc);
    if (pSize) setParcelSize(pSize);
    if (pLat && pLng && dLat && dLng) {
      (async () => {
        setQuoteLoading(true);
        try {
          const res = await apiClient.post('/parcels/quote', { pickupLat: pLat, pickupLng: pLng, dropoffLat: dLat, dropoffLng: dLng });
          setQuote(res.data);
        } catch { /* silent */ } finally { setQuoteLoading(false); }
      })();
    }
  }, [route?.params]);

  useEffect(() => {
    if (userToken && route.params?.autoProceed && quote && pickupAddress.trim() && dropoffAddress.trim()) {
      navigation.setParams({ autoProceed: undefined });
      handleBook();
    }
  }, [userToken, route.params?.autoProceed, quote]);

  // ── Geocode ────────────────────────────────────────────────────────────────
  const geocodeAddress = async (address: string): Promise<{ lat: number; lng: number }> => {
    try {
      const q = address.toLowerCase().includes('nigeria') ? address : `${address}, Nigeria`;
      const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1`, { headers: { 'User-Agent': 'FixMartApp/1.0' } });
      const data = await res.json();
      if (data?.length > 0) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    } catch { /* silent */ }
    return { lat: 6.5244, lng: 3.3792 };
  };

  // ── Get Quote ──────────────────────────────────────────────────────────────
  const handleGetQuote = async () => {
    if (!pickupAddress.trim() || !dropoffAddress.trim()) {
      return Alert.alert('Missing Info', 'Please enter both pickup and drop-off addresses.');
    }
    setQuoteLoading(true); setQuote(null);
    try {
      let pLat = pickupLat, pLng = pickupLng;
      let dLat = dropoffLat, dLng = dropoffLng;
      if (!pLat || !pLng) { const c = await geocodeAddress(pickupAddress); pLat = c.lat; pLng = c.lng; setPickupLat(pLat); setPickupLng(pLng); }
      if (!dLat || !dLng) {
        const c = await geocodeAddress(dropoffAddress);
        if (c.lat === pLat && c.lng === pLng) { dLat = c.lat + 0.035; dLng = c.lng + 0.025; }
        else { dLat = c.lat; dLng = c.lng; }
        setDropoffLat(dLat); setDropoffLng(dLng);
      }
      const res = await apiClient.post('/parcels/quote', { pickupLat: pLat, pickupLng: pLng, dropoffLat: dLat, dropoffLng: dLng });
      setQuote(res.data);
    } catch { Alert.alert('Error', 'Could not calculate a quote. Please check your connection and try again.'); }
    finally { setQuoteLoading(false); }
  };

  // ── Process Booking ────────────────────────────────────────────────────────
  const processBooking = async (paymentChoice: 'ONLINE' | 'WALLET' | 'CASH', confirmedQuote: NonNullable<typeof quote>) => {
    setSubmitting(true);
    try {
      const description = parcelSize ? `${parcelSize}${parcelDescription ? ' – ' + parcelDescription : ''}` : parcelDescription;
      const res = await apiClient.post('/parcels/checkout', {
        pickupAddress, dropoffAddress,
        pickupLat, pickupLng, dropoffLat, dropoffLng,
        parcelDescription: description || undefined,
        paymentProvider: 'NONE',
      });
      const parcelId = res.data?.parcel?.id;
      if (paymentChoice === 'ONLINE' && parcelId) {
        navigation.navigate('Checkout', { checkoutType: 'parcel', id: parcelId, amount: confirmedQuote.price });
      } else {
        Alert.alert('✅ Delivery Booked!',
          `Your parcel is on its way!\n\n📍 From: ${pickupAddress}\n📍 To: ${dropoffAddress}\n💰 Total: ${fmt(confirmedQuote.price)}\n\nA verified rider will be assigned shortly.`,
          [{ text: 'View My Deliveries', onPress: () => navigation.navigate('History', { tab: 'parcels' }) }]
        );
      }
    } catch (e: any) {
      Alert.alert('Booking Failed', e?.response?.data?.error || 'Something went wrong. Please try again.');
    } finally { setSubmitting(false); }
  };

  const handleBook = async () => {
    if (!pickupAddress.trim() || !dropoffAddress.trim()) {
      return Alert.alert('Address Required', 'Please enter both your pickup and drop-off addresses.');
    }
    if (!quote || !pickupLat || !pickupLng || !dropoffLat || !dropoffLng) {
      return Alert.alert('Get a Quote First', 'Please calculate a price quote before booking.');
    }
    const description = parcelSize ? `${parcelSize}${parcelDescription ? ' – ' + parcelDescription : ''}` : parcelDescription;
    if (!userToken) {
      navigation.navigate('Checkout', {
        checkoutType: 'parcel', isGuest: true,
        parcelParams: { pickupAddress, dropoffAddress, pickupLat, pickupLng, dropoffLat, dropoffLng, parcelDescription: description || undefined },
        amount: quote.price,
      });
      return;
    }
    const confirmedQuote = quote;
    Alert.alert('💳 Select Payment Method',
      `Delivery Fee: ${fmt(confirmedQuote.price)}\n📍 ${pickupAddress} → ${dropoffAddress}`,
      [
        { text: '💳 Pay Online (Card / Bank)', onPress: () => processBooking('ONLINE', confirmedQuote) },
        { text: '👛 Pay with Wallet', onPress: () => processBooking('WALLET', confirmedQuote) },
        { text: '💵 Pay on Delivery', onPress: () => processBooking('CASH', confirmedQuote) },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: isDark ? '#0F172A' : '#F8FAFC' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[styles.scroll, isLarge && styles.scrollDesktop]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Hero ──────────────────────────────────────────────────────────── */}
        <LinearGradient
          colors={isDark ? ['#0F172A', '#1E293B'] : ['#F0FFF4', '#ECFDF5']}
          style={styles.hero}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        >
          <View style={[styles.heroDecor, { backgroundColor: safeTheme.primary + '12' }]} />
          <View style={styles.heroContent}>
            <View style={[styles.heroIconWrap, { backgroundColor: safeTheme.primary + '20' }]}>
              <Text style={styles.heroIcon}>🚚</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.heroTitle, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>Book a Delivery Rider</Text>
              <Text style={[styles.heroSub, { color: isDark ? '#64748B' : '#64748B' }]}>
                Fast & secure parcel delivery by verified riders near you
              </Text>
            </View>
          </View>
        </LinearGradient>

        {/* ── How it Works ──────────────────────────────────────────────────── */}
        <View style={[styles.card, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderColor: isDark ? '#334155' : '#E2E8F0' }]}>
          <Text style={[styles.cardTitle, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>How it works</Text>
          {HOW_IT_WORKS.map((item, i) => (
            <View key={i} style={styles.stepRow}>
              <View style={[styles.stepBubble, { backgroundColor: safeTheme.primary + '18' }]}>
                <Text style={styles.stepBubbleText}>{i + 1}</Text>
              </View>
              <Text style={styles.stepIcon}>{item.icon}</Text>
              <Text style={[styles.stepText, { color: isDark ? '#94A3B8' : '#64748B' }]}>{item.step}</Text>
            </View>
          ))}
        </View>

        {/* ── Address Inputs ─────────────────────────────────────────────────── */}
        <View style={[styles.card, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderColor: isDark ? '#334155' : '#E2E8F0' }]}>
          <Text style={[styles.cardTitle, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>📍 Delivery Route</Text>

          <View style={styles.routeViz}>
            <View style={[styles.routeDot, { backgroundColor: '#22C55E' }]} />
            <View style={[styles.routeLine, { backgroundColor: isDark ? '#334155' : '#E2E8F0' }]} />
            <View style={[styles.routeDot, { backgroundColor: '#EF4444' }]} />
          </View>

          <View style={styles.addressInputsWrap}>
            <AddressInput
              label="📍 Pickup Address"
              onAddressChange={(addr, lat, lng) => { setPickupAddress(addr); setPickupLat(lat); setPickupLng(lng); setQuote(null); }}
              initialValue={pickupAddress}
              showGps={true}
              countryCode="ng"
            />
            <View style={{ height: 12 }} />
            <AddressInput
              label="🏁 Drop-off Address"
              onAddressChange={(addr, lat, lng) => { setDropoffAddress(addr); setDropoffLat(lat); setDropoffLng(lng); setQuote(null); }}
              initialValue={dropoffAddress}
              showGps={false}
              countryCode="ng"
            />
          </View>
        </View>

        {/* ── Parcel Details ─────────────────────────────────────────────────── */}
        <View style={[styles.card, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderColor: isDark ? '#334155' : '#E2E8F0' }]}>
          <Text style={[styles.cardTitle, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>📦 Parcel Details</Text>

          <Text style={[styles.fieldLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>Size / Weight Category</Text>
          <View style={styles.sizeGrid}>
            {PARCEL_SIZES.map(s => {
              const selected = parcelSize === s.label;
              return (
                <TouchableOpacity
                  key={s.label}
                  style={[
                    styles.sizeTile,
                    { backgroundColor: selected ? safeTheme.primary : (isDark ? '#0F172A' : '#F8FAFC'), borderColor: selected ? safeTheme.primary : (isDark ? '#334155' : '#E2E8F0') }
                  ]}
                  onPress={() => setParcelSize(selected ? '' : s.label)}
                  activeOpacity={0.82}
                >
                  <Text style={styles.sizeTileIcon}>{s.icon}</Text>
                  <Text style={[styles.sizeTileLabel, { color: selected ? '#FFF' : (isDark ? '#F1F5F9' : '#0F172A') }]}>{s.label}</Text>
                  <Text style={[styles.sizeTileDesc, { color: selected ? 'rgba(255,255,255,0.75)' : (isDark ? '#475569' : '#94A3B8') }]}>{s.desc}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={[styles.fieldLabel, { color: isDark ? '#94A3B8' : '#64748B', marginTop: 16 }]}>Description (optional)</Text>
          <TextInput
            style={[
              styles.textArea,
              { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderColor: descFocused ? safeTheme.primary : (isDark ? '#334155' : '#E2E8F0'), color: isDark ? '#F1F5F9' : '#0F172A' }
            ]}
            placeholder="e.g. Fragile – handle with care, return items..."
            placeholderTextColor={isDark ? '#475569' : '#94A3B8'}
            value={parcelDescription}
            onChangeText={setParcelDescription}
            onFocus={() => setDescFocused(true)}
            onBlur={() => setDescFocused(false)}
            multiline numberOfLines={3}
            textAlignVertical="top"
          />
        </View>

        {/* ── Get Quote Button ───────────────────────────────────────────────── */}
        <TouchableOpacity
          style={[styles.quoteBtn, { backgroundColor: isDark ? '#3B82F6' : '#1D4ED8', opacity: quoteLoading ? 0.8 : 1 }]}
          onPress={handleGetQuote}
          disabled={quoteLoading}
          activeOpacity={0.85}
        >
          {quoteLoading ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <>
              <Text style={styles.quoteBtnText}>🧮 Calculate Price Quote</Text>
              <Text style={styles.quoteBtnSub}>Instant route-based pricing</Text>
            </>
          )}
        </TouchableOpacity>

        {/* ── Quote Result Card ──────────────────────────────────────────────── */}
        {quote && (
          <View style={[styles.quoteCard, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderColor: safeTheme.primary }]}>
            <LinearGradient
              colors={isDark ? ['#0F2C18', '#1A5C32'] : ['#F0FDF4', '#DCFCE7']}
              style={styles.quoteCardHeader}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            >
              <View style={[styles.routeTypeBadge, { backgroundColor: quote.routeType === 'road' ? '#22C55E' : '#F59E0B' }]}>
                <Text style={styles.routeTypeBadgeText}>
                  {quote.routeType === 'road' ? '🗺️ Road Route' : '📐 Estimated'}
                </Text>
              </View>
              <Text style={styles.quotePriceBig}>{fmt(quote.price)}</Text>
              <Text style={[styles.quotePriceLabel, { color: isDark ? '#4ADE80' : '#16A34A' }]}>Total Delivery Fee</Text>
            </LinearGradient>

            <View style={styles.quoteDetails}>
              {[
                { label: '📏 Distance', value: `${quote.distanceKm} km` },
                ...(quote.durationMins != null ? [{ label: '⏱️ Est. Time', value: `${quote.durationMins} min` }] : []),
                { label: '🏁 Base Fare', value: fmt(quote.baseFare ?? 1000) },
                { label: '📍 Per km Rate', value: `${fmt(quote.perKmRate ?? 200)}/km` },
              ].map((row, i) => (
                <View key={i} style={[styles.quoteRow, { borderBottomColor: isDark ? '#334155' : '#F1F5F9' }]}>
                  <Text style={[styles.quoteRowLabel, { color: isDark ? '#64748B' : '#94A3B8' }]}>{row.label}</Text>
                  <Text style={[styles.quoteRowValue, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>{row.value}</Text>
                </View>
              ))}
            </View>

            <Text style={[styles.quoteNote, { color: isDark ? '#475569' : '#94A3B8' }]}>
              {quote.routeType === 'road'
                ? '✅ Price based on actual road route.'
                : 'ℹ️ Straight-line estimate with road factor applied. Final price may vary slightly.'}
            </Text>

            <TouchableOpacity
              style={[styles.bookBtn, { backgroundColor: '#22C55E', opacity: submitting ? 0.8 : 1 }]}
              onPress={handleBook}
              disabled={submitting}
              activeOpacity={0.85}
            >
              {submitting ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <>
                  <Text style={styles.bookBtnText}>✅ Confirm & Book Rider</Text>
                  <Text style={styles.bookBtnSub}>{fmt(quote.price)} · Payment at next step</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: 48 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16 },
  scrollDesktop: { maxWidth: 720, alignSelf: 'center', width: '100%', paddingHorizontal: 24, paddingVertical: 20 },

  // Hero
  hero: {
    borderRadius: 20, padding: 20, marginBottom: 14, overflow: 'hidden', position: 'relative',
  },
  heroDecor: {
    position: 'absolute', width: 180, height: 180, borderRadius: 90,
    top: -60, right: -40,
  },
  heroContent: { flexDirection: 'row', alignItems: 'center', gap: 14, zIndex: 1 },
  heroIconWrap: {
    width: 56, height: 56, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  heroIcon: { fontSize: 28 },
  heroTitle: { fontSize: 20, fontWeight: '900', marginBottom: 4 },
  heroSub: { fontSize: 13, lineHeight: 18 },

  // Cards
  card: {
    borderRadius: 18, borderWidth: 1, padding: 18, marginBottom: 14,
    shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2,
  },
  cardTitle: { fontSize: 15, fontWeight: '800', marginBottom: 14 },

  // How it works
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  stepBubble: {
    width: 24, height: 24, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  stepBubbleText: { fontSize: 11, fontWeight: '900', color: '#22A45D' },
  stepIcon: { fontSize: 16, width: 22, textAlign: 'center' },
  stepText: { flex: 1, fontSize: 13, lineHeight: 18 },

  // Route visualizer
  routeViz: { position: 'absolute', left: 27, top: 54, alignItems: 'center' },
  routeDot: { width: 10, height: 10, borderRadius: 5 },
  routeLine: { width: 2, height: 32 },
  addressInputsWrap: { marginTop: 4 },

  // Parcel size
  fieldLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 0.3, textTransform: 'uppercase', marginBottom: 8 },
  sizeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sizeTile: {
    width: '47%', borderRadius: 14, borderWidth: 1.5,
    padding: 12, alignItems: 'center', gap: 4,
  },
  sizeTileIcon: { fontSize: 24 },
  sizeTileLabel: { fontSize: 12, fontWeight: '800' },
  sizeTileDesc: { fontSize: 10, fontWeight: '500' },
  textArea: {
    borderWidth: 1.5, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, minHeight: 80,
  },

  // Quote button
  quoteBtn: {
    borderRadius: 16, paddingVertical: 18, alignItems: 'center',
    marginBottom: 14,
    shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6,
  },
  quoteBtnText: { color: '#FFF', fontSize: 16, fontWeight: '900' },
  quoteBtnSub: { color: 'rgba(255,255,255,0.7)', fontSize: 11, marginTop: 2 },

  // Quote card
  quoteCard: {
    borderRadius: 20, borderWidth: 2, overflow: 'hidden', marginBottom: 14,
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 4,
  },
  quoteCardHeader: { padding: 20, alignItems: 'center', gap: 6 },
  routeTypeBadge: {
    paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20, marginBottom: 4,
  },
  routeTypeBadgeText: { color: '#FFF', fontSize: 11, fontWeight: '800' },
  quotePriceBig: { fontSize: 38, fontWeight: '900', color: '#0F172A' },
  quotePriceLabel: { fontSize: 13, fontWeight: '700' },
  quoteDetails: { paddingHorizontal: 18, paddingTop: 6 },
  quoteRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 10, borderBottomWidth: 1,
  },
  quoteRowLabel: { fontSize: 13, fontWeight: '500' },
  quoteRowValue: { fontSize: 14, fontWeight: '800' },
  quoteNote: { fontSize: 11, textAlign: 'center', padding: 14, paddingTop: 10 },
  bookBtn: {
    marginHorizontal: 16, marginBottom: 16, borderRadius: 14,
    paddingVertical: 16, alignItems: 'center',
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 5,
  },
  bookBtnText: { color: '#FFF', fontSize: 16, fontWeight: '900' },
  bookBtnSub: { color: 'rgba(255,255,255,0.75)', fontSize: 11, marginTop: 2 },
});
