import React, { useState, useEffect, useContext } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert, Modal, FlatList, TextInput,
  useWindowDimensions, RefreshControl, Linking,
} from 'react-native';
import apiClient from '../api/client';
import { AuthContext } from '../context/AuthContext';
import { SettingsContext } from '../context/SettingsContext';
import { useCurrency } from '../context/CurrencyContext';

type Tab = 'overview' | 'bookings' | 'orders' | 'transactions' | 'users' | 'workmen' | 'riders';

export default function AgentScreen({ navigation }: any) {
  const { userInfo } = useContext(AuthContext);
  const { theme, colorMode } = useContext(SettingsContext);
  const { fmt } = useCurrency();
  const { width } = useWindowDimensions();
  const isDark = colorMode === 'dark';
  const cardBg = isDark ? '#1E293B' : '#FFFFFF';
  const borderColor = isDark ? '#334155' : '#E2E8F0';
  const textColor = isDark ? '#F1F5F9' : '#0F172A';
  const subtextColor = isDark ? '#94A3B8' : '#64748B';
  const inputBg = isDark ? '#0F172A' : '#F8FAFC';

  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Data
  const [region, setRegion] = useState<any>(null);
  const [wallet, setWallet] = useState<any>(null);
  const [bookings, setBookings] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [workmen, setWorkmen] = useState<any[]>([]);
  const [riders, setRiders] = useState<any[]>([]);

  // Transactions data
  const [transactions, setTransactions] = useState<any[]>([]);
  const [txStats, setTxStats] = useState<any>(null);
  const [txLoading, setTxLoading] = useState(false);

  // Users data
  const [localUsers, setLocalUsers] = useState<any[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userRoleFilter, setUserRoleFilter] = useState<'ALL' | 'CUSTOMER' | 'VENDOR' | 'HANDYMAN' | 'RIDER'>('ALL');
  const [userSearch, setUserSearch] = useState('');

  // Assign modals
  const [assignBookingModal, setAssignBookingModal] = useState<any>(null);
  const [assignOrderModal, setAssignOrderModal] = useState<any>(null);
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    fetchRegion();
    fetchWallet();
  }, []);

  useEffect(() => {
    if (activeTab === 'bookings') fetchBookings();
    else if (activeTab === 'orders') fetchOrders();
    else if (activeTab === 'transactions') fetchTransactions();
    else if (activeTab === 'users') fetchUsers();
    else if (activeTab === 'workmen') fetchWorkmen();
    else if (activeTab === 'riders') fetchRiders();
  }, [activeTab, userRoleFilter]);

  const fetchWallet = async () => {
    try {
      const res = await apiClient.get('/wallet/me');
      setWallet(res.data);
    } catch (e) {}
  };

  const fetchRegion = async () => {
    try {
      setLoading(true);
      const res = await apiClient.get('/agents/my-region');
      setRegion(res.data);
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.error || 'Failed to load region data');
    } finally {
      setLoading(false);
    }
  };

  const fetchBookings = async () => {
    try {
      const res = await apiClient.get('/agents/bookings');
      setBookings(res.data);
    } catch (e) {}
  };

  const fetchOrders = async () => {
    try {
      const res = await apiClient.get('/agents/orders');
      setOrders(res.data);
    } catch (e) {}
  };

  const fetchTransactions = async () => {
    try {
      setTxLoading(true);
      const res = await apiClient.get('/agents/transactions');
      setTransactions(res.data.transactions || []);
      setTxStats(res.data.stats || null);
    } catch (e) {
    } finally {
      setTxLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      setUsersLoading(true);
      const params: any = {};
      if (userRoleFilter !== 'ALL') params.role = userRoleFilter;
      if (userSearch.trim()) params.search = userSearch.trim();
      const res = await apiClient.get('/agents/users', { params });
      setLocalUsers(res.data || []);
    } catch (e) {
    } finally {
      setUsersLoading(false);
    }
  };

  const fetchWorkmen = async () => {
    try {
      const res = await apiClient.get('/agents/workmen');
      setWorkmen(res.data);
    } catch (e) {}
  };

  const fetchRiders = async () => {
    try {
      const res = await apiClient.get('/agents/riders');
      setRiders(res.data);
    } catch (e) {}
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchRegion();
    await fetchWallet();
    if (activeTab === 'bookings') await fetchBookings();
    else if (activeTab === 'orders') await fetchOrders();
    else if (activeTab === 'transactions') await fetchTransactions();
    else if (activeTab === 'users') await fetchUsers();
    else if (activeTab === 'workmen') await fetchWorkmen();
    else if (activeTab === 'riders') await fetchRiders();
    setRefreshing(false);
  };

  const handleAssignHandyman = async (bookingId: string, handymanId: string) => {
    setAssigning(true);
    try {
      await apiClient.patch(`/agents/bookings/${bookingId}/assign`, { handymanId });
      setAssignBookingModal(null);
      await fetchBookings();
      Alert.alert('✅ Assigned', 'Workman has been assigned to the booking. Customer has been notified.');
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.error || 'Failed to assign workman');
    } finally {
      setAssigning(false);
    }
  };

  const handleAssignRider = async (orderId: string, riderId: string) => {
    setAssigning(true);
    try {
      await apiClient.patch(`/agents/orders/${orderId}/assign-rider`, { riderId });
      setAssignOrderModal(null);
      await fetchOrders();
      Alert.alert('✅ Assigned', 'Rider has been assigned to the order. Customer has been notified.');
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.error || 'Failed to assign rider');
    } finally {
      setAssigning(false);
    }
  };

  const statusColor = (status: string) => {
    switch (status?.toUpperCase()) {
      case 'PENDING': return '#F59E0B';
      case 'ACCEPTED': case 'SHIPPED': case 'PAID': return '#10B981';
      case 'IN_PROGRESS': return '#3B82F6';
      case 'COMPLETED': case 'DELIVERED': return '#6366F1';
      case 'CANCELLED': return '#EF4444';
      default: return subtextColor;
    }
  };

  const verifiedBadge = (vs: string) =>
    vs === 'VERIFIED' ? '🟢' : vs === 'PENDING_REVIEW' ? '🟡' : '🔴';

  const TABS: { key: Tab; label: string; icon: string }[] = [
    { key: 'overview', label: 'Overview', icon: '📊' },
    { key: 'bookings', label: 'Jobs & Bookings', icon: '🛠️' },
    { key: 'orders', label: 'Orders', icon: '📦' },
    { key: 'transactions', label: 'Transactions', icon: '💳' },
    { key: 'users', label: 'Local Users', icon: '👥' },
    { key: 'workmen', label: 'Workmen', icon: '🔧' },
    { key: 'riders', label: 'Riders', icon: '🏍️' },
  ];

  return (
    <View style={[styles.container, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC' }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.primary }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>‹</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>🏘️ Agent Dashboard</Text>
          <Text style={styles.headerSub}>
            {region?.agent?.state ? `${region.agent.state} Locality` : 'Regional Admin'}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => navigation.navigate('NotificationsTab')}
          style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }}
          accessibilityLabel="View Alerts & Messages"
        >
          <Text style={{ fontSize: 18 }}>🔔</Text>
        </TouchableOpacity>
      </View>

      {/* Tab Bar */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.tabBar, { backgroundColor: cardBg, borderBottomColor: borderColor }]}>
        {TABS.map(tab => (
          <TouchableOpacity
            key={tab.key}
            onPress={() => setActiveTab(tab.key)}
            style={[styles.tab, activeTab === tab.key && { borderBottomColor: theme.primary, borderBottomWidth: 2 }]}
          >
            <Text style={styles.tabIcon}>{tab.icon}</Text>
            <Text style={[styles.tabLabel, { color: activeTab === tab.key ? theme.primary : subtextColor }]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
      >
        {/* ── OVERVIEW TAB ── */}
        {activeTab === 'overview' && (
          <View style={styles.section}>
            {loading ? (
              <ActivityIndicator color={theme.primary} style={{ marginTop: 40 }} />
            ) : region ? (
              <>
                <View style={[styles.agentCard, { backgroundColor: cardBg, borderColor }]}>
                  <Text style={[styles.agentName, { color: textColor }]}>{region.agent?.name}</Text>
                  <Text style={[styles.agentMeta, { color: subtextColor }]}>
                    📍 {region.agent?.state || 'No state set'} · {region.agent?.country || 'Nigeria'}
                  </Text>
                  {region.agent?.verificationStatus !== 'VERIFIED' && (
                    <View style={styles.pendingBadge}>
                      <Text style={styles.pendingBadgeText}>
                        {region.agent?.verificationStatus === 'PENDING_REVIEW'
                          ? '⏳ Pending Admin Approval — Limited access until verified'
                          : '❌ Not Verified'}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Agent Wallet Card */}
                <TouchableOpacity
                  style={[styles.walletCard, { backgroundColor: theme.primary }]}
                  onPress={() => navigation.navigate('Wallet')}
                  activeOpacity={0.9}
                >
                  <View style={styles.walletHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.walletLabel}>Agent Commission Wallet</Text>
                      <Text style={styles.walletBalance}>
                        {wallet ? fmt(wallet.wallet?.balance || 0) : '₦0.00'}
                      </Text>
                    </View>
                    <View style={styles.walletBtn}>
                      <Text style={styles.walletBtnText}>Open Wallet →</Text>
                    </View>
                  </View>
                  <Text style={styles.walletSub}>
                    💰 Automatic commission credited from regional sales & completed tasks
                  </Text>
                </TouchableOpacity>

                <Text style={[styles.sectionTitle, { color: textColor }]}>Locality Stats</Text>
                <View style={styles.statsGrid}>
                  {[
                    { label: 'Local Users', value: region.stats?.totalUsers ?? 0, icon: '👥', color: '#8B5CF6' },
                    { label: 'Pending Jobs', value: region.stats?.pendingBookings ?? 0, icon: '🛠️', color: '#F59E0B' },
                    { label: 'Workmen', value: region.stats?.workmen ?? 0, icon: '🔧', color: '#10B981' },
                    { label: 'Riders', value: region.stats?.riders ?? 0, icon: '🏍️', color: '#3B82F6' },
                    { label: 'Customers', value: region.stats?.customers ?? 0, icon: '👤', color: '#06B6D4' },
                    { label: 'Vendors', value: region.stats?.vendors ?? 0, icon: '🏪', color: '#EC4899' },
                    { label: 'Total Orders', value: region.stats?.orders ?? 0, icon: '📦', color: '#6366F1' },
                  ].map((stat, i) => (
                    <View key={i} style={[styles.statCard, { backgroundColor: stat.color + '15', borderColor: stat.color + '30' }]}>
                      <Text style={styles.statIcon}>{stat.icon}</Text>
                      <Text style={[styles.statValue, { color: stat.color }]}>{stat.value}</Text>
                      <Text style={[styles.statLabel, { color: subtextColor }]}>{stat.label}</Text>
                    </View>
                  ))}
                </View>

                <Text style={[styles.sectionTitle, { color: textColor }]}>Quick Actions</Text>
                <View style={styles.quickActions}>
                  {[
                    { label: 'Manage Jobs & Bookings', icon: '🛠️', tab: 'bookings' as Tab },
                    { label: 'View Locality Transactions', icon: '💳', tab: 'transactions' as Tab },
                    { label: 'View Local Users', icon: '👥', tab: 'users' as Tab },
                    { label: 'View Orders', icon: '📦', tab: 'orders' as Tab },
                    { label: 'Manage Workmen', icon: '🔧', tab: 'workmen' as Tab },
                    { label: 'Manage Riders', icon: '🏍️', tab: 'riders' as Tab },
                  ].map((action, i) => (
                    <TouchableOpacity
                      key={i}
                      style={[styles.quickActionBtn, { backgroundColor: cardBg, borderColor }]}
                      onPress={() => setActiveTab(action.tab)}
                    >
                      <Text style={styles.quickActionIcon}>{action.icon}</Text>
                      <Text style={[styles.quickActionLabel, { color: textColor }]}>{action.label}</Text>
                      <Text style={{ color: subtextColor }}>›</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            ) : (
              <View style={styles.emptyState}>
                <Text style={styles.emptyEmoji}>🏘️</Text>
                <Text style={[styles.emptyTitle, { color: textColor }]}>No Region Data</Text>
                <Text style={[styles.emptySub, { color: subtextColor }]}>
                  Make sure your profile has a state set, and that an Admin has verified your Agent account.
                </Text>
                <TouchableOpacity onPress={fetchRegion} style={[styles.retryBtn, { backgroundColor: theme.primary }]}>
                  <Text style={styles.retryBtnText}>Retry</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* ── BOOKINGS & JOBS TAB ── */}
        {activeTab === 'bookings' && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: textColor }]}>
              Jobs & Bookings in {region?.agent?.state || 'Your Locality'}
            </Text>
            {bookings.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyEmoji}>🛠️</Text>
                <Text style={[styles.emptyTitle, { color: textColor }]}>No Jobs Found</Text>
                <Text style={[styles.emptySub, { color: subtextColor }]}>No service bookings in your locality yet.</Text>
              </View>
            ) : (
              bookings.map(b => (
                <View key={b.id} style={[styles.listCard, { backgroundColor: cardBg, borderColor }]}>
                  <View style={styles.listCardRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.listCardTitle, { color: textColor }]}>{b.service?.name || 'Service Job'}</Text>
                      <Text style={[styles.listCardMeta, { color: subtextColor }]}>
                        👤 Customer: {b.customer?.name} {b.customer?.phone ? `(${b.customer.phone})` : ''}
                      </Text>
                      <Text style={[styles.listCardMeta, { color: subtextColor }]}>
                        📍 {b.address}
                      </Text>
                      <Text style={[styles.listCardMeta, { color: subtextColor }]}>
                        🗓 {new Date(b.scheduledAt).toLocaleDateString()} · Job Fee: <Text style={{ fontWeight: '700', color: theme.primary }}>{fmt(b.totalPrice)}</Text>
                      </Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: statusColor(b.status) + '20' }]}>
                      <Text style={[styles.statusBadgeText, { color: statusColor(b.status) }]}>{b.status}</Text>
                    </View>
                  </View>
                  {b.handyman ? (
                    <Text style={[styles.assignedText, { color: '#10B981' }]}>
                      🔧 Workman: {b.handyman.name} {b.handyman.phone ? `(${b.handyman.phone})` : ''} {b.handyman.specialty ? `· ${b.handyman.specialty}` : ''}
                    </Text>
                  ) : (
                    <Text style={[styles.unassignedText, { color: '#F59E0B' }]}>⚠️ No workman assigned yet</Text>
                  )}
                  {(b.status === 'PENDING' || !b.handymanId) && (
                    <TouchableOpacity
                      style={[styles.assignBtn, { backgroundColor: theme.primary }]}
                      onPress={() => {
                        fetchWorkmen();
                        setAssignBookingModal(b);
                      }}
                    >
                      <Text style={styles.assignBtnText}>Assign Workman</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))
            )}
          </View>
        )}

        {/* ── ORDERS TAB ── */}
        {activeTab === 'orders' && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: textColor }]}>
              Orders in {region?.agent?.state || 'Your Locality'}
            </Text>
            {orders.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyEmoji}>📦</Text>
                <Text style={[styles.emptyTitle, { color: textColor }]}>No Orders</Text>
                <Text style={[styles.emptySub, { color: subtextColor }]}>No orders in your locality yet.</Text>
              </View>
            ) : (
              orders.map(o => (
                <View key={o.id} style={[styles.listCard, { backgroundColor: cardBg, borderColor }]}>
                  <View style={styles.listCardRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.listCardTitle, { color: textColor }]}>Order #{o.id.slice(-6).toUpperCase()}</Text>
                      <Text style={[styles.listCardMeta, { color: subtextColor }]}>
                        👤 Customer: {o.user?.name} {o.user?.phone ? `(${o.user.phone})` : ''}
                      </Text>
                      <Text style={[styles.listCardMeta, { color: subtextColor }]}>
                        💰 Total: <Text style={{ fontWeight: '700', color: theme.primary }}>{fmt(o.totalAmount)}</Text>
                      </Text>
                      <Text style={[styles.listCardMeta, { color: subtextColor }]}>
                        📍 Delivery: {o.deliveryAddress || 'No address specified'}
                      </Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: statusColor(o.status) + '20' }]}>
                      <Text style={[styles.statusBadgeText, { color: statusColor(o.status) }]}>{o.status}</Text>
                    </View>
                  </View>
                  {o.rider ? (
                    <Text style={[styles.assignedText, { color: '#10B981' }]}>
                      🏍️ Courier Rider: {o.rider.name} {o.rider.phone ? `(${o.rider.phone})` : ''}
                    </Text>
                  ) : (
                    <Text style={[styles.unassignedText, { color: '#F59E0B' }]}>⚠️ No rider assigned</Text>
                  )}
                  {(o.status === 'PAID' || o.status === 'PENDING' || !o.riderId) && (
                    <TouchableOpacity
                      style={[styles.assignBtn, { backgroundColor: theme.primary }]}
                      onPress={() => {
                        fetchRiders();
                        setAssignOrderModal(o);
                      }}
                    >
                      <Text style={styles.assignBtnText}>Assign Rider</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))
            )}
          </View>
        )}

        {/* ── TRANSACTIONS TAB ── */}
        {activeTab === 'transactions' && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: textColor }]}>
              Locality Transactions & Commissions
            </Text>

            {txStats && (
              <View style={[styles.agentCard, { backgroundColor: cardBg, borderColor, marginBottom: 14 }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                  <Text style={[styles.agentMeta, { color: subtextColor }]}>Agent Commission Earned</Text>
                  <Text style={{ fontWeight: '800', color: '#10B981', fontSize: 16 }}>
                    {fmt(txStats.totalCommission || 0)}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                  <Text style={[styles.agentMeta, { color: subtextColor }]}>Jobs Escrow Volume</Text>
                  <Text style={{ fontWeight: '700', color: textColor, fontSize: 14 }}>
                    {fmt(txStats.totalJobVolume || 0)}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={[styles.agentMeta, { color: subtextColor }]}>Orders Volume</Text>
                  <Text style={{ fontWeight: '700', color: textColor, fontSize: 14 }}>
                    {fmt(txStats.totalOrderVolume || 0)}
                  </Text>
                </View>
              </View>
            )}

            {txLoading ? (
              <ActivityIndicator color={theme.primary} style={{ marginTop: 24 }} />
            ) : transactions.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyEmoji}>💳</Text>
                <Text style={[styles.emptyTitle, { color: textColor }]}>No Transactions Yet</Text>
                <Text style={[styles.emptySub, { color: subtextColor }]}>
                  Transactions, job escrows, and agent commissions in {region?.agent?.state || 'your locality'} will appear here.
                </Text>
              </View>
            ) : (
              transactions.map((tx, idx) => (
                <View key={tx.id || idx} style={[styles.listCard, { backgroundColor: cardBg, borderColor }]}>
                  <View style={styles.listCardRow}>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <Text style={{ fontSize: 16 }}>
                          {tx.isCommission ? '💰' : tx.source === 'BOOKING' ? '🛠️' : '📦'}
                        </Text>
                        <Text style={[styles.listCardTitle, { color: textColor, marginBottom: 0 }]}>
                          {tx.isCommission ? 'Commission Credit' : tx.type === 'JOB_PAYMENT' ? 'Job Payment' : 'Order Payment'}
                        </Text>
                      </View>
                      <Text style={[styles.listCardMeta, { color: subtextColor }]}>{tx.description}</Text>
                      {tx.party && (
                        <Text style={[styles.listCardMeta, { color: subtextColor }]}>
                          👤 Customer: {tx.party} {tx.provider ? `· Provider: ${tx.provider}` : ''}
                        </Text>
                      )}
                      <Text style={[styles.listCardMeta, { color: subtextColor, fontSize: 11, marginTop: 2 }]}>
                        🗓 {new Date(tx.createdAt).toLocaleString()} · Ref: {tx.referenceId ? String(tx.referenceId).slice(-8) : 'N/A'}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{ fontSize: 15, fontWeight: '800', color: tx.isCommission ? '#10B981' : textColor }}>
                        {tx.isCommission ? `+${fmt(tx.amount)}` : fmt(tx.amount)}
                      </Text>
                      <View style={[styles.statusBadge, { backgroundColor: statusColor(tx.status) + '20', marginTop: 4 }]}>
                        <Text style={[styles.statusBadgeText, { color: statusColor(tx.status) }]}>{tx.status}</Text>
                      </View>
                    </View>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {/* ── USERS TAB ── */}
        {activeTab === 'users' && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: textColor }]}>
              Users in {region?.agent?.state || 'Your Locality'}
            </Text>

            {/* Search Input */}
            <View style={[styles.searchBox, { backgroundColor: inputBg, borderColor }]}>
              <Text style={{ fontSize: 16, marginRight: 8 }}>🔍</Text>
              <TextInput
                style={[styles.searchInput, { color: textColor }]}
                placeholder="Search user by name, email, or phone..."
                placeholderTextColor={subtextColor}
                value={userSearch}
                onChangeText={setUserSearch}
                onSubmitEditing={fetchUsers}
                returnKeyType="search"
              />
              {userSearch ? (
                <TouchableOpacity onPress={() => { setUserSearch(''); fetchUsers(); }}>
                  <Text style={{ color: subtextColor, fontSize: 16 }}>✕</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            {/* Filter Pills */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {(['ALL', 'CUSTOMER', 'VENDOR', 'HANDYMAN', 'RIDER'] as const).map(role => (
                  <TouchableOpacity
                    key={role}
                    onPress={() => setUserRoleFilter(role)}
                    style={[
                      styles.rolePill,
                      { borderColor },
                      userRoleFilter === role && { backgroundColor: theme.primary, borderColor: theme.primary },
                    ]}
                  >
                    <Text
                      style={[
                        styles.rolePillText,
                        { color: userRoleFilter === role ? '#FFF' : subtextColor },
                      ]}
                    >
                      {role === 'ALL'
                        ? 'All'
                        : role === 'CUSTOMER'
                        ? '👤 Customers'
                        : role === 'VENDOR'
                        ? '🏪 Vendors'
                        : role === 'HANDYMAN'
                        ? '🔧 Workmen'
                        : '🏍️ Riders'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            {usersLoading ? (
              <ActivityIndicator color={theme.primary} style={{ marginTop: 24 }} />
            ) : localUsers.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyEmoji}>👥</Text>
                <Text style={[styles.emptyTitle, { color: textColor }]}>No Users Found</Text>
                <Text style={[styles.emptySub, { color: subtextColor }]}>
                  {userSearch
                    ? 'No users in your locality matched your search criteria.'
                    : `No registered users found in ${region?.agent?.state || 'your locality'} yet.`}
                </Text>
              </View>
            ) : (
              localUsers.map(u => (
                <View key={u.id} style={[styles.listCard, { backgroundColor: cardBg, borderColor }]}>
                  <View style={styles.listCardRow}>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        <Text style={[styles.listCardTitle, { color: textColor, marginBottom: 0 }]}>{u.name}</Text>
                        <View style={[styles.userRoleTag, { backgroundColor: theme.primary + '18' }]}>
                          <Text style={[styles.userRoleTagText, { color: theme.primary }]}>
                            {u.role === 'CUSTOMER' ? '👤 Customer'
                             : u.role === 'VENDOR' ? '🏪 Vendor'
                             : u.role === 'HANDYMAN' ? `🔧 ${u.specialty || 'Workman'}`
                             : u.role === 'RIDER' ? `🏍️ ${u.vehicleType || 'Rider'}`
                             : u.role}
                          </Text>
                        </View>
                      </View>
                      <Text style={[styles.listCardMeta, { color: subtextColor }]}>
                        📧 {u.email}
                      </Text>
                      {u.phone ? (
                        <TouchableOpacity
                          onPress={() => Linking.openURL(`tel:${u.phone}`).catch(() => {})}
                          style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}
                        >
                          <Text style={[styles.listCardMeta, { color: theme.primary, fontWeight: '600' }]}>
                            📞 {u.phone}
                          </Text>
                        </TouchableOpacity>
                      ) : null}
                      {u.address ? (
                        <Text style={[styles.listCardMeta, { color: subtextColor, marginTop: 2 }]}>
                          📍 {u.address}
                        </Text>
                      ) : null}
                      <Text style={[styles.listCardMeta, { color: subtextColor, fontSize: 11, marginTop: 4 }]}>
                        📅 Joined: {new Date(u.createdAt).toLocaleDateString()} · Activity: {
                          u.role === 'CUSTOMER' ? `${u._count?.bookings || 0} jobs, ${u._count?.orders || 0} orders`
                          : u.role === 'HANDYMAN' ? `${u._count?.jobs || 0} jobs assigned`
                          : u.role === 'RIDER' ? `${u._count?.deliveries || 0} deliveries`
                          : `${u._count?.orders || 0} orders`
                        }
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{ fontSize: 20 }}>{verifiedBadge(u.verificationStatus)}</Text>
                      <Text style={[styles.verificationText, { color: u.verificationStatus === 'VERIFIED' ? '#10B981' : '#F59E0B', fontSize: 11 }]}>
                        {u.verificationStatus === 'VERIFIED' ? 'Verified' : u.verificationStatus === 'PENDING_REVIEW' ? 'Pending' : 'Unverified'}
                      </Text>
                    </View>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {/* ── WORKMEN TAB ── */}
        {activeTab === 'workmen' && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: textColor }]}>
              Workmen in {region?.agent?.state || 'Your Region'}
            </Text>
            {workmen.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyEmoji}>🔧</Text>
                <Text style={[styles.emptyTitle, { color: textColor }]}>No Workmen Found</Text>
                <Text style={[styles.emptySub, { color: subtextColor }]}>
                  No handymen registered in {region?.agent?.state || 'your region'} yet.
                </Text>
              </View>
            ) : (
              workmen.map(w => (
                <View key={w.id} style={[styles.listCard, { backgroundColor: cardBg, borderColor }]}>
                  <View style={styles.listCardRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.listCardTitle, { color: textColor }]}>{w.name}</Text>
                      <Text style={[styles.listCardMeta, { color: subtextColor }]}>
                        🔧 {w.specialty || 'General'} · 📍 {w.state || 'Unknown'}
                      </Text>
                      {w.phone && <Text style={[styles.listCardMeta, { color: subtextColor }]}>📞 {w.phone}</Text>}
                    </View>
                    <Text style={{ fontSize: 22 }}>{verifiedBadge(w.verificationStatus)}</Text>
                  </View>
                  <Text style={[styles.verificationText, { color: w.verificationStatus === 'VERIFIED' ? '#10B981' : '#F59E0B' }]}>
                    {w.verificationStatus === 'VERIFIED' ? 'Verified' : w.verificationStatus === 'PENDING_REVIEW' ? 'Pending Review' : 'Unverified'}
                  </Text>
                </View>
              ))
            )}
          </View>
        )}

        {/* ── RIDERS TAB ── */}
        {activeTab === 'riders' && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: textColor }]}>
              Riders in {region?.agent?.state || 'Your Region'}
            </Text>
            {riders.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyEmoji}>🏍️</Text>
                <Text style={[styles.emptyTitle, { color: textColor }]}>No Riders Found</Text>
                <Text style={[styles.emptySub, { color: subtextColor }]}>
                  No riders registered in {region?.agent?.state || 'your region'} yet.
                </Text>
              </View>
            ) : (
              riders.map(r => (
                <View key={r.id} style={[styles.listCard, { backgroundColor: cardBg, borderColor }]}>
                  <View style={styles.listCardRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.listCardTitle, { color: textColor }]}>{r.name}</Text>
                      <Text style={[styles.listCardMeta, { color: subtextColor }]}>
                        🚗 {r.vehicleType || 'Unknown vehicle'} · 📍 {r.state || 'Unknown'}
                      </Text>
                      {r.phone && <Text style={[styles.listCardMeta, { color: subtextColor }]}>📞 {r.phone}</Text>}
                    </View>
                    <View>
                      <Text style={{ fontSize: 22 }}>{verifiedBadge(r.verificationStatus)}</Text>
                      <View style={[styles.riderStatusBadge, { backgroundColor: r.riderStatus === 'ONLINE' ? '#10B98120' : '#94A3B820' }]}>
                        <Text style={{ fontSize: 10, color: r.riderStatus === 'ONLINE' ? '#10B981' : '#94A3B8', fontWeight: '700' }}>
                          {r.riderStatus || 'OFFLINE'}
                        </Text>
                      </View>
                    </View>
                  </View>
                  <Text style={[styles.verificationText, { color: r.verificationStatus === 'VERIFIED' ? '#10B981' : '#F59E0B' }]}>
                    {r.verificationStatus === 'VERIFIED' ? 'Verified' : r.verificationStatus === 'PENDING_REVIEW' ? 'Pending Review' : 'Unverified'}
                  </Text>
                </View>
              ))
            )}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ── Assign Workman Modal ── */}
      <Modal
        visible={!!assignBookingModal}
        transparent
        animationType="slide"
        onRequestClose={() => setAssignBookingModal(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: cardBg, borderColor }]}>
            <Text style={[styles.modalTitle, { color: textColor }]}>Assign Workman</Text>
            <Text style={[styles.modalSub, { color: subtextColor }]}>
              Select a verified workman in {region?.agent?.state || 'your region'} for this booking.
            </Text>
            <ScrollView style={{ maxHeight: 320 }}>
              {workmen.filter(w => w.verificationStatus === 'VERIFIED').length === 0 ? (
                <Text style={[styles.noAvailableText, { color: '#EF4444' }]}>
                  ❌ No verified workmen available in your region.
                </Text>
              ) : (
                workmen
                  .filter(w => w.verificationStatus === 'VERIFIED')
                  .map(w => (
                    <TouchableOpacity
                      key={w.id}
                      style={[styles.assignSelectRow, { borderColor }]}
                      onPress={() => handleAssignHandyman(assignBookingModal.id, w.id)}
                      disabled={assigning}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.assignSelectName, { color: textColor }]}>{w.name}</Text>
                        <Text style={[styles.assignSelectMeta, { color: subtextColor }]}>
                          🔧 {w.specialty || 'General'} · 📍 {w.state || 'Unknown'}
                        </Text>
                      </View>
                      {assigning ? (
                        <ActivityIndicator color={theme.primary} />
                      ) : (
                        <Text style={[styles.assignSelectCTA, { color: theme.primary }]}>Assign →</Text>
                      )}
                    </TouchableOpacity>
                  ))
              )}
            </ScrollView>
            <TouchableOpacity
              style={[styles.modalCancelBtn, { borderColor }]}
              onPress={() => setAssignBookingModal(null)}
            >
              <Text style={{ color: subtextColor }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Assign Rider Modal ── */}
      <Modal
        visible={!!assignOrderModal}
        transparent
        animationType="slide"
        onRequestClose={() => setAssignOrderModal(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: cardBg, borderColor }]}>
            <Text style={[styles.modalTitle, { color: textColor }]}>Assign Rider</Text>
            <Text style={[styles.modalSub, { color: subtextColor }]}>
              Select a verified rider in {region?.agent?.state || 'your region'} for this order.
            </Text>
            <ScrollView style={{ maxHeight: 320 }}>
              {riders.filter(r => r.verificationStatus === 'VERIFIED').length === 0 ? (
                <Text style={[styles.noAvailableText, { color: '#EF4444' }]}>
                  ❌ No verified riders available in your region.
                </Text>
              ) : (
                riders
                  .filter(r => r.verificationStatus === 'VERIFIED')
                  .map(r => (
                    <TouchableOpacity
                      key={r.id}
                      style={[styles.assignSelectRow, { borderColor }]}
                      onPress={() => handleAssignRider(assignOrderModal.id, r.id)}
                      disabled={assigning}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.assignSelectName, { color: textColor }]}>{r.name}</Text>
                        <Text style={[styles.assignSelectMeta, { color: subtextColor }]}>
                          🚗 {r.vehicleType || 'Motorcycle'} · {r.riderStatus || 'OFFLINE'}
                        </Text>
                      </View>
                      {assigning ? (
                        <ActivityIndicator color={theme.primary} />
                      ) : (
                        <Text style={[styles.assignSelectCTA, { color: theme.primary }]}>Assign →</Text>
                      )}
                    </TouchableOpacity>
                  ))
              )}
            </ScrollView>
            <TouchableOpacity
              style={[styles.modalCancelBtn, { borderColor }]}
              onPress={() => setAssignOrderModal(null)}
            >
              <Text style={{ color: subtextColor }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 52,
    paddingBottom: 16,
    paddingHorizontal: 16,
    gap: 12,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnText: { color: '#FFF', fontSize: 22, fontWeight: '700', marginTop: -2 },
  headerTitle: { color: '#FFF', fontSize: 18, fontWeight: '800' },
  headerSub: { color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 2 },
  tabBar: {
    borderBottomWidth: 1,
    flexGrow: 0,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 6,
  },
  tabIcon: { fontSize: 16 },
  tabLabel: { fontSize: 13, fontWeight: '600' },
  content: { flex: 1 },
  section: { padding: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '800', marginBottom: 12, marginTop: 8 },
  agentCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 20,
  },
  agentName: { fontSize: 18, fontWeight: '800', marginBottom: 4 },
  agentMeta: { fontSize: 13 },
  pendingBadge: {
    marginTop: 10,
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  pendingBadgeText: { color: '#92400E', fontSize: 12, fontWeight: '600' },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    minWidth: '45%',
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    alignItems: 'center',
  },
  statIcon: { fontSize: 24, marginBottom: 4 },
  statValue: { fontSize: 26, fontWeight: '900' },
  statLabel: { fontSize: 11, marginTop: 2, textAlign: 'center' },
  quickActions: { gap: 8 },
  quickActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    padding: 14,
    gap: 12,
  },
  quickActionIcon: { fontSize: 20 },
  quickActionLabel: { flex: 1, fontSize: 14, fontWeight: '600' },
  listCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
  },
  listCardRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
  listCardTitle: { fontSize: 14, fontWeight: '700', marginBottom: 3 },
  listCardMeta: { fontSize: 12, marginBottom: 2 },
  statusBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  statusBadgeText: { fontSize: 11, fontWeight: '700' },
  assignedText: { fontSize: 12, fontWeight: '600', marginBottom: 8 },
  unassignedText: { fontSize: 12, fontWeight: '600', marginBottom: 8 },
  assignBtn: {
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignSelf: 'flex-start',
  },
  assignBtnText: { color: '#FFF', fontWeight: '700', fontSize: 13 },
  verificationText: { fontSize: 12, fontWeight: '600', marginTop: 4 },
  riderStatusBadge: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 4,
    alignItems: 'center',
  },
  emptyState: { alignItems: 'center', paddingVertical: 48 },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', marginBottom: 6 },
  emptySub: { fontSize: 13, textAlign: 'center', maxWidth: 280, lineHeight: 18 },
  retryBtn: {
    marginTop: 16,
    borderRadius: 10,
    paddingHorizontal: 24,
    paddingVertical: 10,
  },
  retryBtnText: { color: '#FFF', fontWeight: '700' },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    padding: 20,
    paddingBottom: 36,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', marginBottom: 6 },
  modalSub: { fontSize: 13, marginBottom: 16 },
  noAvailableText: { textAlign: 'center', padding: 20, fontSize: 14, fontWeight: '600' },
  assignSelectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    paddingVertical: 12,
    gap: 12,
  },
  assignSelectName: { fontSize: 14, fontWeight: '700' },
  assignSelectMeta: { fontSize: 12, marginTop: 2 },
  assignSelectCTA: { fontSize: 13, fontWeight: '700' },
  modalCancelBtn: {
    marginTop: 16,
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  walletCard: {
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
  },
  walletHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  walletLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '600' },
  walletBalance: { color: '#FFF', fontSize: 26, fontWeight: '900', marginTop: 2 },
  walletBtn: {
    backgroundColor: 'rgba(255,255,255,0.22)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  walletBtnText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  walletSub: { color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: '500' },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  searchInput: { flex: 1, fontSize: 14, padding: 0 },
  rolePill: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  rolePillText: { fontSize: 12, fontWeight: '700' },
  userRoleTag: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  userRoleTagText: { fontSize: 11, fontWeight: '700' },
});
