/**
 * AddressInput.tsx
 *
 * A reusable, smart address input that combines:
 *  - Google Places Autocomplete for the street/house address
 *  - A "Closest Junction / Landmark" free-text field
 *  - GPS auto-fill (reverse geocode via expo-location)
 *  - Outputs a single assembled address string AND lat/lng coordinates
 *
 * Assembled format example:
 *   "12 Aba Road, Near Rumuola Junction, Port Harcourt"
 *
 * Usage:
 *   <AddressInput
 *     label="📍 Pickup Address"
 *     onAddressChange={(address, lat, lng) => { ... }}
 *     initialValue="..."
 *   />
 */

import React, { useState, useRef, useContext } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Alert,
  Platform,
} from 'react-native';
import { GooglePlacesAutocomplete } from 'react-native-google-places-autocomplete';
import * as Location from 'expo-location';
import { SettingsContext } from '../context/SettingsContext';

const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';

interface AddressInputProps {
  /** Label shown above the street address field */
  label: string;
  /** Called whenever the full assembled address or coordinates change */
  onAddressChange: (address: string, lat: number | null, lng: number | null) => void;
  /** Pre-fill the street address (e.g. from saved state) */
  initialValue?: string;
  /** Optional: pre-fill the junction field */
  initialJunction?: string;
  /** Whether to show the GPS "Use My Location" button (default: true) */
  showGps?: boolean;
  /** Restrict Places results to a country code, e.g. "ng" for Nigeria */
  countryCode?: string;
}

