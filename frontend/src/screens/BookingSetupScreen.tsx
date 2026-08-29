import React, { useState, useContext } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, ActivityIndicator, Modal, Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import MapComponent from '../components/MapComponent';
import AddressInput from '../components/AddressInput';
import apiClient from '../api/client';
import { AuthContext } from '../context/AuthContext';
import { SettingsContext } from '../context/SettingsContext';
import { useCurrency } from '../context/CurrencyContext';

const TIME_SLOTS = ['08:00 AM', '10:00 AM', '12:00 PM', '02:00 PM', '04:00 PM', '06:00 PM'];

export default function BookingSetupScreen({ route, navigation }: any) {
  const preselectedHandyman = route.params?.preselectedHandyman;
  const service = route.params?.service || (preselectedHandyman ? {
    id: preselectedHandyman.specialty || 'General',
    name: `${preselectedHandyman.name} (${preselectedHandyman.specialty || 'Specialist'})`,
    category: preselectedHandyman.specialty || 'General',
    basePrice: 5000,
    description: `Book certified professional ${preselectedHandyman.name}`,
  } : {
    id: 'general-service',
    name: 'General Handyman Service',
    category: 'General',
    basePrice: 5000,
    description: 'Professional maintenance and repair service',
  });

  const { userToken } = useContext(AuthContext);
  const { theme, colorMode } = useContext(SettingsContext);
  const { fmt } = useCurrency();
  const isDark = colorMode === 'dark';

  const [address, setAddress] = useState(route.params?.savedAddress || '');
  const [latitude, setLatitude] = useState(route.params?.savedLatitude || 6.5244);
  const [longitude, setLongitude] = useState(route.params?.savedLongitude || 3.3792);
  const [selectedDate, setSelectedDate] = useState<string>(route.params?.savedDate || 'Tomorrow');
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<string>(route.params?.savedTimeSlot || '10:00 AM');
  const [autoAssign, setAutoAssign] = useState(preselectedHandyman ? false : true);
  const [loading, setLoading] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);

  const dates = [
    { label: 'Today', value: new Date().toISOString() },
    { label: 'Tomorrow', value: new Date(Date.now() + 86400000).toISOString() },
    { label: 'In 2 Days', value: new Date(Date.now() + 172800000).toISOString() },
  ];

  const bookingRedirectParams = {
    service, preselectedHandyman, savedAddress: address, savedLatitude: latitude,
    savedLongitude: longitude, savedDate: selectedDate,
    savedTimeSlot: selectedTimeSlot, autoProceed: true,
  };

  React.useEffect(() => {
    if (userToken && route.params?.autoProceed && address.trim() && !loading) {
      navigation.setParams({ autoProceed: undefined });
      handleProceedToPayment();
    }
  }, [userToken, route.params?.autoProceed]);

  const resolveScheduledDate = () => {
    const dateBase = dates.find(d => d.label === selectedDate)?.value || new Date().toISOString();
    const dt = new Date(dateBase);
    const [hourStr, minStr] = selectedTimeSlot.split(':');
    const isPm = selectedTimeSlot.includes('PM');
    let hours = parseInt(hourStr);
    if (isPm && hours !== 12) hours += 12;
    if (!isPm && hours === 12) hours = 0;
    dt.setHours(hours, parseInt(minStr), 0, 0);
    return dt;
  };

  const handleProceedToPayment = async () => {
    if (!address.trim()) {
      Alert.alert('Address Required', 'Please enter a service address before proceeding.');
      return;
    }
    const scheduledDate = resolveScheduledDate();

    if (!userToken) {
      navigation.navigate('Checkout', {
        checkoutType: 'booking', isGuest: true, service,
        bookingParams: {
          serviceId: service.id,
          scheduledAt: scheduledDate.toISOString(),
          address, latitude, longitude,
          autoAssign: preselectedHandyman ? false : autoAssign,
          handymanId: preselectedHandyman?.id || undefined,
        },
        amount: service.basePrice,
      });
      return;
    }

    setLoading(true);
    try {
      const res = await apiClient.post('/bookings', {
        serviceId: service.id,
        scheduledAt: scheduledDate.toISOString(),
        address, latitude, longitude,
        autoAssign: preselectedHandyman ? false : autoAssign,
        handymanId: preselectedHandyman?.id || undefined,
      });
      setLoading(false);
      const handyman = res.data.handyman;
      const dist = res.data.matchDistance;
      const distText = dist !== null ? ` They are ${dist} km away.` : '';

      if (handyman) {
        Alert.alert(
          '✅ Handyman Matched!',
          `We matched you with ${handyman.name}${handyman.specialty ? ` (${handyman.specialty})` : ''} — the nearest verified professional.${distText}`,
          [{ text: 'Go to Payment', onPress: () => navigation.navigate('Checkout', { checkoutType: 'booking', id: res.data.id, amount: res.data.totalPrice }) }]
        );
      } else {
        Alert.alert(
          '📋 Booking Placed',
          'No verified handyman is available near your location right now. You will be notified when one accepts.',
          [{ text: 'Continue', onPress: () => navigation.navigate('Checkout', { checkoutType: 'booking', id: res.data.id, amount: res.data.totalPrice }) }]
        );
      }
    } catch (e: any) {
      setLoading(false);
      Alert.alert('Booking Error', e.response?.data?.error || 'Failed to register scheduling details.');
    }
  };

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC' }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Auth Modal ─────────────────────────────────────────────────────── */}
      <Modal visible={showAuthModal} transparent animationType="fade" onRequestClose={() => setShowAuthModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderColor: isDark ? '#334155' : '#E2E8F0' }]}>
            <Text style={styles.modalEmoji}>🔧</Text>
            <Text style={[styles.modalTitle, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>Almost There!</Text>
            <Text style={[styles.modalSub, { color: isDark ? '#64748B' : '#94A3B8' }]}>
              Log in or sign up to book{'\n'}
              <Text style={{ fontWeight: '800', color: theme.primary }}>{service.name}</Text>.{'\n'}
              Your scheduling details are saved.
            </Text>
            <TouchableOpacity style={[styles.modalPrimary, { backgroundColor: theme.primary }]}
              onPress={() => { setShowAuthModal(false); navigation.navigate('Login', { redirectTo: 'BookingSetup', redirectParams: bookingRedirectParams }); }}>
              <Text style={styles.modalPrimaryText}>Log In to Book</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.modalSecondary, { borderColor: theme.primary + '60', backgroundColor: theme.primary + '10' }]}
              onPress={() => { setShowAuthModal(false); navigation.navigate('Signup', { redirectTo: 'BookingSetup', redirectParams: bookingRedirectParams }); }}>
              <Text style={[styles.modalSecondaryText, { color: theme.primary }]}>Create Account</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowAuthModal(false)} style={styles.modalCancelBtn}>
              <Text style={[styles.modalCancelText, { color: isDark ? '#475569' : '#94A3B8' }]}>Keep Browsing</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Service Banner ─────────────────────────────────────────────────── */}
      <LinearGradient
        colors={isDark ? ['#0F172A', '#1E293B'] : ['#F0FDF4', '#ECFDF5']}
        style={styles.serviceBanner}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      >
        <View style={[styles.serviceIconWrap, { backgroundColor: theme.primary + '22' }]}>
          <Text style={styles.serviceIcon}>🛠️</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.serviceName, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>{service.name}</Text>
          <Text style={[styles.serviceDesc, { color: isDark ? '#64748B' : '#94A3B8' }]} numberOfLines={2}>{service.description}</Text>
        </View>
        <View style={styles.servicePriceBlock}>
          <Text style={[styles.servicePriceVal, { color: theme.primary }]}>{fmt(service.basePrice)}</Text>
          <Text style={[styles.servicePriceUnit, { color: isDark ? '#64748B' : '#94A3B8' }]}>/hr</Text>
        </View>
      </LinearGradient>

      {/* ── Step 1: Schedule ───────────────────────────────────────────────── */}
      <View style={[styles.section, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderColor: isDark ? '#334155' : '#E2E8F0' }]}>
        <View style={styles.sectionHeader}>
          <View style={[styles.stepBubble, { backgroundColor: theme.primary }]}>
            <Text style={styles.stepNum}>1</Text>
          </View>
          <Text style={[styles.sectionTitle, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>Schedule Appointment</Text>
        </View>

        <Text style={[styles.fieldLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>Select Date</Text>
        <View style={styles.dateRow}>
          {dates.map(d => {
            const active = selectedDate === d.label;
            return (
              <TouchableOpacity
                key={d.label}
                style={[
                  styles.datePill,
                  { backgroundColor: active ? theme.primary : (isDark ? '#0F172A' : '#F8FAFC'), borderColor: active ? theme.primary : (isDark ? '#334155' : '#E2E8F0') }
                ]}
                onPress={() => setSelectedDate(d.label)}
              >
                <Text style={[styles.datePillText, { color: active ? '#FFF' : (isDark ? '#94A3B8' : '#64748B') }]}>
                  {d.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={[styles.fieldLabel, { color: isDark ? '#94A3B8' : '#64748B', marginTop: 14 }]}>Select Time Slot</Text>
        <View style={styles.slotsGrid}>
          {TIME_SLOTS.map(t => {
            const active = selectedTimeSlot === t;
            return (
              <TouchableOpacity
                key={t}
                style={[
                  styles.slotTile,
                  { backgroundColor: active ? theme.primary + '15' : (isDark ? '#0F172A' : '#F8FAFC'), borderColor: active ? theme.primary : (isDark ? '#334155' : '#E2E8F0') }
                ]}
                onPress={() => setSelectedTimeSlot(t)}
              >
                <Text style={[styles.slotTileText, { color: active ? theme.primary : (isDark ? '#94A3B8' : '#64748B'), fontWeight: active ? '800' : '500' }]}>
                  {t}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* ── Step 2: Location ───────────────────────────────────────────────── */}
      <View style={[styles.section, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderColor: isDark ? '#334155' : '#E2E8F0' }]}>
        <View style={styles.sectionHeader}>
          <View style={[styles.stepBubble, { backgroundColor: '#3B82F6' }]}>
            <Text style={styles.stepNum}>2</Text>
          </View>
          <Text style={[styles.sectionTitle, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>Service Location</Text>
        </View>

        <AddressInput
          label=""
          onAddressChange={(assembledAddress, lat, lng) => {
            setAddress(assembledAddress);
            if (lat !== null) setLatitude(lat);
            if (lng !== null) setLongitude(lng);
          }}
          initialValue={address}
          countryCode="ng"
        />

        <Text style={[styles.mapHint, { color: isDark ? '#475569' : '#94A3B8' }]}>
          📍 Pin your exact location on the map below:
        </Text>

        <View style={[styles.mapWrap, { borderColor: isDark ? '#334155' : '#E2E8F0' }]}>
          <MapComponent
            latitude={latitude}
            longitude={longitude}
            selectable={true}
            onLocationSelected={(lat: number, lng: number) => { setLatitude(lat); setLongitude(lng); }}
          />
        </View>
        <Text style={[styles.coordsText, { color: isDark ? '#334155' : '#CBD5E1' }]}>
          GPS: {latitude.toFixed(5)}, {longitude.toFixed(5)}
        </Text>
      </View>

      {/* ── Step 3: Assignment ─────────────────────────────────────────────── */}
      <View style={[styles.section, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderColor: isDark ? '#334155' : '#E2E8F0' }]}>
        <View style={styles.sectionHeader}>
          <View style={[styles.stepBubble, { backgroundColor: '#8B5CF6' }]}>
            <Text style={styles.stepNum}>3</Text>
          </View>
          <Text style={[styles.sectionTitle, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>Handyman Assignment</Text>
        </View>

        <TouchableOpacity
          style={[styles.toggleRow, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderColor: isDark ? '#334155' : '#E2E8F0' }]}
          onPress={() => setAutoAssign(!autoAssign)}
          activeOpacity={0.85}
        >
          <View style={{ flex: 1 }}>
            <Text style={[styles.toggleTitle, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>
              🤖 Auto-Match Nearest Specialist
            </Text>
            <Text style={[styles.toggleDesc, { color: isDark ? '#64748B' : '#94A3B8' }]}>
              Instantly assigns the closest certified professional. Highly recommended.
            </Text>
          </View>
          <View style={[styles.toggleSwitch, { backgroundColor: autoAssign ? theme.primary : (isDark ? '#334155' : '#E2E8F0') }]}>
            <View style={[styles.toggleThumb, { transform: [{ translateX: autoAssign ? 22 : 0 }] }]} />
          </View>
        </TouchableOpacity>

        {autoAssign && (
          <View style={[styles.matchNote, { backgroundColor: theme.primary + '10', borderColor: theme.primary + '30' }]}>
            <Text style={[styles.matchNoteText, { color: theme.primary }]}>
              🎯 We'll use your GPS coordinates to match the nearest verified {service.category} professional within 30 km.
            </Text>
          </View>
        )}
      </View>

      {/* ── Booking Summary + CTA ──────────────────────────────────────────── */}
      <View style={[styles.summaryCard, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderColor: isDark ? '#334155' : '#E2E8F0' }]}>
        <Text style={[styles.summaryTitle, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>Booking Summary</Text>
        {[
          { label: 'Service', value: service.name },
          { label: 'Date', value: selectedDate },
          { label: 'Time', value: selectedTimeSlot },
          { label: 'Location', value: address || 'Not set yet' },
        ].map(row => (
          <View key={row.label} style={[styles.summaryRow, { borderBottomColor: isDark ? '#334155' : '#F1F5F9' }]}>
            <Text style={[styles.summaryLabel, { color: isDark ? '#64748B' : '#94A3B8' }]}>{row.label}</Text>
            <Text style={[styles.summaryValue, { color: isDark ? '#F1F5F9' : '#0F172A' }]} numberOfLines={1}>{row.value}</Text>
          </View>
        ))}
        <View style={[styles.summaryRow, { borderBottomColor: 'transparent' }]}>
          <Text style={[styles.summaryTotalLabel, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>Base Rate</Text>
          <Text style={[styles.summaryTotalValue, { color: theme.primary }]}>{fmt(service.basePrice)}/hr</Text>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.bookBtn, { backgroundColor: theme.primary, opacity: loading ? 0.8 : 1 }]}
        onPress={handleProceedToPayment}
        disabled={loading}
        activeOpacity={0.85}
      >
        {loading ? (
          <ActivityIndicator color="#FFF" />
        ) : (
          <>
            <Text style={styles.bookBtnText}>✅ Confirm & Go to Payment</Text>
            <Text style={styles.bookBtnSub}>{selectedDate} · {selectedTimeSlot}</Text>
          </>
        )}
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16 },

  // Service Banner
  serviceBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 18, padding: 18, marginBottom: 14, overflow: 'hidden',
  },
  serviceIconWrap: { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  serviceIcon: { fontSize: 26 },
  serviceName: { fontSize: 17, fontWeight: '900', marginBottom: 3 },
  serviceDesc: { fontSize: 12, lineHeight: 17 },
  servicePriceBlock: { alignItems: 'flex-end' },
  servicePriceVal: { fontSize: 22, fontWeight: '900' },
  servicePriceUnit: { fontSize: 10, fontWeight: '600' },

  // Sections
  section: {
    borderRadius: 18, borderWidth: 1, padding: 18, marginBottom: 14,
    shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  stepBubble: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  stepNum: { color: '#FFF', fontSize: 13, fontWeight: '900' },
  sectionTitle: { fontSize: 16, fontWeight: '800' },
  fieldLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 },

  // Date pills
  dateRow: { flexDirection: 'row', gap: 8 },
  datePill: {
    paddingHorizontal: 16, paddingVertical: 9,
    borderRadius: 20, borderWidth: 1.5,
  },
  datePillText: { fontSize: 13, fontWeight: '700' },

  // Time slots
  slotsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  slotTile: {
    width: '31%', paddingVertical: 11,
    borderRadius: 10, borderWidth: 1.5, alignItems: 'center',
  },
  slotTileText: { fontSize: 13 },

  // Map
  mapHint: { fontSize: 12, marginBottom: 8, marginTop: 8 },
  mapWrap: { height: 220, borderRadius: 14, borderWidth: 1, overflow: 'hidden', marginBottom: 6 },
  coordsText: { fontSize: 10, textAlign: 'right' },

  // Toggle
  toggleRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    borderRadius: 14, borderWidth: 1, padding: 14,
  },
  toggleTitle: { fontSize: 14, fontWeight: '800', marginBottom: 3 },
  toggleDesc: { fontSize: 12, lineHeight: 17 },
  toggleSwitch: { width: 50, height: 28, borderRadius: 14, padding: 2, justifyContent: 'center' },
  toggleThumb: {
    width: 24, height: 24, borderRadius: 12, backgroundColor: '#FFF',
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 2, elevation: 1,
  },
  matchNote: {
    marginTop: 10, borderRadius: 10, borderWidth: 1, padding: 10,
  },
  matchNoteText: { fontSize: 12, lineHeight: 18 },

  // Summary
  summaryCard: {
    borderRadius: 18, borderWidth: 1, padding: 18, marginBottom: 14,
    shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2,
  },
  summaryTitle: { fontSize: 16, fontWeight: '800', marginBottom: 12 },
  summaryRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1,
  },
  summaryLabel: { fontSize: 12, fontWeight: '600' },
  summaryValue: { fontSize: 13, fontWeight: '700', maxWidth: '60%', textAlign: 'right' },
  summaryTotalLabel: { fontSize: 14, fontWeight: '800' },
  summaryTotalValue: { fontSize: 20, fontWeight: '900' },

  // CTA
  bookBtn: {
    borderRadius: 16, paddingVertical: 18, alignItems: 'center',
    shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.25, shadowRadius: 12, elevation: 6,
  },
  bookBtnText: { color: '#FFF', fontSize: 16, fontWeight: '900' },
  bookBtnSub: { color: 'rgba(255,255,255,0.75)', fontSize: 11, marginTop: 3 },

  // Modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  modalCard: {
    width: '100%', maxWidth: 400, borderRadius: 24, padding: 28,
    alignItems: 'center', borderWidth: 1,
    shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.15, shadowRadius: 24, elevation: 10,
  },
  modalEmoji: { fontSize: 44, marginBottom: 12 },
  modalTitle: { fontSize: 22, fontWeight: '900', marginBottom: 8, textAlign: 'center' },
  modalSub: { fontSize: 14, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  modalPrimary: {
    width: '100%', paddingVertical: 15, borderRadius: 12, alignItems: 'center', marginBottom: 10,
  },
  modalPrimaryText: { color: '#FFF', fontSize: 15, fontWeight: '800' },
  modalSecondary: {
    width: '100%', paddingVertical: 15, borderRadius: 12,
    alignItems: 'center', borderWidth: 1.5, marginBottom: 16,
  },
  modalSecondaryText: { fontSize: 15, fontWeight: '800' },
  modalCancelBtn: { paddingVertical: 8 },
  modalCancelText: { fontSize: 13, fontWeight: '500' },
});
