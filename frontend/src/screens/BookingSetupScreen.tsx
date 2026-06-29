import React, { useState, useContext } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Alert, ActivityIndicator, Modal } from 'react-native';
import MapComponent from '../components/MapComponent';
import AddressInput from '../components/AddressInput';
import apiClient from '../api/client';
import { AuthContext } from '../context/AuthContext';
import { SettingsContext } from '../context/SettingsContext';

export default function BookingSetupScreen({ route, navigation }: any) {
  const { service } = route.params;
  const { userToken } = useContext(AuthContext);
  const { theme } = useContext(SettingsContext);

  const [address, setAddress] = useState(route.params?.savedAddress || '');
  const [latitude, setLatitude] = useState(route.params?.savedLatitude || 40.7128);
  const [longitude, setLongitude] = useState(route.params?.savedLongitude || -74.0060);
  const [selectedDate, setSelectedDate] = useState<string>(route.params?.savedDate || 'Tomorrow');
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<string>(route.params?.savedTimeSlot || '10:00 AM');
  const [autoAssign, setAutoAssign] = useState<boolean>(true);
  const [loading, setLoading] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);

  const dates = [
    { label: 'Today', value: new Date().toISOString() },
    { label: 'Tomorrow', value: new Date(Date.now() + 86400000).toISOString() },
    { label: 'In 2 Days', value: new Date(Date.now() + 172800000).toISOString() },
  ];

  const timeSlots = [
    '08:00 AM', '10:00 AM', '12:00 PM', '02:00 PM', '04:00 PM', '06:00 PM'
  ];

  const handleLocationSelected = (lat: number, lng: number) => {
    setLatitude(lat);
    setLongitude(lng);
  };

  const handleProceedToPayment = async () => {
    if (!address.trim()) {
      Alert.alert('Address Required', 'Please enter a delivery/service address.');
      return;
    }

    // Guest guard — preserve all form state in navigation params for restoration after auth
    if (!userToken) {
      setShowAuthModal(true);
      return;
    }

    setLoading(true);

    try {
      // Resolve scheduling datetime
      const dateBase = dates.find(d => d.label === selectedDate)?.value || new Date().toISOString();
      const scheduledDate = new Date(dateBase);
      const [hourStr, minStr] = selectedTimeSlot.split(':');
      const isPm = selectedTimeSlot.includes('PM');
      let hours = parseInt(hourStr);
      if (isPm && hours !== 12) hours += 12;
      if (!isPm && hours === 12) hours = 0;
      scheduledDate.setHours(hours, parseInt(minStr), 0, 0);

      // Create Booking API call
      const response = await apiClient.post('/bookings', {
        serviceId: service.id,
        scheduledAt: scheduledDate.toISOString(),
        address,
        latitude,
        longitude,
        autoAssign,
      });

      // Reset loading and navigate to checkout
      setLoading(false);
      
      const assignedHandyman = response.data.handyman;
      const matchDistance = response.data.matchDistance;
      if (assignedHandyman) {
        const distText = matchDistance !== null ? ` They are ${matchDistance} km away.` : '';
        Alert.alert(
          '✅ Handyman Matched!',
          `We matched you with ${assignedHandyman.name}${assignedHandyman.specialty ? ` (${assignedHandyman.specialty})` : ''} — the nearest verified professional.${distText}`,
          [
            {
              text: 'Go to Payment',
              onPress: () => {
                navigation.navigate('Checkout', {
                  checkoutType: 'booking',
                  id: response.data.id,
                  amount: response.data.totalPrice,
                });
              }
            }
          ]
        );
      } else {
        // No verified handyman found within radius — still create booking as PENDING
        Alert.alert(
          '📋 Booking Placed',
          'No verified handyman is available near your location right now. Your booking has been placed and you will be notified when one accepts.',
          [
            {
              text: 'Continue',
              onPress: () => navigation.navigate('Checkout', {
                checkoutType: 'booking',
                id: response.data.id,
                amount: response.data.totalPrice,
              }),
            }
          ]
        );
      }
    } catch (error: any) {
      setLoading(false);
      console.error(error);
      Alert.alert('Booking Error', error.response?.data?.error || 'Failed to register scheduling details.');
    }
  };

  const bookingRedirectParams = {
    service,
    savedAddress: address,
    savedLatitude: latitude,
    savedLongitude: longitude,
    savedDate: selectedDate,
    savedTimeSlot: selectedTimeSlot,
  };

  return (
    <ScrollView 
      style={[styles.container, { backgroundColor: theme.background }]} 
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      {/* Auth Gate Modal for Guests */}
      <Modal
        visible={showAuthModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAuthModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { borderColor: theme.border }]}>
            <Text style={styles.modalIcon}>🔧</Text>
            <Text style={styles.modalTitle}>Almost There!</Text>
            <Text style={styles.modalSubtitle}>
              Log in or create an account to book{'\n'}
              <Text style={{ fontWeight: '700', color: '#1C1C1E' }}>{service.name}</Text>.{'\n'}
              Your scheduling details will be saved.
            </Text>
            <TouchableOpacity
              style={[styles.modalPrimaryBtn, { backgroundColor: theme.primary }]}
              onPress={() => {
                setShowAuthModal(false);
                navigation.navigate('Login', {
                  redirectTo: 'BookingSetup',
                  redirectParams: bookingRedirectParams,
                });
              }}
            >
              <Text style={styles.modalPrimaryText}>Log In to Book</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalSecondaryBtn, { borderColor: theme.primary }]}
              onPress={() => {
                setShowAuthModal(false);
                navigation.navigate('Signup', {
                  redirectTo: 'BookingSetup',
                  redirectParams: bookingRedirectParams,
                });
              }}
            >
              <Text style={[styles.modalSecondaryText, { color: theme.primary }]}>Create Account</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowAuthModal(false)} style={styles.modalCancelBtn}>
              <Text style={styles.modalCancelText}>Keep Browsing</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Text style={styles.serviceName}>{service.name}</Text>
      <Text style={styles.serviceDesc}>{service.description}</Text>
      
      <View style={[styles.divider, { backgroundColor: theme.border }]} />

      {/* Auto-Scheduling Calendar Selection */}
      <Text style={styles.sectionTitle}>1. Schedule Appointment</Text>
      
      <Text style={styles.label}>Select Date</Text>
      <View style={styles.optionsRow}>
        {dates.map(d => {
          const isActive = selectedDate === d.label;
          return (
            <TouchableOpacity
              key={d.label}
              style={[
                styles.pill, 
                isActive && { backgroundColor: theme.primary, borderColor: theme.primary }
              ]}
              onPress={() => setSelectedDate(d.label)}
            >
              <Text style={[styles.pillText, isActive && { color: '#FFF' }]}>
                {d.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.label}>Select Available Slot</Text>
      <View style={styles.slotsGrid}>
        {timeSlots.map(t => {
          const isActive = selectedTimeSlot === t;
          return (
            <TouchableOpacity
              key={t}
              style={[
                styles.slotBadge, 
                { borderColor: theme.border },
                isActive && { backgroundColor: theme.primary + '12', borderColor: theme.primary }
              ]}
              onPress={() => setSelectedTimeSlot(t)}
            >
              <Text style={[styles.slotText, isActive && { color: theme.primary, fontWeight: '700' }]}>
                {t}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={[styles.divider, { backgroundColor: theme.border }]} />

      {/* Location Mapping Input */}
      <Text style={styles.sectionTitle}>2. Service Location</Text>

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

      <Text style={styles.subtext}>Pin exact location on map below (or let GPS fill it):</Text>

      <View style={[styles.mapCard, { borderColor: theme.border }]}>
        <MapComponent
          latitude={latitude}
          longitude={longitude}
          selectable={true}
          onLocationSelected={handleLocationSelected}
        />
      </View>
      <Text style={styles.coordinatesText}>
        GPS Coordinates: {latitude.toFixed(6)}, {longitude.toFixed(6)}
      </Text>

      <View style={[styles.divider, { backgroundColor: theme.border }]} />

      {/* Intelligent Matchmaking Option */}
      <Text style={styles.sectionTitle}>3. Handyman Assignment</Text>
      <View style={[styles.toggleRow, { borderColor: theme.border }]}>
        <View style={styles.toggleTextContainer}>
          <Text style={styles.toggleTitle}>Auto-Match Closest Provider</Text>
          <Text style={styles.toggleDesc}>
            Instantly assign the nearest certified professional. Highly recommended.
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.switchContainer, autoAssign ? { backgroundColor: theme.primary } : styles.switchOff]}
          onPress={() => setAutoAssign(!autoAssign)}
        >
          <View style={[styles.switchThumb, autoAssign ? styles.switchThumbOn : styles.switchThumbOff]} />
        </TouchableOpacity>
      </View>

      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>Total Price:</Text>
        <Text style={[styles.totalAmount, { color: theme.primary }]}>${service.basePrice.toFixed(2)}</Text>
      </View>

      <TouchableOpacity
        style={[styles.bookButton, { backgroundColor: theme.primary, shadowColor: theme.primary }]}
        onPress={handleProceedToPayment}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.bookButtonText}>Confirm & Go to Payment</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // Auth modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#FFF',
    borderRadius: 24,
    padding: 32,
    width: '100%',
    alignItems: 'center',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 10,
  },
  modalIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1C1C1E',
    marginBottom: 8,
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#8E8E93',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
  },
  modalPrimaryBtn: {
    width: '100%',
    height: 50,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalPrimaryText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  modalSecondaryBtn: {
    width: '100%',
    height: 50,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    marginBottom: 16,
  },
  modalSecondaryText: {
    fontSize: 16,
    fontWeight: '700',
  },
  modalCancelBtn: {
    paddingVertical: 8,
  },
  modalCancelText: {
    color: '#8E8E93',
    fontSize: 14,
  },
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 24,
  },
  serviceName: {
    fontSize: 24,
    fontWeight: '800',
    color: '#1C1C1E',
    marginBottom: 8,
  },
  serviceDesc: {
    fontSize: 15,
    color: '#8E8E93',
    lineHeight: 22,
  },
  divider: {
    height: 1,
    marginVertical: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1C1C1E',
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3A3A3C',
    marginTop: 8,
    marginBottom: 12,
  },
  optionsRow: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  pill: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#D1D1D6',
    marginRight: 10,
    backgroundColor: '#FFF',
  },
  pillText: {
    color: '#3A3A3C',
    fontSize: 14,
    fontWeight: '600',
  },
  slotsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -4,
  },
  slotBadge: {
    paddingVertical: 12,
    width: '31%',
    margin: '1.1%',
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    backgroundColor: '#FFF',
  },
  slotText: {
    fontSize: 13,
    color: '#3A3A3C',
    fontWeight: '500',
  },
  input: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#D1D1D6',
    borderRadius: 12,
    height: 52,
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#1C1C1E',
    marginBottom: 12,
  },
  subtext: {
    fontSize: 14,
    color: '#8E8E93',
    marginBottom: 8,
  },
  mapCard: {
    height: 220,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 8,
  },
  coordinatesText: {
    fontSize: 12,
    color: '#8E8E93',
    textAlign: 'right',
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFF',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  toggleTextContainer: {
    flex: 1,
    marginRight: 16,
  },
  toggleTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1C1C1E',
    marginBottom: 4,
  },
  toggleDesc: {
    fontSize: 13,
    color: '#8E8E93',
    lineHeight: 18,
  },
  switchContainer: {
    width: 50,
    height: 28,
    borderRadius: 14,
    padding: 2,
    justifyContent: 'center',
  },
  switchOff: {
    backgroundColor: '#E5E5EA',
  },
  switchThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 1,
  },
  switchThumbOn: {
    transform: [{ translateX: 22 }],
  },
  switchThumbOff: {
    transform: [{ translateX: 0 }],
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 32,
    marginBottom: 20,
  },
  totalLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: '#3A3A3C',
  },
  totalAmount: {
    fontSize: 28,
    fontWeight: '800',
  },
  bookButton: {
    height: 54,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 3,
    marginBottom: 40,
  },
  bookButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