export default function AddressInput({
  label,
  onAddressChange,
  initialValue = '',
  initialJunction = '',
  showGps = true,
  countryCode = 'ng',
}: AddressInputProps) {
  const { theme } = useContext(SettingsContext);

  const [streetAddress, setStreetAddress] = useState(initialValue);
  const [junction, setJunction] = useState(initialJunction);
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);

  const googleRef = useRef<any>(null);

  /** Build the final assembled address string and emit it */
  const emitChange = (street: string, junc: string, latitude: number | null, longitude: number | null) => {
    const parts = [street.trim()];
    if (junc.trim()) parts.push(`Near ${junc.trim()}`);
    const assembled = parts.join(', ');
    onAddressChange(assembled, latitude, longitude);
  };

  /** Called when user picks a suggestion from Google Places */
  const handlePlaceSelect = (data: any, details: any) => {
    const name = details?.formatted_address || data?.description || '';
    const geometry = details?.geometry?.location;
    const newLat = geometry?.lat ?? null;
    const newLng = geometry?.lng ?? null;

    setStreetAddress(name);
    setLat(newLat);
    setLng(newLng);
    emitChange(name, junction, newLat, newLng);
  };

  /** GPS: get current location and reverse-geocode */
  const handleUseGps = async () => {
    setGpsLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Location access is needed to use your current position.');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const [geo] = await Location.reverseGeocodeAsync({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      });

      // Build a clean street string from the geocode result
      const street = [
        geo?.streetNumber,
        geo?.street,
        geo?.district,
        geo?.city,
      ]
        .filter(Boolean)
        .join(', ');

      const resolved = street || 'Current Location';

      setStreetAddress(resolved);
      setLat(loc.coords.latitude);
      setLng(loc.coords.longitude);

      // Update the Google autocomplete input display text
      if (googleRef.current) {
        googleRef.current.setAddressText(resolved);
      }

      emitChange(resolved, junction, loc.coords.latitude, loc.coords.longitude);
    } catch {
      Alert.alert('GPS Error', 'Could not get your location. Please type your address manually.');
    } finally {
      setGpsLoading(false);
    }
  };

  const handleJunctionChange = (text: string) => {
    setJunction(text);
    emitChange(streetAddress, text, lat, lng);
  };

  return (
    <View style={styles.wrapper}>
      {/* ── Street / Google Places row ── */}
      <Text style={[styles.label, { color: theme.text }]}>{label}</Text>
      <View style={[styles.autocompleteRow, { borderColor: theme.border }]}>
        <View style={styles.autocompleteContainer}>
          <GooglePlacesAutocomplete
            ref={googleRef}
            placeholder="Search street, area or city…"
            fetchDetails={true}
            onPress={handlePlaceSelect}
            query={{
              key: GOOGLE_MAPS_API_KEY,
              language: 'en',
              components: `country:${countryCode}`,
            }}
            styles={{
              textInput: [
                styles.googleInput,
                { color: theme.text, backgroundColor: 'transparent' },
              ],
              listView: styles.suggestionsList,
              row: styles.suggestionRow,
              description: { fontSize: 13, color: '#1C1C1E' },
              poweredContainer: { display: 'none' },
            }}
            enablePoweredByContainer={false}
            debounce={400}
            minLength={3}
            textInputProps={{
              placeholderTextColor: '#AEAEB2',
              onChangeText: (text) => {
                // If user clears or changes the field, reset coordinates
                if (text !== streetAddress) {
                  setStreetAddress(text);
                  setLat(null);
                  setLng(null);
                  emitChange(text, junction, null, null);
                }
              },
            }}
          />
        </View>
        {showGps && (
          <TouchableOpacity
            style={styles.gpsBtn}
            onPress={handleUseGps}
            disabled={gpsLoading}
            accessibilityLabel="Use GPS location"
          >
            {gpsLoading ? (
              <ActivityIndicator size="small" color="#5856D6" />
            ) : (
              <Text style={styles.gpsBtnText}>📡 GPS</Text>
            )}
          </TouchableOpacity>
        )}
      </View>

      {/* ── Junction / Landmark field ── */}
      <View style={[styles.junctionRow, { borderColor: theme.border }]}>
        <Text style={styles.junctionIcon}>🏁</Text>
        <TextInput
          style={[styles.junctionInput, { color: theme.text }]}
          placeholder="Closest junction or landmark (e.g. Rumuola Junction)"
          placeholderTextColor="#AEAEB2"
          value={junction}
          onChangeText={handleJunctionChange}
          returnKeyType="done"
          accessibilityLabel="Closest junction or landmark"
        />
      </View>

      {/* ── Assembled preview ── */}
      {(streetAddress.trim() || junction.trim()) && (
        <View style={styles.previewRow}>
          <Text style={styles.previewIcon}>📌</Text>
          <Text style={styles.previewText} numberOfLines={2}>
            {[streetAddress.trim(), junction.trim() ? `Near ${junction.trim()}` : '']
              .filter(Boolean)
              .join(', ')}
          </Text>
          {lat !== null && lng !== null && (
            <View style={styles.coordsBadge}>
              <Text style={styles.coordsText}>✅ Located</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 6,
    marginTop: 16,
  },

  // ── Autocomplete row ──────────────────────────────────────────────────────
  autocompleteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1.5,
    borderRadius: 12,
    backgroundColor: '#FFF',
    overflow: 'visible',
    zIndex: 10,
    elevation: 10,
  },
  autocompleteContainer: {
    flex: 1,
    minHeight: 46,
  },
  googleInput: {
    height: 46,
    fontSize: 14,
    paddingHorizontal: 12,
    margin: 0,
    backgroundColor: 'transparent',
  },
  suggestionsList: {
    position: 'absolute',
    top: 48,
    left: 0,
    right: 0,
    backgroundColor: '#FFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    zIndex: 999,
    elevation: 999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
  },
  suggestionRow: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F7',
  },
  gpsBtn: {
    paddingHorizontal: 12,
    paddingVertical: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gpsBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#5856D6',
  },

  // ── Junction field ────────────────────────────────────────────────────────
  junctionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: 12,
    backgroundColor: '#FFF',
    paddingHorizontal: 12,
    paddingVertical: 2,
    marginTop: 8,
    zIndex: 1,
  },
  junctionIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  junctionInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 11,
  },

  // ── Preview pill ──────────────────────────────────────────────────────────
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F0FF',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 8,
    gap: 6,
    zIndex: 1,
  },
  previewIcon: { fontSize: 14 },
  previewText: {
    flex: 1,
    fontSize: 12,
    color: '#3A3A3C',
    fontWeight: '500',
    lineHeight: 16,
  },
  coordsBadge: {
    backgroundColor: '#E8F5E9',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  coordsText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#2E7D32',
  },
});
