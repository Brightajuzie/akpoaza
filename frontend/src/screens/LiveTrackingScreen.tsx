import React, { useEffect, useState, useContext, useRef } from 'react';
import { View, Text, StyleSheet, Alert, TouchableOpacity } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import io from 'socket.io-client';
import { AuthContext } from '../context/AuthContext';
import { SettingsContext } from '../context/SettingsContext';

const SOCKET_URL = process.env.EXPO_PUBLIC_API_URL?.replace('/api', '') || 'http://172.20.10.2:5000';

export default function LiveTrackingScreen({ route, navigation }: any) {
  const { bookingId, role } = route.params; // role: 'CUSTOMER' or 'HANDYMAN'
  const { theme } = useContext(SettingsContext);
  const { userToken } = useContext(AuthContext);

  const [location, setLocation] = useState<any>(null);
  const [partnerLocation, setPartnerLocation] = useState<any>(null);
  const socketRef = useRef<any>(null);
  const mapRef = useRef<MapView>(null);

  useEffect(() => {
    // Initialize socket
    socketRef.current = io(SOCKET_URL);
    
    socketRef.current.on('connect', () => {
      socketRef.current.emit('join_booking', bookingId);
    });

    socketRef.current.on('location_update', (data: any) => {
      setPartnerLocation({
        latitude: data.latitude,
        longitude: data.longitude,
      });
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [bookingId]);

  useEffect(() => {
    let locationSubscription: any;

    const startTracking = async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Location access is needed for live tracking.');
        return;
      }

      let loc = await Location.getCurrentPositionAsync({});
      setLocation({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      });

      locationSubscription = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 5000, distanceInterval: 10 },
        (newLocation) => {
          const lat = newLocation.coords.latitude;
          const lng = newLocation.coords.longitude;
          setLocation((prev: any) => ({
            ...prev,
            latitude: lat,
            longitude: lng,
          }));

          // Emit to partner
          if (socketRef.current) {
            socketRef.current.emit('update_location', {
              bookingId,
              latitude: lat,
              longitude: lng,
            });
          }
        }
      );
    };

    startTracking();

    return () => {
      if (locationSubscription) {
        locationSubscription.remove();
      }
    };
  }, [bookingId]);

  const fitMapToMarkers = () => {
    if (mapRef.current && location && partnerLocation) {
      mapRef.current.fitToCoordinates(
        [
          { latitude: location.latitude, longitude: location.longitude },
          { latitude: partnerLocation.latitude, longitude: partnerLocation.longitude }
        ],
        { edgePadding: { top: 50, right: 50, bottom: 50, left: 50 }, animated: true }
      );
    }
  };

  useEffect(() => {
    fitMapToMarkers();
  }, [location, partnerLocation]);

  return (
    <View style={styles.container}>
      {location ? (
        <MapView
          ref={mapRef}
          style={styles.map}
          initialRegion={location}
          showsUserLocation={true}
        >
          {partnerLocation && (
            <Marker
              coordinate={partnerLocation}
              title={role === 'CUSTOMER' ? 'Handyman Location' : 'Customer Location'}
              pinColor="blue"
            />
          )}
        </MapView>
      ) : (
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Acquiring Location...</Text>
        </View>
      )}

      <View style={styles.overlay}>
        <Text style={styles.statusText}>
          {partnerLocation ? 'Partner connected' : 'Waiting for partner...'}
        </Text>
        <TouchableOpacity style={[styles.btn, { backgroundColor: theme.primary }]} onPress={() => fitMapToMarkers()}>
          <Text style={styles.btnText}>Recenter</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { width: '100%', height: '100%' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { fontSize: 16, fontWeight: '600' },
  overlay: {
    position: 'absolute',
    bottom: 30,
    left: 20,
    right: 20,
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 3,
  },
  statusText: { fontSize: 14, fontWeight: '700' },
  btn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  btnText: { color: '#fff', fontWeight: 'bold' }
});
