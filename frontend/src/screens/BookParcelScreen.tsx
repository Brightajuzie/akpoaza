import React, { useState, useEffect, useContext } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, ActivityIndicator, Alert, KeyboardAvoidingView, Platform
} from 'react-native';
import * as Location from 'expo-location';
import { AuthContext } from '../context/AuthContext';
import { SettingsContext } from '../context/SettingsContext';
import apiClient from '../api/client';

const VEHICLE_ICONS: Record<string, string> = {
  BICYCLE: '🚲',
  MOTORCYCLE: '🏍️',
  CAR: '🚗',
};

export default function BookParcelScreen({ route, navigation }: any) {
  const { theme } = useContext(SettingsContext);
  const { userToken } = useContext(AuthContext);

  // Form state
  const [pickupAddress, setPickupAddress] = useState('');
  const [dropoffAddress, setDropoffAddress] = useState('');
  const [pickupLat, setPickupLat] = useState<number | null>(null);
  const [pickupLng, setPickupLng] = useState<number | null>(null);
  const [dropoffLat, setDropoffLat] = useState<number | null>(null);
  const [dropoffLng, setDropoffLng] = useState<number | null>(null);
  const [parcelDescription, setParcelDescription] = useState('');

  // Quote / UI state
  const [quote, setQuote] = useState<{
    price: number;
    distanceKm: string;
    durationMins: number | null;
    routeType: 'road' | 'straight-line';
    baseFare: number;
    perKmRate: number;
  } | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);

  // Selected parcel size tag
  const [parcelSize, setParcelSize] = useState<string>('');
  const PARCEL_SIZES = ['📄 Documents', '📦 Small Box', '🗃️ Medium Box', '🪨 Heavy Item'];

  // Handle redirect params pre-filling and auto-getting quote
  useEffect(() => {
    if (route?.params) {
      const {
        pickupAddress: pAddr,
        dropoffAddress: dAddr,
        pickupLat: pLat,
        pickupLng: pLng,
        dropoffLat: dLat,
        dropoffLng: dLng,
        parcelDescription: pDesc,
        parcelSize: pSize,
      } = route.params;

      if (pAddr) setPickupAddress(pAddr);
      if (dAddr) setDropoffAddress(dAddr);
      if (pLat !== undefined) setPickupLat(pLat);
      if (pLng !== undefined) setPickupLng(pLng);
      if (dLat !== undefined) setDropoffLat(dLat);
      if (dLng !== undefined) setDropoffLng(dLng);
      if (pDesc) setParcelDescription(pDesc);
      if (pSize) setParcelSize(pSize);

      // Auto-get quote if coordinates are provided
      if (pLat && pLng && dLat && dLng) {
        const fetchQuote = async () => {
          setQuoteLoading(true);
          try {
            const res = await apiClient.post('/parcels/quote', {
              pickupLat: pLat,
              pickupLng: pLng,
              dropoffLat: dLat,
              dropoffLng: dLng,
            });
            setQuote(res.data);
          } catch (e) {
            console.error('Auto quote calculation failed', e);
          } finally {
            setQuoteLoading(false);
          }
        };
        fetchQuote();
      }
    }
  }, [route?.params]);

  // Use current location for pickup
  const useCurrentLocation = async () => {
    setLocationLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Location access is needed to use your current location.');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({});
      const [geocode] = await Location.reverseGeocodeAsync({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      });
      const address = [geocode?.street, geocode?.district, geocode?.city].filter(Boolean).join(', ');
      setPickupAddress(address || 'Current Location');
      setPickupLat(loc.coords.latitude);
      setPickupLng(loc.coords.longitude);
    } catch (e) {
      Alert.alert('Error', 'Could not get your location. Please enter it manually.');
    } finally {
      setLocationLoading(false);
    }
  };

  // Geocode an address string to lat/lng using Nominatim (OpenStreetMap)
  const geocodeAddress = async (address: string): Promise<{ lat: number; lng: number } | null> => {
    try {
      const encoded = encodeURIComponent(address);
      const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=1`, {
        headers: { 'User-Agent': 'AkpoazaApp/1.0' }
      });
      const data = await res.json();
      if (data && data.length > 0) {
        return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
      }
      return null;
    } catch {
      return null;
    }
  };

  // Get a price quote
  const handleGetQuote = async () => {
    if (!pickupAddress.trim() || !dropoffAddress.trim()) {
      Alert.alert('Missing Info', 'Please enter both pickup and drop-off addresses.');
      return;
    }
    setQuoteLoading(true);
    setQuote(null);
    try {
      // Geocode addresses if we don't have coords yet
      let pLat = pickupLat, pLng = pickupLng;
      let dLat = dropoffLat, dLng = dropoffLng;

      if (!pLat || !pLng) {
        const coords = await geocodeAddress(pickupAddress);
        if (!coords) { Alert.alert('Error', 'Could not find pickup address. Please be more specific.'); return; }
        pLat = coords.lat; pLng = coords.lng;
        setPickupLat(pLat); setPickupLng(pLng);
      }
      if (!dLat || !dLng) {
        const coords = await geocodeAddress(dropoffAddress);
        if (!coords) { Alert.alert('Error', 'Could not find drop-off address. Please be more specific.'); return; }
        dLat = coords.lat; dLng = coords.lng;
        setDropoffLat(dLat); setDropoffLng(dLng);
      }

      const res = await apiClient.post('/parcels/quote', {
        pickupLat: pLat, pickupLng: pLng,
        dropoffLat: dLat, dropoffLng: dLng,
      });
      setQuote(res.data);
    } catch (e) {
      Alert.alert('Error', 'Could not calculate a quote. Please try again.');
    } finally {
      setQuoteLoading(false);
    }
  };

  // Book the parcel delivery
  const handleBook = async () => {
    if (!quote || !pickupLat || !pickupLng || !dropoffLat || !dropoffLng) {
      Alert.alert('Get a Quote First', 'Please calculate a price quote before booking.');
      return;
    }

    if (!userToken) {
      Alert.alert(
        'Login Required',
        'Please log in or sign up to confirm your booking.',
        [
          {
            text: 'Log In',
            onPress: () =>
              navigation.navigate('Login', {
                redirectTo: 'BookParcel',
                redirectParams: {
                  pickupAddress,
                  dropoffAddress,
                  pickupLat,
                  pickupLng,
                  dropoffLat,
                  dropoffLng,
                  parcelDescription,
                  parcelSize,
                },
              }),
          },
          {
            text: 'Sign Up',
            onPress: () =>
              navigation.navigate('Signup', {
                redirectTo: 'BookParcel',
                redirectParams: {
                  pickupAddress,
                  dropoffAddress,
                  pickupLat,
                  pickupLng,
                  dropoffLat,
                  dropoffLng,
                  parcelDescription,
                  parcelSize,
                },
              }),
          },
          { text: 'Cancel', style: 'cancel' },
        ]
      );
      return;
    }

    setSubmitting(true);
    try {
      const description = parcelSize ? `${parcelSize}${parcelDescription ? ' – ' + parcelDescription : ''}` : parcelDescription;
      const res = await apiClient.post('/parcels/checkout', {
        pickupAddress, dropoffAddress,
        pickupLat, pickupLng, dropoffLat, dropoffLng,
        parcelDescription: description || undefined,
        paymentProvider: 'NONE',
      });
      Alert.alert(
        '✅ Delivery Booked!',
        `Your parcel delivery has been created.\n\n📍 From: ${pickupAddress}\n📍 To: ${dropoffAddress}\n💰 Total: ₦${quote.price.toLocaleString()}\n\nA verified rider will be assigned shortly.`,
        [{ text: 'View My Deliveries', onPress: () => navigation.navigate('History', { tab: 'parcels' }) }]
      );
    } catch (e: any) {
      Alert.alert('Booking Failed', e?.response?.data?.error || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerIcon}>🚚</Text>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Book a Delivery Rider</Text>
          <Text style={styles.headerSubtitle}>Fast, secure parcel delivery by verified riders</Text>
        </View>

        {/* How it works */}
        <View style={[styles.infoCard, { borderColor: theme.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>How it works</Text>
          {['Enter pickup & drop-off locations', 'Get an instant price quote', 'Book & a rider gets assigned', 'Track your delivery live on the map'].map((step, i) => (
            <View key={i} style={styles.stepRow}>
              <View style={styles.stepBadge}><Text style={styles.stepNum}>{i + 1}</Text></View>
              <Text style={[styles.stepText, { color: theme.text }]}>{step}</Text>
            </View>
          ))}
        </View>

        {/* Pickup */}
        <Text style={[styles.label, { color: theme.text }]}>📍 Pickup Address</Text>
        <View style={[styles.inputRow, { borderColor: theme.border }]}>
          <TextInput
            style={[styles.input, { color: theme.text }]}
            placeholder="Enter pickup address or street"
            placeholderTextColor="#AEAEB2"
            value={pickupAddress}
            onChangeText={(t) => { setPickupAddress(t); setPickupLat(null); setPickupLng(null); setQuote(null); }}
          />
          <TouchableOpacity onPress={useCurrentLocation} style={styles.locationBtn} disabled={locationLoading}>
            {locationLoading ? <ActivityIndicator size="small" color="#5856D6" /> : <Text style={styles.locationBtnText}>📡 GPS</Text>}
          </TouchableOpacity>
        </View>

        {/* Dropoff */}
        <Text style={[styles.label, { color: theme.text }]}>🏁 Drop-off Address</Text>
        <TextInput
          style={[styles.input, styles.inputStandalone, { borderColor: theme.border, color: theme.text }]}
          placeholder="Enter delivery destination"
          placeholderTextColor="#AEAEB2"
          value={dropoffAddress}
          onChangeText={(t) => { setDropoffAddress(t); setDropoffLat(null); setDropoffLng(null); setQuote(null); }}
        />

        {/* Parcel Size */}
        <Text style={[styles.label, { color: theme.text }]}>📦 Parcel Size (optional)</Text>
        <View style={styles.sizeRow}>
          {PARCEL_SIZES.map(size => (
            <TouchableOpacity
              key={size}
              style={[styles.sizePill, { borderColor: parcelSize === size ? '#5856D6' : theme.border, backgroundColor: parcelSize === size ? '#5856D6' : 'transparent' }]}
              onPress={() => setParcelSize(parcelSize === size ? '' : size)}
            >
              <Text style={[styles.sizePillText, { color: parcelSize === size ? '#fff' : theme.text }]}>{size}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Description */}
        <Text style={[styles.label, { color: theme.text }]}>📝 Description (optional)</Text>
        <TextInput
          style={[styles.input, styles.inputStandalone, styles.textArea, { borderColor: theme.border, color: theme.text }]}
          placeholder="e.g. Fragile – handle with care, return items..."
          placeholderTextColor="#AEAEB2"
          value={parcelDescription}
          onChangeText={setParcelDescription}
          multiline
          numberOfLines={3}
        />

        {/* Get Quote Button */}
        <TouchableOpacity
          style={[styles.quoteBtn, { backgroundColor: '#5856D6' }]}
          onPress={handleGetQuote}
          disabled={quoteLoading}
        >
          {quoteLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.quoteBtnText}>🧮 Get Price Quote</Text>
          )}
        </TouchableOpacity>

        {/* Quote Result */}
        {quote && (
            <View style={[styles.quoteCard, { borderColor: '#5856D6' }]}>
              {/* Route type badge */}
              <View style={[
                styles.routeBadge,
                { backgroundColor: quote.routeType === 'road' ? '#E8F5E9' : '#FFF3E0' }
              ]}>
                <Text style={[
                  styles.routeBadgeText,
                  { color: quote.routeType === 'road' ? '#2E7D32' : '#E65100' }
                ]}>
                  {quote.routeType === 'road' ? '🗺️ Road Distance' : '📐 Estimated Distance'}
                </Text>
              </View>

              <View style={styles.quoteRow}>
                <Text style={styles.quoteLabel}>📏 Distance</Text>
                <Text style={styles.quoteValue}>{quote.distanceKm} km</Text>
              </View>
              {quote.durationMins != null && (
                <View style={styles.quoteRow}>
                  <Text style={styles.quoteLabel}>⏱️ Est. Ride Time</Text>
                  <Text style={styles.quoteValue}>{quote.durationMins} min</Text>
                </View>
              )}
              <View style={styles.quoteDivider} />
              <View style={styles.quoteRow}>
                <Text style={styles.quoteLabel}>🏁 Base Fare</Text>
                <Text style={styles.quoteValue}>₦{(quote.baseFare ?? 1000).toLocaleString()}</Text>
              </View>
              <View style={styles.quoteRow}>
                <Text style={styles.quoteLabel}>📍 Per km Rate</Text>
                <Text style={styles.quoteValue}>₦{(quote.perKmRate ?? 200).toLocaleString()}/km</Text>
              </View>
              <View style={styles.quoteDivider} />
              <View style={styles.quoteRow}>
                <Text style={styles.quoteLabel}>💰 Total (incl. platform fee)</Text>
                <Text style={[styles.quotePriceLarge, { color: '#5856D6' }]}>₦{quote.price.toLocaleString()}</Text>
              </View>
              <Text style={styles.quoteNote}>
                {quote.routeType === 'road'
                  ? 'Price based on real road route distance.'
                  : 'Straight-line estimate with road factor applied. Final price may vary slightly.'}
              </Text>

              <TouchableOpacity
                style={[styles.bookBtn, { backgroundColor: '#34C759' }]}
                onPress={handleBook}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.bookBtnText}>✅ Confirm Booking — ₦{quote.price.toLocaleString()}</Text>
                )}
              </TouchableOpacity>
            </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20 },
  header: { alignItems: 'center', marginBottom: 24, paddingTop: 12 },
  headerIcon: { fontSize: 52, marginBottom: 8 },
  headerTitle: { fontSize: 24, fontWeight: '900', marginBottom: 4 },
  headerSubtitle: { fontSize: 14, color: '#8E8E93', textAlign: 'center' },

  infoCard: {
    borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 24,
    backgroundColor: '#F9F9F9',
  },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginBottom: 12 },
  stepRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  stepBadge: {
    width: 26, height: 26, borderRadius: 13, backgroundColor: '#5856D6',
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  stepNum: { color: '#fff', fontWeight: '800', fontSize: 13 },
  stepText: { fontSize: 14, flex: 1 },

  label: { fontSize: 13, fontWeight: '700', marginBottom: 6, marginTop: 16 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 2,
    backgroundColor: '#fff',
  },
  input: { flex: 1, fontSize: 14, paddingVertical: 11 },
  inputStandalone: {
    borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11,
    backgroundColor: '#fff', fontSize: 14,
  },
  textArea: { height: 80, textAlignVertical: 'top' },
  locationBtn: { paddingHorizontal: 10, paddingVertical: 6 },
  locationBtnText: { fontSize: 13, fontWeight: '700', color: '#5856D6' },

  sizeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  sizePill: {
    borderWidth: 1.5, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7,
  },
  sizePillText: { fontSize: 12, fontWeight: '600' },

  quoteBtn: {
    borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 24,
    shadowColor: '#5856D6', shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  quoteBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },

  quoteCard: {
    borderWidth: 2, borderRadius: 16, padding: 20, marginTop: 20,
    backgroundColor: '#f0f0ff',
  },
  routeBadge: {
    alignSelf: 'center', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 5, marginBottom: 14,
  },
  routeBadgeText: { fontSize: 12, fontWeight: '700' },
  quoteRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  quoteLabel: { fontSize: 14, color: '#3A3A3C', fontWeight: '600' },
  quoteValue: { fontSize: 14, fontWeight: '700', color: '#1C1C1E' },
  quotePriceLarge: { fontSize: 26, fontWeight: '900' },
  quoteDivider: { height: 1, backgroundColor: '#D1D1D6', marginVertical: 12 },
  quoteNote: { fontSize: 11, color: '#8E8E93', textAlign: 'center', marginTop: 8, marginBottom: 16 },

  bookBtn: {
    borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 4,
    shadowColor: '#34C759', shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  bookBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
