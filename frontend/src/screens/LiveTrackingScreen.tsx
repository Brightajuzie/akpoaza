import React, { useEffect, useState, useContext, useRef } from 'react';
import { View, Text, StyleSheet, Alert, TouchableOpacity } from 'react-native';
import MapComponent from '../components/MapComponent';
import * as Location from 'expo-location';
import io from 'socket.io-client';
import { AuthContext } from '../context/AuthContext';
import { SettingsContext } from '../context/SettingsContext';

const SOCKET_URL = process.env.EXPO_PUBLIC_API_URL?.replace('/api', '') || 'http://172.20.10.2:5000';

export default function LiveTrackingScreen({ route, navigation }: any) {
  const { bookingId, orderId, role } = route.params; // role: 'CUSTOMER', 'HANDYMAN', 'RIDER', 'ADMIN'
  const { theme } = useContext(SettingsContext);
  const { userToken } = useContext(AuthContext);

  const [location, setLocation] = useState<any>(null); // For Customer, Handyman, Rider
  const [partnerLocation, setPartnerLocation] = useState<any>(null); // For Customer, Handyman, Rider
  const [adminCustomerLoc, setAdminCustomerLoc] = useState<any>(null); // For Admin
  const [adminHandymanLoc, setAdminHandymanLoc] = useState<any>(null); // For Admin
  const socketRef = useRef<any>(null);
  const [recenterCount, setRecenterCount] = useState(0);

  const isOrder = !!orderId;
  const joinEvent = isOrder ? 'join_order' : 'join_booking';
  const locationUpdateEvent = isOrder ? 'order_location_update' : 'location_update';
  const updateLocationEvent = isOrder ? 'update_order_location' : 'update_location';
  const idToJoin = orderId || bookingId;

  const isOrder = !!orderId;
  const joinEvent = isOrder ? 'join_order' : 'join_booking';
  const locationUpdateEvent = isOrder ? 'order_location_update' : 'location_update';
  const updateLocationEvent = isOrder ? 'update_order_location' : 'update_location';
  const idToJoin = orderId || bookingId;

  useEffect(() => {
    // Initialize socket
    socketRef.current = io(SOCKET_URL);
    
    socketRef.current.on('connect', () => {
      socketRef.current.emit(joinEvent, idToJoin);
    });

    socketRef.current.on(locationUpdateEvent, (data: any) => {
      if (role === 'ADMIN') {
        if (data.role === 'CUSTOMER') {
          setAdminCustomerLoc({ latitude: data.latitude, longitude: data.longitude });
        } else if (data.role === 'HANDYMAN' || data.role === 'RIDER') {
          setAdminHandymanLoc({ latitude: data.latitude, longitude: data.longitude });
        }
      } else {
        setPartnerLocation({
          latitude: data.latitude,
          longitude: data.longitude,
        });
      }
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [idToJoin, role]);

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
            socketRef.current.emit(updateLocationEvent, {
              bookingId,
              orderId,
              role,
              latitude: lat,
              longitude: lng,
            });
          }
        }
      );
    };

    if (role !== 'ADMIN') {
      startTracking();
    } else {
      // Admin doesn't need to track own location, just show the map roughly centered.
      setLocation({
        latitude: 9.0820,
        longitude: 8.6753, // rough center (e.g. Nigeria), will auto-recenter later
        latitudeDelta: 5.0,
        longitudeDelta: 5.0,
      });
    }

    return () => {
      if (locationSubscription) {
        locationSubscription.remove();
      }
    };
  }, [idToJoin, role]);

  const fitMapToMarkers = () => {
<<<<<<< HEAD
    setRecenterCount(prev => prev + 1);
  };

  const getMapParams = () => {
    if (role === 'ADMIN') {
      return {
        latitude: adminCustomerLoc?.latitude ?? location?.latitude ?? 9.0820,
        longitude: adminCustomerLoc?.longitude ?? location?.longitude ?? 8.6753,
        providerLat: adminHandymanLoc?.latitude,
        providerLng: adminHandymanLoc?.longitude,
      };
    } else if (role === 'CUSTOMER') {
      return {
        latitude: location?.latitude ?? 0,
        longitude: location?.longitude ?? 0,
        providerLat: partnerLocation?.latitude,
        providerLng: partnerLocation?.longitude,
      };
    } else {
      // HANDYMAN or RIDER
      return {
        latitude: partnerLocation?.latitude ?? location?.latitude ?? 0,
        longitude: partnerLocation?.longitude ?? location?.longitude ?? 0,
        providerLat: location?.latitude,
        providerLng: location?.longitude,
      };
    }
  };

  const mapParams = getMapParams();
=======
    if (mapRef.current) {
      if (role === 'ADMIN') {
        if (adminCustomerLoc && adminHandymanLoc) {
          mapRef.current.fitToCoordinates([adminCustomerLoc, adminHandymanLoc], { edgePadding: { top: 50, right: 50, bottom: 50, left: 50 }, animated: true });
        } else if (adminCustomerLoc) {
          mapRef.current.animateToRegion({ ...adminCustomerLoc, latitudeDelta: 0.05, longitudeDelta: 0.05 });
        } else if (adminHandymanLoc) {
          mapRef.current.animateToRegion({ ...adminHandymanLoc, latitudeDelta: 0.05, longitudeDelta: 0.05 });
        }
      } else {
        if (location && partnerLocation) {
          mapRef.current.fitToCoordinates(
            [
              { latitude: location.latitude, longitude: location.longitude },
              { latitude: partnerLocation.latitude, longitude: partnerLocation.longitude }
            ],
            { edgePadding: { top: 50, right: 50, bottom: 50, left: 50 }, animated: true }
          );
        }
      }
    }
  };

  useEffect(() => {
    fitMapToMarkers();
  }, [location, partnerLocation, adminCustomerLoc, adminHandymanLoc]);
>>>>>>> d74cc15965da6815edf7abdf37c172020b892227

  return (
    <View style={styles.container}>
      {location ? (
<<<<<<< HEAD
        <MapComponent
          latitude={mapParams.latitude}
          longitude={mapParams.longitude}
          providerLat={mapParams.providerLat}
          providerLng={mapParams.providerLng}
          recenterTrigger={recenterCount}
        />
=======
        <MapView
          ref={mapRef}
          style={styles.map}
          initialRegion={location}
          showsUserLocation={role !== 'ADMIN'}
        >
          {role === 'ADMIN' ? (
            <>
              {adminCustomerLoc && (
                <Marker coordinate={adminCustomerLoc} title="Customer Location" pinColor="green" />
              )}
              {adminHandymanLoc && (
                <Marker coordinate={adminHandymanLoc} title={isOrder ? 'Rider Location' : 'Handyman Location'} pinColor="blue" />
              )}
            </>
          ) : (
            partnerLocation && (
              <Marker
                coordinate={partnerLocation}
                title={role === 'CUSTOMER' ? (isOrder ? 'Rider Location' : 'Handyman Location') : 'Customer Location'}
                pinColor="blue"
              />
            )
          )}
        </MapView>
>>>>>>> d74cc15965da6815edf7abdf37c172020b892227
      ) : (
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Acquiring Location...</Text>
        </View>
      )}

      <View style={styles.overlay}>
        <Text style={styles.statusText}>
          {role === 'ADMIN' 
            ? ((adminCustomerLoc && adminHandymanLoc) ? 'Both connected' : 'Waiting for users...')
            : (partnerLocation ? 'Partner connected' : 'Waiting for partner...')}
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
