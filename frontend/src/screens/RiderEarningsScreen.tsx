import React, { useEffect, useState, useContext } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert
} from 'react-native';
import { SettingsContext } from '../context/SettingsContext';
import { AuthContext } from '../context/AuthContext';
import { useCurrency } from '../context/CurrencyContext';
import apiClient from '../api/client';

export default function RiderEarningsScreen({ navigation }: any) {
  const { theme, colorMode } = useContext(SettingsContext);
  const { userInfo } = useContext(AuthContext);
  const { fmt } = useCurrency();
  const isDark = colorMode === 'dark';
  const cardBg = isDark ? '#1E293B' : '#FFFFFF';
  const borderColor = isDark ? '#334155' : '#E2E8F0';
  const textColor = isDark ? '#F1F5F9' : '#0F172A';
  const subtextColor = isDark ? '#94A3B8' : '#64748B';

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<any>(null);
  const [activeTripsTab, setActiveTripsTab] = useState<'orders' | 'parcels'>('parcels');

  const fetchEarnings = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await apiClient.get('/orders/rider/earnings');
      setData(res.data);
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.error || 'Failed to load earnings.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchEarnings(); }, []);

  const onRefresh = () => { setRefreshing(true); fetchEarnings(true); };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  const earnings = data?.earnings || {};
  const wallet = data?.wallet || {};
  const allTrips = [
    ...(data?.parcelTrips || []).map((t: any) => ({ ...t, tripType: 'parcel' })),
    ...(data?.orderTrips || []).map((t: any) => ({ ...t, tripType: 'order' })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const filteredTrips = activeTripsTab === 'parcels'
    ? (data?.parcelTrips || [])
    : (data?.orderTrips || []);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: isDark ? '#0F172A' : '#F8FAFC' }}
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={[styles.header, { backgroundColor: cardBg, borderColor }]}>
        <Text style={styles.headerIcon}>💰</Text>
        <Text style={[styles.headerTitle, { color: textColor }]}>My Earnings</Text>
        <Text style={[styles.headerSub, { color: subtextColor }]}>Track your rides, payments & balance</Text>
      </View>

      {/* Wallet Balance Card */}
      <View style={[styles.walletCard, { backgroundColor: theme.primary }]}>
        <Text style={styles.walletLabel}>Available Balance</Text>
        <Text style={styles.walletAmount}>{fmt(wallet.balance || 0)}</Text>
        {wallet.pendingBalance > 0 && (
          <View style={styles.pendingRow}>
            <Text style={styles.pendingLabel}>⏳ {fmt(wallet.pendingBalance)} pending release</Text>
          </View>
        )}
        <TouchableOpacity
          style={styles.withdrawBtn}
          onPress={() => navigation.navigate('Wallet')}
          activeOpacity={0.85}
        >
          <Text style={styles.withdrawBtnText}>💳 Manage Wallet</Text>
        </TouchableOpacity>
      </View>

      {/* Stats Grid */}
      <View style={styles.statsGrid}>
        {[
          { label: 'Total Earned', value: fmt(earnings.totalReleased || 0), color: '#34C759' },
          { label: 'Pending', value: fmt(earnings.totalPending || 0), color: '#FF9500' },
          { label: 'Completed', value: String(earnings.completedTrips || 0), color: theme.primary },
          { label: 'Active', value: String(earnings.activeTrips || 0), color: '#5856D6' },
        ].map((stat, i) => (
          <View key={i} style={[styles.statCard, { backgroundColor: cardBg, borderColor }]}>
            <Text style={[styles.statValue, { color: stat.color }]}>{stat.value}</Text>
            <Text style={[styles.statLabel, { color: subtextColor }]}>{stat.label}</Text>
          </View>
        ))}
      </View>

      {/* Trip History */}
      <Text style={[styles.sectionTitle, { color: textColor }]}>Trip History</Text>

      {/* Tab Switcher */}
      <View style={[styles.tabRow, { backgroundColor: cardBg, borderColor }]}>
        {(['parcels', 'orders'] as const).map(tab => (
          <TouchableOpacity
            key={tab}
            style={[styles.tabBtn, activeTripsTab === tab && { backgroundColor: theme.primary, borderRadius: 10 }]}
            onPress={() => setActiveTripsTab(tab)}
          >
            <Text style={[styles.tabBtnText, activeTripsTab === tab ? { color: '#fff' } : { color: subtextColor }]}>
              {tab === 'parcels' ? '📦 Parcels' : '🛒 Orders'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {filteredTrips.length === 0 ? (
        <View style={[styles.emptyBox, { backgroundColor: cardBg, borderColor }]}>
          <Text style={styles.emptyIcon}>{activeTripsTab === 'parcels' ? '📦' : '🛒'}</Text>
          <Text style={[styles.emptyText, { color: subtextColor }]}>No {activeTripsTab} trips yet</Text>
          <Text style={[styles.emptySubText, { color: subtextColor }]}>Completed trips will appear here</Text>
        </View>
      ) : (
        filteredTrips.map((trip: any, i: number) => {
          const isParcel = activeTripsTab === 'parcels';
          const isReleased = trip.status === 'RELEASED';
          const from = isParcel ? trip.parcelDelivery?.pickupAddress : 'Order Delivery';
          const to = isParcel ? trip.parcelDelivery?.dropoffAddress : (trip.order?.deliveryAddress || 'Customer');
          const tripTotal = isParcel ? trip.parcelDelivery?.totalAmount : trip.order?.totalAmount;

          return (
            <View key={i} style={[styles.tripCard, { backgroundColor: cardBg, borderColor }]}>
              <View style={styles.tripTop}>
                <View style={[styles.tripBadge, { backgroundColor: isReleased ? '#34C75918' : '#FF950018' }]}>
                  <Text style={[styles.tripBadgeText, { color: isReleased ? '#34C759' : '#FF9500' }]}>
                    {isReleased ? '✅ Paid' : '⏳ Pending'}
                  </Text>
                </View>
                <Text style={[styles.tripEarning, { color: isReleased ? '#34C759' : '#FF9500' }]}>
                  +{fmt(trip.providerAmount)}
                </Text>
              </View>

              <Text style={[styles.tripFrom, { color: textColor }]} numberOfLines={1}>📍 {from}</Text>
              <Text style={[styles.tripTo, { color: textColor }]} numberOfLines={1}>🏁 {to}</Text>

              <View style={styles.tripMeta}>
                <Text style={[styles.tripMetaText, { color: subtextColor }]}>🧾 {fmt(tripTotal || 0)}</Text>
                <Text style={[styles.tripMetaText, { color: subtextColor }]}>
                  🗓️ {new Date(trip.createdAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}
                </Text>
              </View>

              {trip.releasedAt && (
                <Text style={[styles.tripMetaText, { color: subtextColor }]}>
                  💸 Released: {new Date(trip.releasedAt).toLocaleDateString('en-NG')}
                </Text>
              )}
            </View>
          );
        })
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyBox: {
    alignItems: 'center', paddingVertical: 48,
    borderRadius: 16, borderWidth: 1, marginBottom: 12,
  },
  emptyIcon: { fontSize: 48, marginBottom: 10 },
  emptyText: { fontSize: 14, fontWeight: '700', marginBottom: 4 },
  emptySubText: { fontSize: 12 },
  header: {
    alignItems: 'center', marginBottom: 20, paddingVertical: 24, paddingHorizontal: 20,
    borderRadius: 20, borderWidth: 1,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06, shadowRadius: 12, elevation: 2,
  },
  headerIcon: { fontSize: 44, marginBottom: 8 },
  headerTitle: { fontSize: 24, fontWeight: '900', marginBottom: 4 },
  headerSub: { fontSize: 13 },
  walletCard: {
    borderRadius: 20, padding: 24, marginBottom: 20, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18, shadowRadius: 16, elevation: 8,
  },
  walletLabel: { fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.75)', marginBottom: 4 },
  walletAmount: { fontSize: 40, fontWeight: '900', color: '#fff', marginBottom: 6 },
  pendingRow: { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 4, marginBottom: 16 },
  pendingLabel: { fontSize: 12, color: '#fff', fontWeight: '700' },
  withdrawBtn: {
    backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 12,
    paddingHorizontal: 20, paddingVertical: 10,
  },
  withdrawBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 },
  statCard: {
    flex: 1, minWidth: '45%', borderRadius: 14, borderWidth: 1,
    padding: 16, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04, shadowRadius: 6, elevation: 2,
  },
  statValue: { fontSize: 22, fontWeight: '900', marginBottom: 4 },
  statLabel: { fontSize: 11, fontWeight: '600' },

  sectionTitle: { fontSize: 18, fontWeight: '800', marginBottom: 12 },

  tabRow: {
    flexDirection: 'row', borderRadius: 12, borderWidth: 1, padding: 4, marginBottom: 16,
  },
  tabBtn: { flex: 1, paddingVertical: 9, alignItems: 'center' },
  tabBtnText: { fontSize: 13, fontWeight: '700', color: '#3A3A3C' },



  tripCard: {
    borderRadius: 14, borderWidth: 1, padding: 16, marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04, shadowRadius: 6, elevation: 2,
  },
  tripTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  tripBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  tripBadgeText: { fontSize: 11, fontWeight: '800' },
  tripEarning: { fontSize: 18, fontWeight: '900' },
  tripFrom: { fontSize: 13, fontWeight: '600', marginBottom: 3 },
  tripTo: { fontSize: 13, fontWeight: '600', marginBottom: 8 },
  tripMeta: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4 },
  tripMetaText: { fontSize: 11, fontWeight: '500' },
});
