import React, { useEffect, useState, useContext, useRef } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, TouchableOpacity, Alert, Modal, TextInput, ScrollView, Animated, Linking } from 'react-native';
import apiClient from '../api/client';
import { AuthContext } from '../context/AuthContext';
import { SettingsContext } from '../context/SettingsContext';
import MapComponent from '../components/MapComponent';

export default function HistoryScreen({ route, navigation }: any) {
  const { type, role } = route.params || { type: 'orders', role: 'CUSTOMER' };
  const { userInfo, userToken } = useContext(AuthContext);
  const { theme } = useContext(SettingsContext);
  const [activeTab, setActiveTab] = useState<'main' | 'parcels'>(route.params?.tab === 'parcels' ? 'parcels' : 'main');
  const [data, setData] = useState<any[]>([]);
  const [parcels, setParcels] = useState<any[]>([]);
  const [parcelsLoading, setParcelsLoading] = useState(false);
  const [loading, setLoading] = useState(true);

  // Live tracking (customer)
  const [activeTrackingId, setActiveTrackingId] = useState<string | null>(null);
  const [liveLocationData, setLiveLocationData] = useState<any>(null);

  // Live pulse animation
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Handyman location broadcast ref
  const locationBroadcastRef = useRef<any>(null);

  // Review modal states
  const [reviewModalVisible, setReviewModalVisible] = useState(false);
  const [reviewTarget, setReviewTarget] = useState<any>(null);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewedIds, setReviewedIds] = useState<Set<string>>(new Set());

  const fetchData = async () => {
    setLoading(true);
    try {
      const endpoint = type === 'orders' 
        ? (role === 'VENDOR' ? '/orders/vendor' : role === 'RIDER' ? '/orders/rider/available' : '/orders') 
        : '/bookings';
      const response = await apiClient.get(endpoint);
      setData(response.data);
    } catch (error) {
      console.error(`Failed to fetch ${type}`, error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (userToken) {
      fetchData();
      fetchParcels();
    } else {
      setLoading(false);
    }
  }, [type, userToken]);

  const fetchParcels = async () => {
    setParcelsLoading(true);
    try {
      const isRider = userInfo?.role === 'RIDER';
      const endpoint = isRider ? '/parcels/rider/available' : '/parcels';
      const res = await apiClient.get(endpoint);
      setParcels(res.data || []);
    } catch (e) {
      console.error('Failed to fetch parcels', e);
    } finally {
      setParcelsLoading(false);
    }
  };

  // Pulse animation loop
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.4, duration: 700, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,   duration: 700, useNativeDriver: true }),
      ])
    );
    if (activeTrackingId) loop.start();
    else { loop.stop(); pulseAnim.setValue(1); }
    return () => loop.stop();
  }, [activeTrackingId]);

  // Customer: poll handyman's live location every 5 s
  useEffect(() => {
    let interval: any = null;

    if (activeTrackingId) {
      const fetchLiveCoords = async () => {
        try {
          const response = await apiClient.get(`/bookings/${activeTrackingId}/location`);
          setLiveLocationData(response.data);
        } catch (e) {
          console.error('Failed to fetch live coordinates', e);
        }
      };
      fetchLiveCoords();
      interval = setInterval(fetchLiveCoords, 5000);
    } else {
      setLiveLocationData(null);
    }

    return () => { if (interval) clearInterval(interval); };
  }, [activeTrackingId]);

  // Handyman/Rider: broadcast own location every 5 s when they have an active job/delivery
  useEffect(() => {
    const isHandyman = userInfo?.role === 'HANDYMAN';
    const isRider = userInfo?.role === 'RIDER';
    if (!isHandyman && !isRider) return;

    const activeItem = isHandyman
      ? data.find((b) => b.status === 'ACCEPTED')
      : data.find((o) => (o.status === 'PAID' || o.status === 'SHIPPED') && o.riderId === userInfo?.id);

    if (!activeItem) {
      if (locationBroadcastRef.current) {
        clearInterval(locationBroadcastRef.current);
        locationBroadcastRef.current = null;
      }
      return;
    }

    const pushLocation = async () => {
      try {
        let lat: number | null = null;
        let lng: number | null = null;

        // Try expo-location (native)
        try {
          const ExpoLocation = require('expo-location');
          const { status } = await ExpoLocation.requestForegroundPermissionsAsync();
          if (status === 'granted') {
            const pos = await ExpoLocation.getCurrentPositionAsync({ accuracy: ExpoLocation.Accuracy.High });
            lat = pos.coords.latitude;
            lng = pos.coords.longitude;
          }
        } catch (_) {
          // Web fallback — Geolocation API
          if (typeof navigator !== 'undefined' && navigator.geolocation) {
            await new Promise<void>((resolve) => {
              navigator.geolocation.getCurrentPosition(
                (pos) => { lat = pos.coords.latitude; lng = pos.coords.longitude; resolve(); },
                () => resolve(),
                { enableHighAccuracy: true, timeout: 5000 }
              );
            });
          }
        }

        if (lat !== null && lng !== null) {
          await apiClient.patch('/users/location', { latitude: lat, longitude: lng });
        }
      } catch (err) {
        console.warn('Location broadcast failed:', err);
      }
    };

    pushLocation();
    locationBroadcastRef.current = setInterval(pushLocation, 5000);

    return () => {
      if (locationBroadcastRef.current) {
        clearInterval(locationBroadcastRef.current);
        locationBroadcastRef.current = null;
      }
    };
  }, [data, userInfo?.role]);

  const handleCompleteJob = async (id: string) => {
    try {
      await apiClient.patch(`/bookings/${id}/status`, { status: 'COMPLETED' });
      Alert.alert('Success', 'Job completed successfully! Location sharing deactivated.');
      fetchData(); // refresh list
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'Failed to update job status.');
    }
  };

  const handleConfirmReceipt = async (orderId: string) => {
    try {
      await apiClient.post(`/orders/${orderId}/confirm-receipt`);
      Alert.alert('Receipt Confirmed', 'Payment has been released to the vendor. Thank you!');
      fetchData();
    } catch (error: any) {
      console.error(error);
      Alert.alert('Error', error.response?.data?.error || 'Failed to confirm receipt.');
    }
  };

  const handleConfirmBookingCompletion = async (bookingId: string) => {
    try {
      await apiClient.post(`/bookings/${bookingId}/confirm-completion`);
      Alert.alert('Completion Confirmed', 'Payment has been released to the handyman. Thank you!');
      fetchData();
    } catch (error: any) {
      console.error(error);
      Alert.alert('Error', error.response?.data?.error || 'Failed to confirm completion.');
    }
  };

  // Review Modal Handlers
  const openReviewModal = (item: any, reviewType: 'booking' | 'order') => {
    setReviewTarget({ item, reviewType });
    setReviewRating(0);
    setReviewComment('');
    setReviewModalVisible(true);
  };

  const handleSubmitReview = async () => {
    if (reviewRating === 0) {
      Alert.alert('Rating Required', 'Please select at least 1 star.');
      return;
    }
    if (!reviewTarget) return;
    setReviewSubmitting(true);
    try {
      const { item, reviewType } = reviewTarget;
      const payload: any = { rating: reviewRating, comment: reviewComment };
      if (reviewType === 'booking') {
        payload.serviceId = item.serviceId;
        payload.handymanId = item.handymanId;
      } else {
        // For orders, review the first product in the order
        if (item.items && item.items[0]) {
          payload.productId = item.items[0].productId;
        }
      }
      await apiClient.post('/reviews', payload);
      setReviewedIds(prev => new Set([...prev, item.id]));
      setReviewModalVisible(false);
      Alert.alert('⭐ Thank You!', 'Your review has been submitted successfully.');
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.error || 'Failed to submit review.');
    } finally {
      setReviewSubmitting(false);
    }
  };
  const handleRiderAcceptDelivery = async (id: string) => {
    try {
      await apiClient.patch(`/orders/${id}/accept-delivery`);
      Alert.alert('Accepted', 'Delivery accepted successfully. Live location sharing started.');
      fetchData();
    } catch (e) {
      Alert.alert('Error', 'Failed to accept delivery.');
    }
  };

  const handleUpdateDeliveryStatus = async (id: string, nextStatus: 'SHIPPED' | 'DELIVERED') => {
    try {
      await apiClient.patch(`/orders/${id}/status`, { status: nextStatus });
      Alert.alert('Success', `Delivery status updated to ${nextStatus}.`);
      fetchData();
    } catch (e) {
      Alert.alert('Error', 'Failed to update delivery status.');
    }
  };

  const renderRiderDeliveryItem = ({ item }: any) => {
    const isAssignedToMe = item.riderId === userInfo?.id;
    const canAccept = !item.riderId;
    
    return (
      <View style={[styles.card, { borderColor: theme.border }]}>
        <View style={styles.cardHeader}>
          <Text style={styles.idText}>Delivery #{item.id.substring(0, 8)}</Text>
          <View style={[
            styles.badge, 
            item.status === 'PAID' || item.status === 'DELIVERED'
              ? { backgroundColor: theme.primary + '15' } 
              : { backgroundColor: '#FFF9DB' }
          ]}>
            <Text style={[
              styles.badgeText, 
              item.status === 'PAID' || item.status === 'DELIVERED'
                ? { color: theme.primary } 
                : { color: '#F08C00' }
            ]}>
              {item.status}
            </Text>
          </View>
        </View>

        <Text style={styles.date}>
          Ordered: {new Date(item.createdAt).toLocaleDateString()}
        </Text>

        <View style={styles.handymanRow}>
          <Text style={styles.handymanAvatar}>👤</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.handymanName}>{item.user?.name || 'Customer'}</Text>
            <Text style={styles.handymanSpecialty}>Customer Address: {item.user?.address || 'N/A'}</Text>
          </View>
          {item.user?.phone && (
            <TouchableOpacity 
              onPress={() => Linking.openURL(`tel:${item.user.phone}`)} 
              style={styles.commsBtn}
            >
              <Text style={styles.commsText}>📞</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={{ marginTop: 12 }}>
          <Text style={styles.boldLabel}>Items:</Text>
          {item.items?.map((orderItem: any, idx: number) => (
            <Text key={idx} style={{ fontSize: 13, color: '#3A3A3C', marginTop: 2 }}>
              • {orderItem.quantity}x {orderItem.product?.name}
            </Text>
          ))}
        </View>

        <View style={[styles.bookingFooter, { borderTopColor: theme.border, marginTop: 16 }]}>
          <Text style={[styles.amount, { color: theme.text }]}>Total Val: ${item.totalAmount.toFixed(2)}</Text>
          
          <View style={styles.actionsRow}>
            {canAccept && (
              <TouchableOpacity
                style={[styles.completeBtn, { backgroundColor: theme.primary }]}
                onPress={() => handleRiderAcceptDelivery(item.id)}
              >
                <Text style={styles.completeBtnText}>Accept Delivery</Text>
              </TouchableOpacity>
            )}

            {isAssignedToMe && item.status === 'PAID' && (
              <TouchableOpacity
                style={[styles.completeBtn, { backgroundColor: theme.secondary || '#FF9500' }]}
                onPress={() => handleUpdateDeliveryStatus(item.id, 'SHIPPED')}
              >
                <Text style={styles.completeBtnText}>📦 Mark Picked Up</Text>
              </TouchableOpacity>
            )}

            {isAssignedToMe && item.status === 'SHIPPED' && (
              <>
                <TouchableOpacity
                  style={[
                    styles.trackBtn,
                    { borderColor: theme.primary, backgroundColor: theme.primary + '10', marginRight: 8 }
                  ]}
                  onPress={() => navigation.navigate('LiveTracking', { orderId: item.id, role: 'RIDER' })}
                >
                  <Text style={[styles.trackBtnText, { color: theme.primary }]}>📍 Navigate</Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={[styles.completeBtn, { backgroundColor: '#34C759' }]}
                  onPress={() => handleUpdateDeliveryStatus(item.id, 'DELIVERED')}
                >
                  <Text style={styles.completeBtnText}>✓ Delivered</Text>
                </TouchableOpacity>
              </>
            )}

            {item.status === 'DELIVERED' && isAssignedToMe && (
              <View style={styles.reviewedBadge}>
                <Text style={styles.reviewedText}>✓ Completed</Text>
              </View>
            )}
          </View>
        </View>
      </View>
    );
  };
  const renderOrderItem = ({ item }: any) => {
    const isReviewed = reviewedIds.has(item.id);
    const isEscrowHeld = item.escrows && item.escrows.some((e: any) => e.status === 'HELD');
    
    return (
      <View style={[styles.card, { borderColor: theme.border }]}>
        <View style={styles.cardHeader}>
          <Text style={styles.idText}>Order #{item.id.substring(0, 8)}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={[
              styles.badge, 
              item.status === 'PAID' || item.status === 'DELIVERED'
                ? { backgroundColor: theme.primary + '15' } 
                : { backgroundColor: '#FFF9DB' }
            ]}>
              <Text style={[
                styles.badgeText, 
                item.status === 'PAID' || item.status === 'DELIVERED'
                  ? { color: theme.primary } 
                  : { color: '#F08C00' }
              ]}>
                {item.status}
              </Text>
            </View>
            {isEscrowHeld && (
              <View style={[styles.badge, { backgroundColor: '#FFF3E0', marginLeft: 6 }]}>
                <Text style={[styles.badgeText, { color: '#FF9500' }]}>Holding in Escrow</Text>
              </View>
            )}
          </View>
        </View>
        <Text style={styles.date}>
          {new Date(item.createdAt).toLocaleDateString()} at {new Date(item.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
        </Text>
        <View style={styles.flexRow}>
          <Text style={[styles.amount, { color: theme.text }]}>Total: ${item.totalAmount.toFixed(2)}</Text>
          
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {(item.status === 'SHIPPED' || (item.status === 'PAID' && item.riderId)) && (
              <TouchableOpacity
                style={[
                  styles.trackBtn,
                  { borderColor: theme.primary, backgroundColor: theme.primary + '10', marginRight: 8 }
                ]}
                onPress={() => navigation.navigate('LiveTracking', { orderId: item.id, role: 'CUSTOMER' })}
              >
                <Text style={[styles.trackBtnText, { color: theme.primary }]}>🗺 Track Delivery</Text>
              </TouchableOpacity>
            )}

            {item.status === 'DELIVERED' && isEscrowHeld && (
              item.isSplitPayment && item.amountPaid < item.totalAmount ? (
                <TouchableOpacity
                  style={[styles.completeBtn, { backgroundColor: theme.primary, marginRight: 8 }]}
                  onPress={() => navigation.navigate('Checkout', {
                    checkoutType: 'order',
                    id: item.id,
                    amount: item.totalAmount - item.amountPaid,
                    isRemainingPayment: true,
                  })}
                >
                  <Text style={styles.completeBtnText}>Pay Remaining (50%) &amp; Confirm</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.completeBtn, { backgroundColor: '#34C759', marginRight: 8 }]}
                  onPress={() => handleConfirmReceipt(item.id)}
                >
                  <Text style={styles.completeBtnText}>Confirm Receipt</Text>
                </TouchableOpacity>
              )
            )}
            
            {(item.status === 'PAID' || item.status === 'DELIVERED') && !isEscrowHeld && (
              isReviewed ? (
                <View style={styles.reviewedBadge}>
                  <Text style={styles.reviewedText}>✅ Reviewed</Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.reviewBtn, { borderColor: theme.primary }]}
                  onPress={() => openReviewModal(item, 'order')}
                >
                  <Text style={[styles.reviewBtnText, { color: theme.primary }]}>⭐ Rate Order</Text>
                </TouchableOpacity>
              )
            )}
          </View>
        </View>
      </View>
    );
  };

  const renderVendorSaleItem = ({ item }: any) => {
    const isEscrowHeld = item.order?.escrows && item.order.escrows.some((e: any) => e.status === 'HELD');
    
    return (
      <View style={[styles.card, { borderColor: theme.border }]}>
        <View style={styles.cardHeader}>
          <Text style={styles.idText}>Sale #{item.order.id.substring(0, 8)}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={[
              styles.badge, 
              item.order.status === 'PAID' || item.order.status === 'DELIVERED'
                ? { backgroundColor: theme.primary + '15' } 
                : { backgroundColor: '#FFF9DB' }
            ]}>
              <Text style={[
                styles.badgeText, 
                item.order.status === 'PAID' || item.order.status === 'DELIVERED'
                  ? { color: theme.primary } 
                  : { color: '#F08C00' }
              ]}>
                {item.order.status}
              </Text>
            </View>
            {isEscrowHeld && (
              <View style={[styles.badge, { backgroundColor: '#FFF3E0', marginLeft: 6 }]}>
                <Text style={[styles.badgeText, { color: '#FF9500' }]}>Pending Clearance</Text>
              </View>
            )}
          </View>
        </View>
        <Text style={styles.productNameText}>{item.product?.name}</Text>
        <Text style={styles.saleDetailsText}>
          Qty: {item.quantity} × ${item.price.toFixed(2)}
        </Text>
        <Text style={styles.buyerText}>Buyer: {item.order?.user?.name || 'Anonymous'}</Text>
        <Text style={styles.date}>{new Date(item.order.createdAt).toLocaleDateString()}</Text>
        <Text style={[styles.amount, { color: theme.primary }]}>
          Earnings: ${(item.price * item.quantity).toFixed(2)}
        </Text>
      </View>
    );
  };

  const renderBookingItem = ({ item }: any) => {
    const isTrackingThis = activeTrackingId === item.id;
    const customerRole = userInfo?.role === 'CUSTOMER';
    const handymanRole = userInfo?.role === 'HANDYMAN';
    const hasProvider = !!item.handymanId;
    const canTrack = item.status === 'ACCEPTED' || item.status === 'PENDING';
    const provLat = liveLocationData?.providerLocation?.lat;
    const provLng = liveLocationData?.providerLocation?.lng;
    const providerName = liveLocationData?.providerLocation?.name;

    const isEscrowHeld = item.escrows && item.escrows.some((e: any) => e.status === 'HELD');

    return (
      <View style={[styles.card, { borderColor: theme.border }]}>
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.idText}>Booking #{item.id.substring(0, 8)}</Text>
            <Text style={styles.serviceNameText}>{item.service?.name}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={[
              styles.badge,
              item.status === 'COMPLETED' ? { backgroundColor: '#F1F3F5' } :
              item.status === 'ACCEPTED'  ? { backgroundColor: theme.primary + '15' } : { backgroundColor: '#FFF9DB' }
            ]}>
              <Text style={[
                styles.badgeText,
                item.status === 'COMPLETED' ? { color: '#868E96' } :
                item.status === 'ACCEPTED'  ? { color: theme.primary } : { color: '#F08C00' }
              ]}>
                {item.status}
              </Text>
            </View>
            {handymanRole && isEscrowHeld && (
              <View style={[styles.badge, { backgroundColor: '#FFF3E0', marginLeft: 6 }]}>
                <Text style={[styles.badgeText, { color: '#FF9500' }]}>Pending Clearance</Text>
              </View>
            )}
          </View>
        </View>

        {/* Contact info row (Customer or Handyman) */}
        {((customerRole && item.handyman) || (handymanRole && item.customer)) ? (
          <View style={styles.handymanRow}>
            <Text style={styles.handymanAvatar}>
              {(customerRole ? item.handyman.name : item.customer?.name)?.charAt(0)?.toUpperCase() || '👤'}
            </Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.handymanName}>{customerRole ? item.handyman.name : item.customer?.name}</Text>
              <Text style={styles.handymanSpecialty}>{customerRole ? (item.handyman.specialty || 'Handyman') : 'Customer'}</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity 
                onPress={() => Linking.openURL(`tel:${customerRole ? item.handyman.phone : item.customer?.phone}`)} 
                style={styles.commsBtn}
              >
                <Text style={styles.commsText}>📞</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                onPress={() => Linking.openURL(`whatsapp://send?phone=${customerRole ? item.handyman.phone : item.customer?.phone}`)} 
                style={styles.commsBtn}
              >
                <Text style={styles.commsText}>💬</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                onPress={() => navigation.navigate('VideoCall', { roomName: `HandymanApp_Booking_${item.id}` })} 
                style={styles.commsBtn}
              >
                <Text style={styles.commsText}>📹</Text>
              </TouchableOpacity>
            </View>
            {isTrackingThis && provLat && provLng && customerRole && (
              <View style={styles.liveChip}>
                <Animated.View style={[styles.liveDot, { transform: [{ scale: pulseAnim }] }]} />
                <Text style={styles.liveChipText}>LIVE</Text>
              </View>
            )}
          </View>
        ) : null}

        <Text style={styles.bookingAddress}>
          <Text style={styles.boldLabel}>Address:</Text> {item.address}
        </Text>
        <Text style={styles.date}>
          <Text style={styles.boldLabel}>Scheduled:</Text> {new Date(item.scheduledAt).toLocaleDateString()} at {new Date(item.scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>

        <View style={[styles.bookingFooter, { borderTopColor: theme.border }]}>
          <Text style={[styles.amount, { color: theme.text }]}>₦{item.totalPrice.toFixed(2)}</Text>

          <View style={styles.actionsRow}>
            {/* Track/Locate toggle */}
            {canTrack && (
              <TouchableOpacity
                style={[
                  styles.trackBtn,
                  { borderColor: theme.primary },
                  { backgroundColor: theme.primary + '10' }
                ]}
                onPress={() => navigation.navigate('LiveTracking', { bookingId: item.id, role: userInfo?.role })}
              >
                <Text style={[styles.trackBtnText, { color: theme.primary }]}>
                  {customerRole ? '🗺 Track' : '📍 Navigate'}
                </Text>
              </TouchableOpacity>
            )}

            {/* Handyman — Complete Job */}
            {handymanRole && item.status === 'ACCEPTED' && (
              <TouchableOpacity
                style={[styles.completeBtn, { backgroundColor: theme.secondary || '#34C759' }]}
                onPress={() => handleCompleteJob(item.id)}
              >
                <Text style={styles.completeBtnText}>✓ Complete</Text>
              </TouchableOpacity>
            )}

            {/* Customer — Confirm completed job to release escrow */}
            {customerRole && item.status === 'COMPLETED' && isEscrowHeld && (
              item.isSplitPayment && item.amountPaid < item.totalPrice ? (
                <TouchableOpacity
                  style={[styles.completeBtn, { backgroundColor: theme.primary }]}
                  onPress={() => navigation.navigate('Checkout', {
                    checkoutType: 'booking',
                    id: item.id,
                    amount: item.totalPrice - item.amountPaid,
                    isRemainingPayment: true,
                  })}
                >
                  <Text style={styles.completeBtnText}>Pay Remaining (50%) &amp; Confirm</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.completeBtn, { backgroundColor: '#34C759' }]}
                  onPress={() => handleConfirmBookingCompletion(item.id)}
                >
                  <Text style={styles.completeBtnText}>Confirm Job Completed</Text>
                </TouchableOpacity>
              )
            )}

            {/* Customer — Rate completed job (once escrow is released) */}
            {customerRole && item.status === 'COMPLETED' && !isEscrowHeld && (
              reviewedIds.has(item.id) ? (
                <View style={styles.reviewedBadge}>
                  <Text style={styles.reviewedText}>✅ Reviewed</Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.reviewBtn, { borderColor: theme.primary }]}
                  onPress={() => openReviewModal(item, 'booking')}
                >
                  <Text style={[styles.reviewBtnText, { color: theme.primary }]}>⭐ Rate</Text>
                </TouchableOpacity>
              )
            )}
          </View>
        </View>

      </View>
    );
  };

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  // Guest guard — show premium auth prompt instead of empty or crashed view
  if (!userToken) {
    return (
      <View style={[styles.guestContainer, { backgroundColor: theme.background }]}>
        <View style={[styles.guestCard, { borderColor: theme.border }]}>
          <Text style={styles.guestIcon}>📋</Text>
          <Text style={styles.guestTitle}>Your Activity History</Text>
          <Text style={styles.guestSubtitle}>
            Sign in to view your complete booking history, track active handyman assignments, see past orders, and leave reviews on completed jobs.
          </Text>

          <View style={styles.guestFeatureList}>
            <View style={styles.guestFeatureRow}>
              <Text style={styles.guestFeatureIcon}>📦</Text>
              <Text style={styles.guestFeatureText}>Track product orders &amp; delivery status</Text>
            </View>
            <View style={styles.guestFeatureRow}>
              <Text style={styles.guestFeatureIcon}>🗺️</Text>
              <Text style={styles.guestFeatureText}>Live GPS map for active handyman bookings</Text>
            </View>
            <View style={styles.guestFeatureRow}>
              <Text style={styles.guestFeatureIcon}>⭐</Text>
              <Text style={styles.guestFeatureText}>Rate and review completed services</Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.guestPrimaryBtn, { backgroundColor: theme.primary }]}
            onPress={() => navigation.navigate('Login')}
          >
            <Text style={styles.guestPrimaryBtnText}>Log In</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.guestSecondaryBtn, { borderColor: theme.primary }]}
            onPress={() => navigation.navigate('Signup')}
          >
            <Text style={[styles.guestSecondaryBtnText, { color: theme.primary }]}>Create Account</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>

      {/* ── Tab Switcher ── */}
      <View style={styles.tabSwitcherRow}>
        <TouchableOpacity
          style={[styles.tabSwitchBtn, activeTab === 'main' && { backgroundColor: theme.primary }]}
          onPress={() => setActiveTab('main')}
        >
          <Text style={[styles.tabSwitchText, activeTab === 'main' && { color: '#fff' }]}>
            {type === 'orders' ? (userInfo?.role === 'RIDER' ? '🚚 Deliveries' : '🛒 Orders') : '📋 Bookings'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabSwitchBtn, activeTab === 'parcels' && { backgroundColor: '#5856D6' }]}
          onPress={() => { setActiveTab('parcels'); fetchParcels(); }}
        >
          <Text style={[styles.tabSwitchText, activeTab === 'parcels' && { color: '#fff' }]}>📦 Parcels</Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'main' ? (
        <FlatList
          data={data}
          keyExtractor={(item) => item.id}
          renderItem={type === 'orders' ? (userInfo?.role === 'VENDOR' ? renderVendorSaleItem : userInfo?.role === 'RIDER' ? renderRiderDeliveryItem : renderOrderItem) : renderBookingItem}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>You have no history records yet.</Text>
            </View>
          }
        />
      ) : (
        // ── PARCELS TAB ──
        parcelsLoading ? (
          <ActivityIndicator size="large" color="#5856D6" style={{ marginTop: 60 }} />
        ) : (
          <FlatList
            data={parcels}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContainer}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={{ fontSize: 48, marginBottom: 12 }}>📦</Text>
                <Text style={styles.emptyText}>
                  {userInfo?.role === 'RIDER' ? 'No available parcel deliveries yet.' : 'You have no parcel deliveries yet.'}
                </Text>
                {userInfo?.role !== 'RIDER' && (
                  <TouchableOpacity
                    style={{ marginTop: 16, backgroundColor: '#5856D6', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 }}
                    onPress={() => navigation.navigate('BookParcel')}
                  >
                    <Text style={{ color: '#fff', fontWeight: '800' }}>🚚 Book a Rider</Text>
                  </TouchableOpacity>
                )}
              </View>
            }
            renderItem={({ item: parcel }) => (
              <View style={[styles.orderCard, { borderColor: theme.border }]}>
                {/* Status badge */}
                <View style={[styles.statusBadge, {
                  backgroundColor:
                    parcel.status === 'DELIVERED' ? '#34C75920' :
                    parcel.status === 'SHIPPED' ? '#007AFF20' :
                    parcel.status === 'CANCELLED' ? '#FF3B3020' : '#FF950020'
                }]}>
                  <Text style={[styles.statusText, {
                    color:
                      parcel.status === 'DELIVERED' ? '#34C759' :
                      parcel.status === 'SHIPPED' ? '#007AFF' :
                      parcel.status === 'CANCELLED' ? '#FF3B30' : '#FF9500'
                  }]}>
                    {parcel.status === 'DELIVERED' ? '✅ Delivered' :
                     parcel.status === 'SHIPPED' ? '🚚 In Transit' :
                     parcel.status === 'CANCELLED' ? '❌ Cancelled' : '⏳ Pending'}
                  </Text>
                </View>

                <Text style={[styles.orderTitle, { color: theme.text }]}>📦 Parcel Delivery</Text>
                <Text style={styles.orderMeta}>📍 From: {parcel.pickupAddress}</Text>
                <Text style={styles.orderMeta}>🏁 To: {parcel.dropoffAddress}</Text>
                {parcel.parcelDescription && (
                  <Text style={styles.orderMeta}>📝 {parcel.parcelDescription}</Text>
                )}
                <Text style={styles.orderMeta}>💰 ₦{parcel.totalAmount?.toLocaleString()}</Text>
                {parcel.rider && (
                  <Text style={[styles.orderMeta, { color: '#34C759' }]}>
                    🏍️ Rider: {parcel.rider.name} · {parcel.rider.vehicleType}
                  </Text>
                )}
                <Text style={[styles.orderMeta, { color: '#8E8E93' }]}>
                  🗓️ {parcel.createdAt ? new Date(parcel.createdAt).toLocaleString() : 'N/A'}
                </Text>

                {/* Action Buttons */}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                  {/* Rider: Accept delivery */}
                  {userInfo?.role === 'RIDER' && !parcel.riderId && (
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: '#34C759' }]}
                      onPress={async () => {
                        try {
                          await apiClient.patch(`/parcels/${parcel.id}/accept-delivery`);
                          Alert.alert('✅ Accepted!', 'You have accepted this parcel delivery.');
                          fetchParcels();
                        } catch (e: any) {
                          Alert.alert('Error', e?.response?.data?.error || 'Failed to accept delivery.');
                        }
                      }}
                    >
                      <Text style={styles.actionBtnText}>✅ Accept</Text>
                    </TouchableOpacity>
                  )}

                  {/* Rider: Mark Delivered */}
                  {userInfo?.role === 'RIDER' && parcel.riderId === userInfo.id && parcel.status === 'SHIPPED' && (
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: '#007AFF' }]}
                      onPress={async () => {
                        try {
                          await apiClient.patch(`/parcels/${parcel.id}/status`, { status: 'DELIVERED' });
                          Alert.alert('✅ Done!', 'Parcel marked as delivered.');
                          fetchParcels();
                        } catch (e: any) {
                          Alert.alert('Error', e?.response?.data?.error || 'Failed to update.');
                        }
                      }}
                    >
                      <Text style={styles.actionBtnText}>📬 Mark Delivered</Text>
                    </TouchableOpacity>
                  )}

                  {/* Live Track */}
                  {parcel.status === 'SHIPPED' && parcel.riderId && (
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: '#5856D6' }]}
                      onPress={() => navigation.navigate('LiveTracking', { orderId: parcel.id, role: userInfo?.role || 'CUSTOMER' })}
                    >
                      <Text style={styles.actionBtnText}>📡 Track Live</Text>
                    </TouchableOpacity>
                  )}

                  {/* Customer: Confirm Receipt */}
                  {userInfo?.role !== 'RIDER' && parcel.status === 'DELIVERED' && (
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: '#34C759' }]}
                      onPress={async () => {
                        try {
                          await apiClient.post(`/parcels/${parcel.id}/confirm-receipt`);
                          Alert.alert('✅ Confirmed!', 'Receipt confirmed and payment released to rider.');
                          fetchParcels();
                        } catch (e: any) {
                          Alert.alert('Error', e?.response?.data?.error || 'Failed to confirm receipt.');
                        }
                      }}
                    >
                      <Text style={styles.actionBtnText}>✅ Confirm Receipt</Text>
                    </TouchableOpacity>
                  )}

                  {/* Customer: Cancel */}
                  {userInfo?.role !== 'RIDER' && parcel.status === 'PENDING' && (
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: '#FF3B30' }]}
                      onPress={() => Alert.alert(
                        'Cancel Parcel?', 'Are you sure you want to cancel this delivery?',
                        [
                          { text: 'No', style: 'cancel' },
                          { text: 'Yes', style: 'destructive', onPress: async () => {
                            try {
                              await apiClient.patch(`/parcels/${parcel.id}/status`, { status: 'CANCELLED' });
                              fetchParcels();
                            } catch (e: any) {
                              Alert.alert('Error', e?.response?.data?.error || 'Failed to cancel.');
                            }
                          }}
                        ]
                      )}
                    >
                      <Text style={styles.actionBtnText}>❌ Cancel</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            )}
          />
        )
      )}

      {/* Review Submission Modal */}
      <Modal
        visible={reviewModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setReviewModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Leave a Review</Text>
            <Text style={styles.modalSubtitle}>
              {reviewTarget?.reviewType === 'booking'
                ? `${reviewTarget?.item?.service?.name || 'Service'}`
                : `Order #${reviewTarget?.item?.id?.substring(0, 8)}`}
            </Text>

            {/* Star Rating Picker */}
            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map(star => (
                <TouchableOpacity
                  key={star}
                  onPress={() => setReviewRating(star)}
                  style={styles.starBtn}
                >
                  <Text style={[
                    styles.starText,
                    reviewRating >= star ? styles.starActive : styles.starInactive
                  ]}>
                    ★
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.ratingLabel}>
              {reviewRating === 0 ? 'Tap to rate' : ['', 'Terrible', 'Poor', 'Okay', 'Good', 'Excellent!'][reviewRating]}
            </Text>

            <TextInput
              style={styles.reviewInput}
              placeholder="Share your experience (optional)..."
              placeholderTextColor="#AEAEB2"
              value={reviewComment}
              onChangeText={setReviewComment}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />

            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setReviewModalVisible(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSubmitBtn, { backgroundColor: theme.primary }]}
                onPress={handleSubmitReview}
                disabled={reviewSubmitting}
              >
                {reviewSubmitting
                  ? <ActivityIndicator color="#FFF" size="small" />
                  : <Text style={styles.modalSubmitText}>Submit Review</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContainer: {
    padding: 20,
  },
  card: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    borderRadius: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 2,
    borderWidth: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  idText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#8E8E93',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  serviceNameText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1C1C1E',
    marginTop: 4,
  },
  productNameText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1C1C1E',
    marginBottom: 4,
  },
  saleDetailsText: {
    fontSize: 14,
    color: '#3A3A3C',
    marginBottom: 4,
  },
  buyerText: {
    fontSize: 14,
    color: '#8E8E93',
    marginBottom: 4,
  },
  bookingAddress: {
    fontSize: 14,
    color: '#3A3A3C',
    marginBottom: 6,
    lineHeight: 18,
  },
  boldLabel: {
    fontWeight: '600',
    color: '#1C1C1E',
  },
  date: {
    fontSize: 13,
    color: '#8E8E93',
    marginBottom: 16,
  },
  flexRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  amount: {
    fontSize: 16,
    fontWeight: '800',
  },
  bookingFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    paddingTop: 16,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  trackBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    marginRight: 8,
    borderWidth: 1,
  },
  trackBtnText: {
    fontWeight: '700',
    fontSize: 12,
  },
  completeBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  completeBtnText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 12,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  mapContainer: {
    marginTop: 18,
    borderTopWidth: 1,
    paddingTop: 16,
  },
  liveTrackingTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1C1C1E',
    marginBottom: 10,
  },
  mapFrame: {
    height: 200,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
  },
  mapInstruction: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 6,
    textAlign: 'center',
  },
  // === New styles for live tracking enhancements ===
  handymanRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
    gap: 10,
  },
  handymanAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E9ECEF',
    textAlign: 'center',
    lineHeight: 36,
    fontSize: 18,
    fontWeight: '700',
    color: '#1C1C1E',
    marginRight: 4,
    overflow: 'hidden',
  },
  handymanName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  handymanSpecialty: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 2,
  },
  liveChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF2D5515',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginLeft: 'auto',
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF2D55',
    marginRight: 4,
  },
  liveChipText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FF2D55',
    letterSpacing: 1,
  },
  commsBtn: {
    backgroundColor: '#FFF',
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  commsText: {
    fontSize: 14,
  },
  mapHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  enRouteChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginLeft: 'auto',
  },
  enRouteText: {
    fontSize: 11,
    fontWeight: '700',
  },
  pendingChip: {
    backgroundColor: '#FFF9DB',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginLeft: 'auto',
  },
  pendingChipText: {
    fontSize: 11,
    color: '#F08C00',
    fontWeight: '700',
  },
  emptyContainer: {
    alignItems: 'center',
    marginTop: 40,
  },
  emptyText: {
    fontSize: 16,
    color: '#8E8E93',
  },
  // Guest styles
  guestContainer: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },
  guestCard: {
    backgroundColor: '#FFFFFF',
    padding: 32,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    shadowColor: '#1C1C1E',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.04,
    shadowRadius: 24,
    elevation: 4,
  },
  guestIcon: {
    fontSize: 52,
    marginBottom: 16,
  },
  guestTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1C1C1E',
    textAlign: 'center',
    marginBottom: 12,
  },
  guestSubtitle: {
    fontSize: 14,
    color: '#8E8E93',
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 24,
  },
  guestFeatureList: {
    width: '100%',
    marginBottom: 28,
  },
  guestFeatureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    backgroundColor: '#F8F9FA',
    padding: 12,
    borderRadius: 10,
  },
  guestFeatureIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  guestFeatureText: {
    fontSize: 14,
    color: '#3A3A3C',
    fontWeight: '500',
    flex: 1,
  },
  guestPrimaryBtn: {
    width: '100%',
    height: 50,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  guestPrimaryBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  guestSecondaryBtn: {
    width: '100%',
    height: 50,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
  },
  guestSecondaryBtnText: {
    fontSize: 16,
    fontWeight: '700',
  },
  // Review button styles
  reviewBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1.5,
  },
  reviewBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  reviewedBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: '#E8F5E9',
    borderRadius: 8,
  },
  reviewedText: {
    fontSize: 11,
    color: '#34C759',
    fontWeight: '700',
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 28,
    paddingBottom: 40,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1C1C1E',
    textAlign: 'center',
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#8E8E93',
    textAlign: 'center',
    marginBottom: 24,
  },
  starsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 8,
  },
  starBtn: {
    padding: 4,
  },
  starText: {
    fontSize: 40,
  },
  starActive: {
    color: '#FFD700',
  },
  starInactive: {
    color: '#E5E5EA',
  },
  ratingLabel: {
    textAlign: 'center',
    fontSize: 14,
    color: '#8E8E93',
    fontWeight: '600',
    marginBottom: 20,
    height: 20,
  },
  reviewInput: {
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: '#1C1C1E',
    minHeight: 80,
    marginBottom: 24,
  },
  modalBtns: {
    flexDirection: 'row',
    gap: 12,
  },
  modalCancelBtn: {
    flex: 1,
    height: 50,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCancelText: {
    color: '#8E8E93',
    fontWeight: '700',
    fontSize: 15,
  },
  modalSubmitBtn: {
    flex: 1,
    height: 50,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalSubmitText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },

  // ── Parcel tab styles ────────────────────────────────────────────────
  tabSwitcherRow: {
    flexDirection: 'row',
    margin: 16,
    marginBottom: 8,
    borderRadius: 14,
    backgroundColor: '#F2F2F7',
    padding: 4,
    gap: 4,
  },
  tabSwitchBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 10,
    alignItems: 'center',
  },
  tabSwitchText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#3A3A3C',
  },
  actionBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 12,
  },

  // ── Parcel card styles ───────────────────────────────────────────────
  orderCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    marginBottom: 10,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '800',
  },
  orderTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 6,
  },
  orderMeta: {
    fontSize: 13,
    color: '#3A3A3C',
    marginBottom: 3,
  },
});
