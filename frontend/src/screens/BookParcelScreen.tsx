import React, { useState, useEffect, useContext } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, ActivityIndicator, Alert, KeyboardAvoidingView,
  Platform, useWindowDimensions, Image, Modal, Linking,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import AddressInput from '../components/AddressInput';
import { AuthContext } from '../context/AuthContext';
import { SettingsContext } from '../context/SettingsContext';
import { useCurrency } from '../context/CurrencyContext';
import apiClient, { getImageUri } from '../api/client';
import ImageViewerModal from '../components/ImageViewerModal';

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

  // Success Modal & Rider Profile State
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [createdParcel, setCreatedParcel] = useState<any>(null);
  const [assignedRider, setAssignedRider] = useState<any>(null);

  // Zoom Modal state
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState('');
  const [previewSub, setPreviewSub] = useState('');

  const openImageZoom = (url: string, title?: string, subtitle?: string) => {
    setPreviewUrl(url);
    setPreviewTitle(title || 'Rider Photo');
    setPreviewSub(subtitle || '');
    setPreviewVisible(true);
  };

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
      const parcel = res.data?.parcel;
      const rider = parcel?.rider;
      setCreatedParcel(parcel);
      setAssignedRider(rider || null);

      if (paymentChoice === 'ONLINE' && parcel?.id) {
        navigation.navigate('Checkout', { checkoutType: 'parcel', id: parcel.id, amount: confirmedQuote.price });
      } else {
        setShowSuccessModal(true);
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
          <Text style={[styles.cardTitle, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>Delivery Route</Text>

          <View style={styles.addressInputsWrap}>
            <AddressInput
              label="📍 Pickup Address"
              initialValue={pickupAddress}
              onAddressChange={(addr, lat, lng) => { setPickupAddress(addr); setPickupLat(lat); setPickupLng(lng); setQuote(null); }}
              countryCode="ng"
            />
            <View style={{ height: 12 }} />
            <AddressInput
              label="🏁 Drop-off Address"
              initialValue={dropoffAddress}
              onAddressChange={(addr, lat, lng) => { setDropoffAddress(addr); setDropoffLat(lat); setDropoffLng(lng); setQuote(null); }}
              countryCode="ng"
            />
          </View>
        </View>

        {/* ── Parcel Details ─────────────────────────────────────────────────── */}
        <View style={[styles.card, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderColor: isDark ? '#334155' : '#E2E8F0' }]}>
          <Text style={[styles.cardTitle, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>Parcel Details</Text>

          <Text style={[styles.fieldLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>Package Size</Text>
          <View style={styles.sizeGrid}>
            {PARCEL_SIZES.map(s => {
              const active = parcelSize === s.label;
              return (
                <TouchableOpacity
                  key={s.label}
                  style={[
                    styles.sizeTile,
                    { backgroundColor: active ? (safeTheme.primary + '15') : (isDark ? '#0F172A' : '#F8FAFC'), borderColor: active ? safeTheme.primary : (isDark ? '#334155' : '#E2E8F0') }
                  ]}
                  onPress={() => setParcelSize(s.label)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.sizeTileIcon}>{s.icon}</Text>
                  <Text style={[styles.sizeTileLabel, { color: active ? safeTheme.primary : (isDark ? '#F1F5F9' : '#0F172A') }]}>{s.label}</Text>
                  <Text style={[styles.sizeTileDesc, { color: isDark ? '#64748B' : '#94A3B8' }]}>{s.desc}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={[styles.fieldLabel, { color: isDark ? '#94A3B8' : '#64748B', marginTop: 14 }]}>Additional Description (Optional)</Text>
          <TextInput
            style={[
              styles.textArea,
              { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderColor: descFocused ? safeTheme.primary : (isDark ? '#334155' : '#E2E8F0'), color: isDark ? '#F1F5F9' : '#0F172A' }
            ]}
            placeholder="e.g. Fragile electronics, handle with care, gate code #1234"
            placeholderTextColor={isDark ? '#475569' : '#94A3B8'}
            multiline numberOfLines={3}
            value={parcelDescription}
            onChangeText={setParcelDescription}
            onFocus={() => setDescFocused(true)}
            onBlur={() => setDescFocused(false)}
          />
        </View>

        {/* ── Get Quote / Price Preview ──────────────────────────────────────── */}
        {!quote ? (
          <TouchableOpacity
            style={[styles.quoteBtn, { backgroundColor: safeTheme.primary }]}
            onPress={handleGetQuote}
            disabled={quoteLoading}
            activeOpacity={0.88}
          >
            {quoteLoading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <>
                <Text style={styles.quoteBtnText}>Calculate Delivery Price →</Text>
                <Text style={styles.quoteBtnSub}>Instant road-distance routing</Text>
              </>
            )}
          </TouchableOpacity>
        ) : (
          <View style={[styles.quoteCard, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderColor: safeTheme.primary }]}>
            <View style={[styles.quoteCardHeader, { backgroundColor: safeTheme.primary + '12' }]}>
              <View style={[styles.routeTypeBadge, { backgroundColor: safeTheme.primary }]}>
                <Text style={styles.routeTypeBadgeText}>{quote.routeType === 'road' ? '🛣️ Road Route Calculated' : '📏 Estimated Route'}</Text>
              </View>
              <Text style={[styles.quotePriceBig, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>{fmt(quote.price)}</Text>
              <Text style={[styles.quotePriceLabel, { color: safeTheme.primary }]}>Total Delivery Fee</Text>
            </View>

            <View style={styles.quoteDetails}>
              <View style={[styles.quoteRow, { borderBottomColor: isDark ? '#334155' : '#F1F5F9' }]}>
                <Text style={[styles.quoteRowLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>Distance</Text>
                <Text style={[styles.quoteRowValue, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>{quote.distanceKm} km</Text>
              </View>
              {quote.durationMins !== null && (
                <View style={[styles.quoteRow, { borderBottomColor: isDark ? '#334155' : '#F1F5F9' }]}>
                  <Text style={[styles.quoteRowLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>Estimated Time</Text>
                  <Text style={[styles.quoteRowValue, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>~{quote.durationMins} mins</Text>
                </View>
              )}
              <View style={[styles.quoteRow, { borderBottomColor: isDark ? '#334155' : '#F1F5F9' }]}>
                <Text style={[styles.quoteRowLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>Base Fare</Text>
                <Text style={[styles.quoteRowValue, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>{fmt(quote.baseFare)}</Text>
              </View>
              <View style={[styles.quoteRow, { borderBottomColor: isDark ? '#334155' : '#F1F5F9' }]}>
                <Text style={[styles.quoteRowLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>Per Km Rate</Text>
                <Text style={[styles.quoteRowValue, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>{fmt(quote.perKmRate)}/km</Text>
              </View>
            </View>

            <Text style={[styles.quoteNote, { color: isDark ? '#64748B' : '#94A3B8' }]}>
              🔒 Price is locked once booked. Live GPS tracking active upon pickup.
            </Text>

            <TouchableOpacity
              style={[styles.bookBtn, { backgroundColor: safeTheme.primary }]}
              onPress={handleBook}
              disabled={submitting}
              activeOpacity={0.88}
            >
              {submitting ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <>
                  <Text style={styles.bookBtnText}>Confirm & Book Rider →</Text>
                  <Text style={styles.bookBtnSub}>Dispatches nearest certified courier</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: 48 }} />
      </ScrollView>

      {/* ── Booking Success Modal With Assigned Rider Showcase ── */}
      <Modal
        visible={showSuccessModal}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setShowSuccessModal(false);
          navigation.navigate('History', { tab: 'parcels' });
        }}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.successModalCard, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderColor: isDark ? '#334155' : '#E2E8F0' }]}>
            <View style={styles.successHeader}>
              <View style={[styles.successCheckWrap, { backgroundColor: '#DCFCE7' }]}>
                <Text style={{ fontSize: 32 }}>🎉</Text>
              </View>
              <Text style={[styles.successModalTitle, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>
                Delivery Booked Successfully!
              </Text>
              <Text style={[styles.successModalSub, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                Your order is confirmed and our logistics network is dispatching your parcel.
              </Text>
            </View>

            {/* Assigned Rider Showcase */}
            {assignedRider ? (
              <View style={[styles.assignedRiderBox, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderColor: isDark ? '#334155' : '#E2E8F0' }]}>
                <View style={styles.assignedRiderHeader}>
                  <Text style={styles.assignedRiderBadge}>🏍️ ASSIGNED COURIER RIDER</Text>
                </View>
                <View style={styles.assignedRiderProfileRow}>
                  <TouchableOpacity
                    style={styles.assignedRiderAvatarWrap}
                    onPress={() => assignedRider.passportPhoto && openImageZoom(assignedRider.passportPhoto, `${assignedRider.name} - Passport Photo`, 'Clear Portrait')}
                  >
                    {assignedRider.passportPhoto ? (
                      <Image source={{ uri: getImageUri(assignedRider.passportPhoto) ?? undefined }} style={styles.assignedRiderAvatar} />
                    ) : (
                      <View style={[styles.assignedRiderAvatarFallback, { backgroundColor: '#DCFCE7' }]}>
                        <Text style={{ fontSize: 24 }}>🏍️</Text>
                      </View>
                    )}
                    <View style={styles.verifiedCheckPill}>
                      <Text style={{ fontSize: 9, color: '#FFF', fontWeight: '900' }}>✓</Text>
                    </View>
                  </TouchableOpacity>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={[styles.assignedRiderName, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>{assignedRider.name}</Text>
                    <Text style={[styles.assignedRiderVehicle, { color: isDark ? '#94A3B8' : '#64748B' }]}>{assignedRider.vehicleType || 'Motorcycle'} {assignedRider.licensePlate ? `• ${assignedRider.licensePlate}` : ''}</Text>
                    {assignedRider.phone && (
                      <TouchableOpacity style={styles.quickCallBtn} onPress={() => Linking.openURL(`tel:${assignedRider.phone}`)}>
                        <Text style={styles.quickCallBtnText}>📞 Call Rider</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
                {assignedRider.actionPhoto && (
                  <View style={{ marginTop: 10 }}>
                    <Text style={[styles.riderActionLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                      🏍️ Rider Action Picture (Vehicle & Gear):
                    </Text>
                    <TouchableOpacity
                      style={styles.assignedRiderActionWrap}
                      onPress={() => openImageZoom(assignedRider.actionPhoto, `${assignedRider.name} - Action Picture`, 'With Delivery Vehicle & Gear')}
                      activeOpacity={0.9}
                    >
                      <Image source={{ uri: getImageUri(assignedRider.actionPhoto) ?? undefined }} style={styles.assignedRiderActionImg} resizeMode="cover" />
                      <LinearGradient colors={['transparent', 'rgba(0,0,0,0.6)']} style={styles.assignedRiderActionOverlay}>
                        <Text style={styles.assignedRiderActionText}>🔍 Tap to inspect photo</Text>
                      </LinearGradient>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ) : (
              <View style={[styles.searchingRiderBox, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderColor: isDark ? '#334155' : '#E2E8F0' }]}>
                <ActivityIndicator color={safeTheme.primary} size="small" />
                <Text style={[styles.searchingRiderText, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>
                  Dispatching closest verified courier rider...
                </Text>
              </View>
            )}

            <View style={[styles.modalTripDetails, { borderTopColor: isDark ? '#334155' : '#E2E8F0' }]}>
              <View style={styles.modalTripRow}>
                <Text style={[styles.modalTripLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>📍 From</Text>
                <Text style={[styles.modalTripVal, { color: isDark ? '#F1F5F9' : '#0F172A' }]} numberOfLines={1}>{pickupAddress}</Text>
              </View>
              <View style={styles.modalTripRow}>
                <Text style={[styles.modalTripLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>🏁 To</Text>
                <Text style={[styles.modalTripVal, { color: isDark ? '#F1F5F9' : '#0F172A' }]} numberOfLines={1}>{dropoffAddress}</Text>
              </View>
              {quote && (
                <View style={styles.modalTripRow}>
                  <Text style={[styles.modalTripLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>💰 Amount</Text>
                  <Text style={[styles.modalTripVal, { color: safeTheme.primary, fontWeight: '900' }]}>{fmt(quote.price)}</Text>
                </View>
              )}
            </View>

            <View style={styles.modalActionsRow}>
              {createdParcel?.id && (
                <TouchableOpacity
                  style={[styles.modalTrackBtn, { backgroundColor: safeTheme.primary }]}
                  onPress={() => {
                    setShowSuccessModal(false);
                    navigation.navigate('LiveTracking', { orderId: createdParcel.id, role: 'CUSTOMER' });
                  }}
                >
                  <Text style={styles.modalTrackBtnText}>📡 Track Live on Map</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.modalDoneBtn, { borderColor: isDark ? '#334155' : '#E2E8F0' }]}
                onPress={() => {
                  setShowSuccessModal(false);
                  navigation.navigate('History', { tab: 'parcels' });
                }}
              >
                <Text style={[styles.modalDoneBtnText, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>
                  View Deliveries
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <ImageViewerModal
        visible={previewVisible}
        imageUrl={previewUrl}
        title={previewTitle}
        subtitle={previewSub}
        onClose={() => setPreviewVisible(false)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16 },
  scrollDesktop: { maxWidth: 720, alignSelf: 'center', width: '100%', paddingHorizontal: 24, paddingVertical: 20 },
  hero: { borderRadius: 20, padding: 20, marginBottom: 14, overflow: 'hidden', position: 'relative' },
  heroDecor: { position: 'absolute', width: 180, height: 180, borderRadius: 90, top: -60, right: -40 },
  heroContent: { flexDirection: 'row', alignItems: 'center', gap: 14, zIndex: 1 },
  heroIconWrap: { width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  heroIcon: { fontSize: 28 },
  heroTitle: { fontSize: 20, fontWeight: '900', marginBottom: 4 },
  heroSub: { fontSize: 13, lineHeight: 18 },
  card: { borderRadius: 18, borderWidth: 1, padding: 18, marginBottom: 14, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 },
  cardTitle: { fontSize: 15, fontWeight: '800', marginBottom: 14 },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  stepBubble: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  stepBubbleText: { fontSize: 11, fontWeight: '900', color: '#22A45D' },
  stepIcon: { fontSize: 16, width: 22, textAlign: 'center' },
  stepText: { flex: 1, fontSize: 13, lineHeight: 18 },
  addressInputsWrap: { marginTop: 4 },
  fieldLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 0.3, textTransform: 'uppercase', marginBottom: 8 },
  sizeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sizeTile: { width: '47%', borderRadius: 14, borderWidth: 1.5, padding: 12, alignItems: 'center', gap: 4 },
  sizeTileIcon: { fontSize: 24 },
  sizeTileLabel: { fontSize: 12, fontWeight: '800' },
  sizeTileDesc: { fontSize: 10, fontWeight: '500' },
  textArea: { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, minHeight: 80 },
  quoteBtn: { borderRadius: 16, paddingVertical: 18, alignItems: 'center', marginBottom: 14, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6 },
  quoteBtnText: { color: '#FFF', fontSize: 16, fontWeight: '900' },
  quoteBtnSub: { color: 'rgba(255,255,255,0.7)', fontSize: 11, marginTop: 2 },
  quoteCard: { borderRadius: 20, borderWidth: 2, overflow: 'hidden', marginBottom: 14, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 4 },
  quoteCardHeader: { padding: 20, alignItems: 'center', gap: 6 },
  routeTypeBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20, marginBottom: 4 },
  routeTypeBadgeText: { color: '#FFF', fontSize: 11, fontWeight: '800' },
  quotePriceBig: { fontSize: 38, fontWeight: '900' },
  quotePriceLabel: { fontSize: 13, fontWeight: '700' },
  quoteDetails: { paddingHorizontal: 18, paddingTop: 6 },
  quoteRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1 },
  quoteRowLabel: { fontSize: 13, fontWeight: '500' },
  quoteRowValue: { fontSize: 14, fontWeight: '800' },
  quoteNote: { fontSize: 11, textAlign: 'center', padding: 14, paddingTop: 10 },
  bookBtn: { marginHorizontal: 16, marginBottom: 16, borderRadius: 14, paddingVertical: 16, alignItems: 'center', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 5 },
  bookBtnText: { color: '#FFF', fontSize: 16, fontWeight: '900' },
  bookBtnSub: { color: 'rgba(255,255,255,0.75)', fontSize: 11, marginTop: 2 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end', alignItems: 'center' },
  successModalCard: { width: '100%', maxWidth: 540, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, borderWidth: 1, maxHeight: '90%' },
  successHeader: { alignItems: 'center', marginBottom: 16 },
  successCheckWrap: { width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  successModalTitle: { fontSize: 20, fontWeight: '900', textAlign: 'center', marginBottom: 4 },
  successModalSub: { fontSize: 13, textAlign: 'center', lineHeight: 18 },
  assignedRiderBox: { borderRadius: 18, borderWidth: 1.5, padding: 14, marginBottom: 14 },
  assignedRiderHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  assignedRiderBadge: { fontSize: 10, fontWeight: '900', color: '#16A34A', backgroundColor: '#DCFCE7', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, letterSpacing: 0.5 },
  assignedRiderProfileRow: { flexDirection: 'row', alignItems: 'center' },
  assignedRiderAvatarWrap: { position: 'relative' },
  assignedRiderAvatar: { width: 56, height: 56, borderRadius: 28, borderWidth: 2, borderColor: '#34C759' },
  assignedRiderAvatarFallback: { width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#34C759' },
  verifiedCheckPill: { position: 'absolute', bottom: -2, right: -2, backgroundColor: '#34C759', width: 16, height: 16, borderRadius: 8, justifyContent: 'center', alignItems: 'center', borderWidth: 1.5, borderColor: '#FFF' },
  assignedRiderName: { fontSize: 15, fontWeight: '800' },
  assignedRiderVehicle: { fontSize: 12, marginTop: 2, fontWeight: '600' },
  quickCallBtn: { alignSelf: 'flex-start', backgroundColor: '#0284C715', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, marginTop: 4 },
  quickCallBtnText: { fontSize: 11, fontWeight: '700', color: '#0284C7' },
  riderActionLabel: { fontSize: 11, fontWeight: '700', marginBottom: 6 },
  assignedRiderActionWrap: { height: 120, borderRadius: 12, overflow: 'hidden', position: 'relative', backgroundColor: '#0F172A' },
  assignedRiderActionImg: { width: '100%', height: '100%' },
  assignedRiderActionOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 6 },
  assignedRiderActionText: { color: '#FFF', fontSize: 10, fontWeight: '700', textAlign: 'right' },
  searchingRiderBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 16, borderRadius: 14, borderWidth: 1, gap: 10, marginBottom: 14 },
  searchingRiderText: { fontSize: 13, fontWeight: '700' },
  modalTripDetails: { borderTopWidth: 1, paddingTop: 12, marginBottom: 16, gap: 6 },
  modalTripRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalTripLabel: { fontSize: 12, fontWeight: '600', width: 60 },
  modalTripVal: { flex: 1, fontSize: 12, fontWeight: '600', textAlign: 'right' },
  modalActionsRow: { gap: 10 },
  modalTrackBtn: { height: 48, borderRadius: 12, justifyContent: 'center', alignItems: 'center', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.2, shadowRadius: 6, elevation: 3 },
  modalTrackBtnText: { color: '#FFF', fontSize: 15, fontWeight: '800' },
  modalDoneBtn: { height: 44, borderRadius: 12, borderWidth: 1.5, justifyContent: 'center', alignItems: 'center' },
  modalDoneBtnText: { fontSize: 14, fontWeight: '700' },
});
