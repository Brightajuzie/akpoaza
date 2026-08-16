import React, { useContext, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, ScrollView, useWindowDimensions, Platform, Modal, FlatList } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from '../utils/storage';
import { AuthContext } from '../context/AuthContext';
import { SettingsContext } from '../context/SettingsContext';
import { useCurrency } from '../context/CurrencyContext';
import { SUPPORTED_COUNTRIES } from '../utils/currency';
import apiClient from '../api/client';
import ThemeToggle from '../components/ThemeToggle';

const BIOMETRIC_TOKEN_KEY = 'biometric_auth_token';
const BIOMETRIC_ENABLED_KEY = 'biometric_enabled';

export default function ProfileScreen({ navigation }: any) {
  const { width } = useWindowDimensions();
  const isLargeScreen = width >= 768;
  const { logout, userToken, userInfo, refreshUser } = useContext(AuthContext);
  const { theme, colorMode } = useContext(SettingsContext);
  const { fmt, activeCountry, setCountry, countries } = useCurrency();
  const isDark = colorMode === 'dark';
  const cardBg = isDark ? '#1E293B' : '#FFFFFF';
  const borderColor = isDark ? '#334155' : '#E2E8F0';
  const textColor = isDark ? '#F1F5F9' : '#0F172A';
  const subtextColor = isDark ? '#94A3B8' : '#64748B';
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(false);
  const [trackingIntervalId, setTrackingIntervalId] = useState<any>(null);
  const [showCountryModal, setShowCountryModal] = useState(false);
  const [savingCountry, setSavingCountry] = useState(false);

  // Biometric state
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);

  // Analytics state for handyman
  const [analytics, setAnalytics] = useState<any>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [walletPreview, setWalletPreview] = useState<any>(null);

  useEffect(() => {
    checkBiometricSupport();
  }, []);

  const checkBiometricSupport = async () => {
    if (Platform.OS === 'web') return;
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      const available = hasHardware && isEnrolled;
      setBiometricAvailable(available);

      if (available) {
        const enabled = await SecureStore.getItemAsync(BIOMETRIC_ENABLED_KEY);
        setBiometricEnabled(enabled === 'true');
      }
    } catch (e) {
      console.log('Biometric support check error in profile', e);
    }
  };

  const toggleBiometric = async () => {
    if (!biometricAvailable) {
      Alert.alert(
        'Biometrics Unavailable',
        'Biometric authentication (Face ID / Fingerprint) is not enrolled or supported on this device.'
      );
      return;
    }

    if (biometricEnabled) {
      await SecureStore.setItemAsync(BIOMETRIC_ENABLED_KEY, 'false');
      await SecureStore.deleteItemAsync(BIOMETRIC_TOKEN_KEY);
      setBiometricEnabled(false);
      Alert.alert('Disabled', 'Biometric login has been turned off.');
    } else {
      try {
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: 'Authenticate to enable Biometric Login',
          cancelLabel: 'Cancel',
          fallbackLabel: 'Use Password',
        });

        if (result.success && userToken) {
          await SecureStore.setItemAsync(BIOMETRIC_TOKEN_KEY, userToken);
          await SecureStore.setItemAsync(BIOMETRIC_ENABLED_KEY, 'true');
          setBiometricEnabled(true);
          Alert.alert('✅ Enabled', 'Biometric login (Face ID / Fingerprint) is now active!');
        }
      } catch (err) {
        Alert.alert('Failed', 'Could not authenticate biometrics.');
      }
    }
  };

  const fetchProfile = async () => {
    try {
      const response = await apiClient.get('/auth/me');
      setProfile(response.data);
    } catch (error) {
      console.error('Failed to load profile', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchWalletPreview = async () => {
    try {
      const response = await apiClient.get('/wallet/balance');
      setWalletPreview(response.data);
    } catch (e) {
      // ignore
    }
  };

  const fetchAnalytics = async () => {
    setAnalyticsLoading(true);
    try {
      const response = await apiClient.get('/analytics/handyman');
      setAnalytics(response.data);
    } catch (error) {
      console.error('Analytics fetch failed', error);
    } finally {
      setAnalyticsLoading(false);
    }
  };

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      if (userToken) {
        fetchProfile();
      }
    });
    return unsubscribe;
  }, [navigation, userToken]);

  useEffect(() => {
    if (userToken) {
      fetchProfile();
    } else {
      setProfile(null);
      setLoading(false);
    }
  }, [userToken]);

  useEffect(() => {
    if (profile?.role === 'HANDYMAN') {
      fetchAnalytics();
    }
    if (profile?.role === 'HANDYMAN' || profile?.role === 'VENDOR' || profile?.role === 'RIDER') {
      fetchWalletPreview();
    }
  }, [profile]);

  // Clean up interval on unmount
  useEffect(() => {
    return () => {
      if (trackingIntervalId) {
        clearInterval(trackingIntervalId);
      }
    };
  }, [trackingIntervalId]);

  const toggleOnlineStatus = async () => {
    if (!profile) return;

    if (profile.verificationStatus !== 'VERIFIED') {
      Alert.alert(
        'Verification Required',
        'You must complete identity verification before you can go online and receive job dispatches.',
        [
          { text: 'Verify Now', onPress: () => navigation.navigate('KYCStatus') },
          { text: 'Cancel', style: 'cancel' }
        ]
      );
      return;
    }

    const nextStatus = !isOnline;
    setIsOnline(nextStatus);

    if (nextStatus) {
      // Start Simulating Location Updates
      Alert.alert('Online', 'You are now online. Your live location is being shared with active bookings.');
      
      // Let's set initial coordinates if none exist
      let currentLat = profile.latitude || 40.7200;
      let currentLng = profile.longitude || -74.0100;

      // Immediately sync coordinates
      try {
        await apiClient.patch('/auth/location', { currentLat, currentLng });
      } catch (e) {
        console.error('Initial location sync failed', e);
      }

      // Simulate movement every 5 seconds
      const interval = setInterval(async () => {
        // Walk or drive slowly: add minor offsets
        currentLat += (Math.random() - 0.5) * 0.001;
        currentLng += (Math.random() - 0.5) * 0.001;

        try {
          await apiClient.patch('/auth/location', { currentLat, currentLng });
          console.log(`Live location simulated: ${currentLat.toFixed(5)}, ${currentLng.toFixed(5)}`);
        } catch (error) {
          console.error('Failed to update live coordinates', error);
        }
      }, 5000);

      setTrackingIntervalId(interval);
    } else {
      // Stop Tracking
      if (trackingIntervalId) {
        clearInterval(trackingIntervalId);
        setTrackingIntervalId(null);
      }
      Alert.alert('Offline', 'You are now offline. Location sharing paused.');
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  if (!userToken) {
    return (
      <View style={[styles.guestContainer, { backgroundColor: theme.background }, isLargeScreen && styles.guestContainerWeb]}>
        <View style={[styles.card, { borderColor: theme.border, alignItems: 'center', padding: 32 }]}>
          <Text style={{ fontSize: 48, marginBottom: 16 }}>👤</Text>
          <Text style={[styles.cardTitle, { textAlign: 'center', fontSize: 20, marginBottom: 12 }]}>Unlock Your Profile</Text>
          <Text style={[styles.subLabel, { textAlign: 'center', marginBottom: 24, lineHeight: 20 }]}>
            Log in or create a free account to track active technician transits, view booking history, order high-quality equipment, and personalize your experience.
          </Text>
          <TouchableOpacity 
            style={[styles.primaryBtn, { backgroundColor: theme.primary, width: '100%', borderRadius: 12, paddingVertical: 14 }]} 
            onPress={() => navigation.navigate('Login')}
          >
            <Text style={styles.primaryBtnText}>Log In</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.logoutButton, { width: '100%', marginTop: 12, borderRadius: 12, paddingVertical: 14, borderColor: theme.primary }]} 
            onPress={() => navigation.navigate('Signup')}
          >
            <Text style={[styles.logoutButtonText, { color: theme.primary }]}>Create Account</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <Text style={styles.errorText}>Could not load profile data.</Text>
        <TouchableOpacity style={styles.logoutButton} onPress={logout}>
          <Text style={styles.logoutButtonText}>Log Out</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const hasCoordinates = profile.latitude && profile.longitude;

  const renderVerificationBadge = () => {
    if (profile.role !== 'VENDOR' && profile.role !== 'HANDYMAN' && profile.role !== 'RIDER') return null;

    const status = profile.verificationStatus || 'UNVERIFIED';
    let badgeColor = theme.lightText;
    let badgeBg = '#E5E5EA';
    let text = 'Unverified';

    if (status === 'VERIFIED') {
      badgeColor = '#34C759';
      badgeBg = '#E8F5E9';
      text = 'Verified';
    } else if (status === 'PENDING_REVIEW') {
      badgeColor = '#FF9500';
      badgeBg = '#FFF3E0';
      text = 'Pending';
    } else if (status === 'REJECTED') {
      badgeColor = '#FF3B30';
      badgeBg = '#FFEBEE';
      text = 'Rejected';
    }

    return (
      <TouchableOpacity 
        style={[styles.kycBadge, { backgroundColor: badgeBg, borderColor: badgeColor }]}
        onPress={() => navigation.navigate('KYCStatus')}
        activeOpacity={0.8}
      >
        <Text style={[styles.kycBadgeText, { color: badgeColor }]}>{text}</Text>
      </TouchableOpacity>
    );
  };

  const renderVerificationBanner = () => {
    if (profile.role !== 'VENDOR' && profile.role !== 'HANDYMAN' && profile.role !== 'RIDER') return null;

    const status = profile.verificationStatus || 'UNVERIFIED';
    if (status === 'VERIFIED') return null;

    let bannerBg = '#FFF9C4';
    let bannerText = 'Action Required: Complete identity verification to unlock full dashboard features.';
    let actionText = 'Verify Identity →';
    let statusColor = '#F57F17';

    if (status === 'PENDING_REVIEW') {
      bannerBg = '#E8F4FD';
      statusColor = '#0D47A1';
      bannerText = 'Verification in progress. Compliance team is checking your details.';
      actionText = 'View Status →';
    } else if (status === 'REJECTED') {
      bannerBg = '#FFEBEE';
      statusColor = '#B71C1C';
      bannerText = 'Verification rejected. Please click here to review and re-submit.';
      actionText = 'Re-submit →';
    }

    return (
      <TouchableOpacity 
        style={[styles.verificationBanner, { backgroundColor: bannerBg }]}
        onPress={() => navigation.navigate('KYCStatus')}
        activeOpacity={0.9}
      >
        <Text style={[styles.bannerTextContent, { color: statusColor }]}>
          ⚠️ <Text style={{ fontWeight: '700' }}>{bannerText}</Text> <Text style={{ textDecorationLine: 'underline' }}>{actionText}</Text>
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <ScrollView 
      style={[styles.container, { backgroundColor: theme.background }]} 
      contentContainerStyle={[styles.contentContainer, isLargeScreen && styles.contentContainerWeb]}
      showsVerticalScrollIndicator={false}
    >
      {renderVerificationBanner()}
      
      {/* Header Profile Info */}
      <View style={[styles.header, { backgroundColor: cardBg, borderColor: borderColor }]}>
        <View style={[styles.avatarRing, { borderColor: theme.primary + '60' }]}>
          <View style={[styles.avatarPlaceholder, { backgroundColor: theme.primary, shadowColor: theme.primary }]}>
            <Text style={styles.avatarText}>{profile.name.charAt(0).toUpperCase()}</Text>
          </View>
        </View>
        <Text style={[styles.name, { color: textColor }]}>{profile.name}</Text>
        <Text style={[styles.email, { color: subtextColor }]}>{profile.email}</Text>
        {profile.phone ? <Text style={[styles.phoneText, { color: subtextColor }]}>📞 {profile.phone}</Text> : null}
        <View style={styles.badgeRow}>
          <View style={[styles.roleBadge, { backgroundColor: theme.primary + '20' }]}>
            <Text style={[styles.roleText, { color: theme.primary }]}>{profile.role}</Text>
          </View>
          {renderVerificationBadge()}
        </View>
      </View>

      {/* Role-specific Quick Actions Dashboard */}
      {profile.role === 'CUSTOMER' && (
        <View style={[styles.dashboardSection, { backgroundColor: cardBg, borderColor: borderColor }]}>
          <Text style={[styles.dashboardTitle, { color: textColor }]}>Quick Actions</Text>
          <View style={styles.quickGrid}>
            {[
              { icon: '🛒', label: 'Shop', sub: 'Browse products', onPress: () => navigation.navigate('Shop') },
              { icon: '🔧', label: 'Book Fix', sub: 'Hire handyman', onPress: () => navigation.navigate('Services') },
              { icon: '🚚', label: 'Send Parcel', sub: 'Courier delivery', onPress: () => navigation.navigate('BookParcel') },
              { icon: '📋', label: 'My Orders', sub: 'Track & history', onPress: () => navigation.navigate('History', { type: 'orders', role: 'CUSTOMER' }) },
              { icon: '💳', label: 'Wallet', sub: 'Pay & balance', onPress: () => navigation.navigate('Wallet') },
              { icon: '📖', label: 'Bookings', sub: 'Service history', onPress: () => navigation.navigate('History', { type: 'bookings', role: 'CUSTOMER' }) },
            ].map((item, i) => (
              <TouchableOpacity key={i} style={[styles.quickTile, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderColor: borderColor }]} onPress={item.onPress} activeOpacity={0.75}>
                <Text style={styles.quickTileIcon}>{item.icon}</Text>
                <Text style={[styles.quickTileLabel, { color: textColor }]}>{item.label}</Text>
                <Text style={[styles.quickTileSub, { color: subtextColor }]}>{item.sub}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {profile.role === 'VENDOR' && (
        <View style={[styles.dashboardSection, { backgroundColor: cardBg, borderColor: borderColor }]}>
          <Text style={[styles.dashboardTitle, { color: textColor }]}>Vendor Dashboard</Text>
          <View style={styles.quickGrid}>
            {[
              { icon: '🏪', label: 'My Catalog', sub: 'Manage listings', onPress: () => navigation.navigate('Admin') },
              { icon: '➕', label: 'Add Product', sub: 'List new item', onPress: () => navigation.navigate('Admin') },
              { icon: '📦', label: 'Orders', sub: 'Customer orders', onPress: () => navigation.navigate('History', { type: 'orders', role: 'VENDOR' }) },
              { icon: '💳', label: 'Wallet', sub: 'Payouts & balance', onPress: () => navigation.navigate('Wallet') },
              { icon: '🛡️', label: 'KYC Status', sub: 'Verification', onPress: () => navigation.navigate('KYCStatus') },
              { icon: '📊', label: 'Earnings', sub: 'Sales report', onPress: () => navigation.navigate('History', { type: 'orders', role: 'VENDOR' }) },
            ].map((item, i) => (
              <TouchableOpacity key={i} style={[styles.quickTile, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderColor: borderColor }]} onPress={item.onPress} activeOpacity={0.75}>
                <Text style={styles.quickTileIcon}>{item.icon}</Text>
                <Text style={[styles.quickTileLabel, { color: textColor }]}>{item.label}</Text>
                <Text style={[styles.quickTileSub, { color: subtextColor }]}>{item.sub}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {profile.role === 'HANDYMAN' && (
        <View style={[styles.dashboardSection, { backgroundColor: cardBg, borderColor: borderColor }]}>
          <Text style={[styles.dashboardTitle, { color: textColor }]}>Service Provider Hub</Text>
          <View style={styles.quickGrid}>
            {[
              { icon: '📋', label: 'My Jobs', sub: 'Active & history', onPress: () => navigation.navigate('History', { type: 'bookings', role: 'HANDYMAN' }) },
              { icon: '💳', label: 'Wallet', sub: 'Earnings & payout', onPress: () => navigation.navigate('Wallet') },
              { icon: '📊', label: 'Analytics', sub: 'Performance stats', onPress: () => {} },
              { icon: '🛡️', label: 'KYC Status', sub: 'Verify identity', onPress: () => navigation.navigate('KYCStatus') },
              { icon: '⭐', label: 'My Ratings', sub: 'Customer reviews', onPress: () => navigation.navigate('History', { type: 'bookings', role: 'HANDYMAN' }) },
              { icon: '📍', label: 'Location', sub: 'Live sharing', onPress: () => {} },
            ].map((item, i) => (
              <TouchableOpacity key={i} style={[styles.quickTile, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderColor: borderColor }]} onPress={item.onPress} activeOpacity={0.75}>
                <Text style={styles.quickTileIcon}>{item.icon}</Text>
                <Text style={[styles.quickTileLabel, { color: textColor }]}>{item.label}</Text>
                <Text style={[styles.quickTileSub, { color: subtextColor }]}>{item.sub}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {profile.role === 'RIDER' && (
        <View style={[styles.dashboardSection, { backgroundColor: cardBg, borderColor: borderColor }]}>
          <Text style={[styles.dashboardTitle, { color: textColor }]}>Rider Hub</Text>
          <View style={styles.quickGrid}>
            {[
              { icon: '🛵', label: 'Earnings', sub: 'Trips & payouts', onPress: () => navigation.navigate('RiderEarnings') },
              { icon: '📦', label: 'Deliveries', sub: 'Active & history', onPress: () => navigation.navigate('History', { type: 'orders', role: 'RIDER', tab: 'parcels' }) },
              { icon: '💳', label: 'Wallet', sub: 'Balance & withdraw', onPress: () => navigation.navigate('Wallet') },
              { icon: '🚗', label: 'Vehicle', sub: 'Registration info', onPress: () => {} },
              { icon: '🛡️', label: 'KYC Status', sub: 'Verify identity', onPress: () => navigation.navigate('KYCStatus') },
              { icon: '📍', label: 'Location', sub: 'Live sharing', onPress: () => {} },
            ].map((item, i) => (
              <TouchableOpacity key={i} style={[styles.quickTile, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderColor: borderColor }]} onPress={item.onPress} activeOpacity={0.75}>
                <Text style={styles.quickTileIcon}>{item.icon}</Text>
                <Text style={[styles.quickTileLabel, { color: textColor }]}>{item.label}</Text>
                <Text style={[styles.quickTileSub, { color: subtextColor }]}>{item.sub}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* Live Location Sharing Panel for Handymen, Vendors, and Riders */}
      {(profile.role === 'HANDYMAN' || profile.role === 'VENDOR' || profile.role === 'RIDER') && (
        <View style={[styles.trackingCard, { backgroundColor: cardBg, borderColor: isOnline ? theme.primary + '60' : borderColor }]}>
          <View style={styles.trackingHeader}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.trackingTitle, { color: textColor }]}>Live Location Sharing</Text>
              <Text style={[styles.trackingDesc, { color: subtextColor, marginTop: 2 }]}>
                {isOnline
                  ? '🟢 Active — Your location is being broadcast to active bookings'
                  : '🔴 Inactive — Toggle to start sharing your location'}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.switchContainer, isOnline ? { backgroundColor: theme.primary } : styles.switchOff]}
              onPress={toggleOnlineStatus}
            >
              <View style={[styles.switchThumb, isOnline ? styles.switchThumbOn : styles.switchThumbOff]} />
            </TouchableOpacity>
          </View>
          {isOnline && (
            <View style={[styles.locationPill, { backgroundColor: theme.primary + '18' }]}>
              <Text style={[styles.locationPillText, { color: theme.primary }]}>📡 Broadcasting every 5s</Text>
            </View>
          )}
        </View>
      )}

      {/* Wallet Preview Card */}
      {(profile.role === 'HANDYMAN' || profile.role === 'VENDOR' || profile.role === 'RIDER') && (
        <TouchableOpacity
          style={[styles.walletPreviewCard, { backgroundColor: cardBg, borderColor: borderColor }]}
          onPress={() => navigation.navigate('Wallet')}
          activeOpacity={0.8}
        >
          <View style={[styles.walletPreviewInner, { backgroundColor: theme.primary }]}>
            <View style={styles.walletPreviewHeader}>
              <View>
                <Text style={styles.walletPreviewLabel}>Available Balance</Text>
                <Text style={styles.walletBigAmount}>
                  {walletPreview?.balance !== undefined ? fmt(walletPreview.balance) : '---'}
                </Text>
              </View>
              <View style={styles.walletManageBtn}>
                <Text style={styles.walletManageBtnText}>Manage →</Text>
              </View>
            </View>
            <View style={styles.walletPreviewStats}>
              <View style={styles.walletPreviewStat}>
                <Text style={styles.walletPreviewLabelLight}>Pending Hold</Text>
                <Text style={styles.walletPreviewValLight}>
                  {walletPreview?.pendingBalance !== undefined ? fmt(walletPreview.pendingBalance) : '---'}
                </Text>
              </View>
              <View style={[styles.walletPreviewDivider, { backgroundColor: 'rgba(255,255,255,0.3)' }]} />
              <View style={styles.walletPreviewStat}>
                <Text style={styles.walletPreviewLabelLight}>Total Earned</Text>
                <Text style={styles.walletPreviewValLight}>
                  {walletPreview?.totalEarned !== undefined ? fmt(walletPreview.totalEarned) : '---'}
                </Text>
              </View>
            </View>
          </View>
        </TouchableOpacity>
      )}

      {/* Handyman Earnings Analytics Card */}
      {profile.role === 'HANDYMAN' && (
        <View style={[styles.analyticsCard, { backgroundColor: cardBg, borderColor: borderColor }]}>
          <View style={styles.analyticsHeader}>
            <Text style={[styles.cardTitle, { color: textColor }]}>📊 Earnings Analytics</Text>
            {analyticsLoading && <ActivityIndicator size="small" color={theme.primary} />}
          </View>

          {analytics && !analyticsLoading && (
            <>
              {/* Stats Row */}
              <View style={styles.analyticsStatsRow}>
                <View style={styles.analyticsStat}>
                  <Text style={[styles.analyticsStatVal, { color: theme.primary }]}>
                    {analytics.totalJobs}
                  </Text>
                  <Text style={styles.analyticsStatLabel}>Jobs Done</Text>
                </View>
                <View style={[styles.analyticsStatDivider, { backgroundColor: theme.border }]} />
                <View style={styles.analyticsStat}>
                  <Text style={[styles.analyticsStatVal, { color: '#34C759' }]}>
                    ${analytics.totalEarnings.toFixed(0)}
                  </Text>
                  <Text style={styles.analyticsStatLabel}>Total Earned</Text>
                </View>
                <View style={[styles.analyticsStatDivider, { backgroundColor: theme.border }]} />
                <View style={styles.analyticsStat}>
                  <Text style={[styles.analyticsStatVal, { color: '#FFD700' }]}>
                    {analytics.averageRating ? analytics.averageRating.toFixed(1) : 'N/A'}
                  </Text>
                  <Text style={styles.analyticsStatLabel}>Avg Rating</Text>
                </View>
              </View>

              {/* Star display */}
              {analytics.averageRating && (
                <View style={styles.starsRow}>
                  {[1,2,3,4,5].map(s => (
                    <Text key={s} style={[
                      styles.starChar,
                      s <= Math.round(analytics.averageRating) ? { color: '#FFD700' } : { color: '#E5E5EA' }
                    ]}>★</Text>
                  ))}
                  <Text style={styles.starRatingText}>
                    {analytics.averageRating.toFixed(1)} out of 5
                  </Text>
                </View>
              )}

              {/* Monthly Bar Chart */}
              {analytics.monthlyStats && analytics.monthlyStats.length > 0 && (
                <View style={styles.chartSection}>
                  <Text style={styles.chartTitle}>Monthly Jobs (Last 4 Months)</Text>
                  <View style={styles.chartBars}>
                    {(() => {
                      const maxJobs = Math.max(...analytics.monthlyStats.map((m: any) => m.jobs), 1);
                      return analytics.monthlyStats.map((month: any, index: number) => (
                        <View key={index} style={styles.chartBarGroup}>
                          <Text style={styles.chartBarValue}>{month.jobs}</Text>
                          <View style={styles.chartBarTrack}>
                            <View
                              style={[
                                styles.chartBarFill,
                                {
                                  height: `${Math.max((month.jobs / maxJobs) * 100, 5)}%`,
                                  backgroundColor: theme.primary,
                                }
                              ]}
                            />
                          </View>
                          <Text style={styles.chartBarLabel}>{month.month}</Text>
                        </View>
                      ));
                    })()}
                  </View>
                </View>
              )}
            </>
          )}

          {!analyticsLoading && !analytics && (
            <Text style={styles.analyticsEmpty}>
              Complete jobs to see your earnings analytics.
            </Text>
          )}
        </View>
      )}

      {profile.role === 'RIDER' && (
        <View style={[styles.card, { backgroundColor: cardBg, borderColor: borderColor }]}>
          <Text style={[styles.cardTitle, { color: textColor }]}>🚗 Vehicle Registration</Text>
          <View style={styles.vehicleRow}>
            <View style={styles.vehicleItem}>
              <Text style={[styles.label, { color: subtextColor }]}>Vehicle Type</Text>
              <Text style={[styles.valueText, { color: textColor }]}>{profile.vehicleType || 'Not set'}</Text>
            </View>
            <View style={styles.vehicleItem}>
              <Text style={[styles.label, { color: subtextColor }]}>License Plate</Text>
              <Text style={[styles.valueText, { color: textColor }]}>{profile.licensePlate || 'Not set'}</Text>
            </View>
          </View>
        </View>
      )}

      {/* Location / GPS Settings Card */}
      <View style={[styles.card, { backgroundColor: cardBg, borderColor: borderColor }]}>
        <Text style={[styles.cardTitle, { color: textColor }]}>📍 GPS Location Details</Text>
        <Text style={[styles.label, { color: subtextColor }]}>Home Base Address</Text>
        <Text style={[styles.valueText, { color: textColor }]}>{profile.address || 'No address set'}</Text>
        {hasCoordinates ? (
          <View style={[styles.coordinatesRow, { backgroundColor: isDark ? '#0F172A' : '#F1F5F9' }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.coordinatesLabel, { color: subtextColor }]}>Latitude</Text>
              <Text style={[styles.coordinatesVal, { color: theme.primary }]}>{profile.latitude.toFixed(6)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.coordinatesLabel, { color: subtextColor }]}>Longitude</Text>
              <Text style={[styles.coordinatesVal, { color: theme.primary }]}>{profile.longitude.toFixed(6)}</Text>
            </View>
          </View>
        ) : (
          <Text style={[styles.subLabel, { color: subtextColor }]}>Set your address during sign-up to enable distance matchmaking.</Text>
        )}
      </View>

      {/* Theme & Appearance Preference Card */}
      <View style={[styles.card, { backgroundColor: cardBg, borderColor: borderColor }]}>
        <Text style={[styles.cardTitle, { color: textColor }]}>🎨 App Theme & Appearance</Text>
        <Text style={[styles.subLabel, { color: subtextColor, marginBottom: 12 }]}>
          Choose between Light and Dark mode for comfortable viewing.
        </Text>
        <ThemeToggle />
      </View>

      {/* Country & Currency Preference Card */}
      <View style={[styles.card, { backgroundColor: cardBg, borderColor: borderColor }]}>
        <Text style={[styles.cardTitle, { color: textColor }]}>🌍 Country & Currency</Text>
        <Text style={[styles.subLabel, { color: subtextColor, marginBottom: 12 }]}>
          Prices and payments are shown in your selected currency.
        </Text>
        <TouchableOpacity
          style={[styles.countrySelector, { borderColor: borderColor, backgroundColor: isDark ? '#0F172A' : '#F8FAFC' }]}
          onPress={() => setShowCountryModal(true)}
          activeOpacity={0.8}
        >
          <Text style={styles.countryFlag}>{activeCountry.flag}</Text>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={[styles.countryName, { color: textColor }]}>{activeCountry.country}</Text>
            <Text style={[styles.currencyTag, { color: theme.primary }]}>
              {activeCountry.currency} · {activeCountry.symbol}
            </Text>
          </View>
          <Text style={{ color: subtextColor, fontSize: 20 }}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Country Picker Modal */}
      <Modal
        visible={showCountryModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCountryModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: theme.card || '#FFF' }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Select Your Country</Text>
              <TouchableOpacity onPress={() => setShowCountryModal(false)}>
                <Text style={{ color: theme.primary, fontSize: 16, fontWeight: '700' }}>Done</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={countries}
              keyExtractor={(item) => item.currency}
              renderItem={({ item }) => {
                const isActive = item.currency === activeCountry.currency;
                return (
                  <TouchableOpacity
                    style={[
                      styles.countryRow,
                      { borderBottomColor: theme.border },
                      isActive && { backgroundColor: theme.primary + '12' },
                    ]}
                    onPress={async () => {
                      setShowCountryModal(false);
                      setSavingCountry(true);
                      await setCountry(item.country);
                      try {
                        await apiClient.patch('/auth/profile', {
                          country: item.country,
                          currency: item.currency,
                        });
                        await refreshUser();
                      } catch (e) {
                        console.warn('Could not save country to profile', e);
                      } finally {
                        setSavingCountry(false);
                      }
                    }}
                  >
                    <Text style={styles.countryRowFlag}>{item.flag}</Text>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={[styles.countryRowName, { color: theme.text }]}>{item.country}</Text>
                      <Text style={[styles.countryRowCurrency, { color: theme.lightText }]}>
                        {item.currency} · {item.symbol}
                      </Text>
                    </View>
                    {isActive && (
                      <Text style={{ color: theme.primary, fontSize: 20, fontWeight: '800' }}>✓</Text>
                    )}
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </View>
      </Modal>

      {savingCountry && (
        <View style={styles.savingOverlay}>
          <ActivityIndicator color="#FFF" size="small" />
          <Text style={{ color: '#FFF', marginLeft: 8, fontWeight: '600' }}>Saving preference…</Text>
        </View>
      )}

      {/* Security & Biometric Login Card */}
      <View style={[styles.card, { backgroundColor: cardBg, borderColor: borderColor }]}>
        <Text style={[styles.cardTitle, { color: textColor }]}>🔐 Security & Authentication</Text>
        <View style={styles.trackingHeader}>
          <View style={{ flex: 1, marginRight: 12 }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: textColor }}>
              {Platform.OS === 'ios' ? 'Face ID / Touch ID Login' : 'Fingerprint / Biometric Login'}
            </Text>
            <Text style={{ fontSize: 12, color: subtextColor, marginTop: 2 }}>
              {biometricAvailable
                ? 'Sign in quickly without typing your password.'
                : 'Not available or enrolled on this device.'}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.switchContainer, biometricEnabled ? { backgroundColor: theme.primary } : styles.switchOff]}
            onPress={toggleBiometric}
            disabled={!biometricAvailable}
          >
            <View style={[styles.switchThumb, biometricEnabled ? styles.switchThumbOn : styles.switchThumbOff]} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Navigation Options List */}
      <View style={[styles.section, { backgroundColor: cardBg, borderColor: borderColor }]}>
        <Text style={[styles.sectionHeading, { color: subtextColor }]}>Account</Text>

        {profile.role === 'VENDOR' ? (
          <TouchableOpacity style={[styles.menuItem, { borderBottomColor: borderColor }]} onPress={() => navigation.navigate('History', { type: 'orders', role: profile.role })}>
            <Text style={styles.menuItemIcon}>📦</Text>
            <Text style={[styles.menuItemText, { color: textColor }]}>Product Sales Activity</Text>
            <Text style={[styles.menuItemChevron, { color: subtextColor }]}>›</Text>
          </TouchableOpacity>
        ) : profile.role === 'RIDER' ? (
          <TouchableOpacity style={[styles.menuItem, { borderBottomColor: borderColor }]} onPress={() => navigation.navigate('History', { type: 'orders', role: profile.role })}>
            <Text style={styles.menuItemIcon}>🚚</Text>
            <Text style={[styles.menuItemText, { color: textColor }]}>Deliveries & Dispatches</Text>
            <Text style={[styles.menuItemChevron, { color: subtextColor }]}>›</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={[styles.menuItem, { borderBottomColor: borderColor }]} onPress={() => navigation.navigate('History', { type: 'orders', role: profile.role })}>
            <Text style={styles.menuItemIcon}>🛒</Text>
            <Text style={[styles.menuItemText, { color: textColor }]}>Order History</Text>
            <Text style={[styles.menuItemChevron, { color: subtextColor }]}>›</Text>
          </TouchableOpacity>
        )}

        {profile.role !== 'VENDOR' && profile.role !== 'RIDER' && (
          <TouchableOpacity style={[styles.menuItem, { borderBottomColor: borderColor }]} onPress={() => navigation.navigate('History', { type: 'bookings', role: profile.role })}>
            <Text style={styles.menuItemIcon}>📋</Text>
            <Text style={[styles.menuItemText, { color: textColor }]}>
              {profile.role === 'HANDYMAN' ? 'Assigned Jobs & Tickets' : 'Booking History'}
            </Text>
            <Text style={[styles.menuItemChevron, { color: subtextColor }]}>›</Text>
          </TouchableOpacity>
        )}

        {(profile.role === 'VENDOR' || profile.role === 'HANDYMAN' || profile.role === 'RIDER') && (
          <TouchableOpacity style={[styles.menuItem, { borderBottomColor: borderColor }]} onPress={() => navigation.navigate('Wallet')}>
            <Text style={styles.menuItemIcon}>💳</Text>
            <Text style={[styles.menuItemText, { color: textColor }]}>Virtual Platform Wallet</Text>
            <Text style={[styles.menuItemChevron, { color: subtextColor }]}>›</Text>
          </TouchableOpacity>
        )}

        {profile.role === 'RIDER' && (
          <TouchableOpacity style={[styles.menuItem, { borderBottomColor: borderColor }]} onPress={() => navigation.navigate('RiderEarnings')}>
            <Text style={styles.menuItemIcon}>🛵</Text>
            <Text style={[styles.menuItemText, { color: textColor }]}>Rider Earnings & Trips</Text>
            <Text style={[styles.menuItemChevron, { color: subtextColor }]}>›</Text>
          </TouchableOpacity>
        )}

        {(profile.role === 'VENDOR' || profile.role === 'HANDYMAN' || profile.role === 'RIDER') && (
          <TouchableOpacity style={[styles.menuItem, { borderBottomColor: borderColor }]} onPress={() => navigation.navigate('KYCStatus')}>
            <Text style={styles.menuItemIcon}>🛡️</Text>
            <Text style={[styles.menuItemText, { color: textColor }]}>Identity Verification (KYC)</Text>
            <Text style={[styles.menuItemChevron, { color: subtextColor }]}>›</Text>
          </TouchableOpacity>
        )}

        {(profile.role === 'ADMIN' || profile.role === 'VENDOR') && (
          <TouchableOpacity style={[styles.menuItem, { borderBottomColor: borderColor }]} onPress={() => navigation.navigate('Admin')}>
            <Text style={styles.menuItemIcon}>{profile.role === 'ADMIN' ? '⚙️' : '🏪'}</Text>
            <Text style={[styles.menuItemText, { color: theme.primary }]}>
              {profile.role === 'ADMIN' ? 'Admin Control Panel' : 'Manage Product Catalog'}
            </Text>
            <Text style={[styles.menuItemChevron, { color: theme.primary }]}>›</Text>
          </TouchableOpacity>
        )}
      </View>

      <TouchableOpacity style={[styles.logoutButton, { backgroundColor: isDark ? '#1E293B' : '#FFF', borderColor: '#EF4444' }]} onPress={logout}>
        <Text style={{ color: '#EF4444', fontSize: 16, fontWeight: '700' }}>🚪 Log Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  guestContainer: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },
  primaryBtn: {
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  contentContainer: {
    padding: 24,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 16,
    color: '#DC3545',
    marginBottom: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 20,
    marginTop: 4,
    borderRadius: 20,
    padding: 28,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  avatarRing: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  avatarPlaceholder: {
    width: 86,
    height: 86,
    borderRadius: 43,
    justifyContent: 'center',
    alignItems: 'center',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 4,
  },
  avatarText: {
    fontSize: 36,
    color: '#FFF',
    fontWeight: '800',
  },
  name: {
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 4,
  },
  email: {
    fontSize: 14,
    marginBottom: 4,
  },
  phoneText: {
    fontSize: 13,
    marginBottom: 10,
  },
  roleBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 16,
  },
  roleText: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  trackingCard: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 2,
  },
  trackingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  trackingTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  trackingDesc: {
    fontSize: 12,
    lineHeight: 17,
  },
  locationPill: {
    marginTop: 12,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
  },
  locationPillText: {
    fontSize: 12,
    fontWeight: '700',
  },
  card: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 14,
  },
  dashboardSection: {
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 14,
    elevation: 2,
  },
  dashboardTitle: {
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 16,
    letterSpacing: -0.3,
  },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  quickTile: {
    width: '31%',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  quickTileIcon: {
    fontSize: 26,
    marginBottom: 6,
  },
  quickTileLabel: {
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 2,
  },
  quickTileSub: {
    fontSize: 10,
    textAlign: 'center',
    lineHeight: 13,
  },
  vehicleRow: {
    flexDirection: 'row',
    gap: 16,
  },
  vehicleItem: {
    flex: 1,
  },
  label: {
    fontSize: 12,
    color: '#8E8E93',
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  valueText: {
    fontSize: 15,
    color: '#1C1C1E',
    marginBottom: 16,
    fontWeight: '500',
  },
  coordinatesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 8,
  },
  coordinatesLabel: {
    fontSize: 13,
    color: '#3A3A3C',
    fontWeight: '500',
  },
  coordinatesVal: {
    fontWeight: '700',
  },
  subLabel: {
    fontSize: 13,
    color: '#8E8E93',
    lineHeight: 18,
  },
  section: {
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 24,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 2,
  },
  sectionHeading: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderBottomWidth: 1,
  },
  menuItemIcon: {
    fontSize: 18,
    width: 30,
  },
  menuItemText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
  },
  menuItemChevron: {
    fontSize: 20,
    fontWeight: '300',
  },
  logoutButton: {
    backgroundColor: '#FFF',
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FF3B30',
    marginBottom: 40,
  },
  logoutButtonText: {
    color: '#FF3B30',
    fontSize: 16,
    fontWeight: '700',
  },
  // Analytics card styles
  analyticsCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 2,
  },
  analyticsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  analyticsStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  analyticsStat: {
    flex: 1,
    alignItems: 'center',
  },
  analyticsStatVal: {
    fontSize: 24,
    fontWeight: '900',
    marginBottom: 2,
  },
  analyticsStatLabel: {
    fontSize: 11,
    color: '#8E8E93',
    fontWeight: '600',
    textAlign: 'center',
  },
  analyticsStatDivider: {
    width: 1,
    height: 40,
  },
  starsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  starChar: {
    fontSize: 18,
    marginRight: 2,
  },
  starRatingText: {
    fontSize: 12,
    color: '#8E8E93',
    marginLeft: 6,
    fontWeight: '600',
  },
  chartSection: {
    marginTop: 8,
  },
  chartTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#8E8E93',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  chartBars: {
    flexDirection: 'row',
    height: 100,
    alignItems: 'flex-end',
  },
  chartBarGroup: {
    flex: 1,
    alignItems: 'center',
  },
  chartBarValue: {
    fontSize: 11,
    fontWeight: '700',
    color: '#3A3A3C',
    marginBottom: 4,
  },
  chartBarTrack: {
    width: 28,
    height: 70,
    backgroundColor: '#F2F2F7',
    borderRadius: 6,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  chartBarFill: {
    width: '100%',
    borderRadius: 6,
    minHeight: 4,
  },
  chartBarLabel: {
    fontSize: 10,
    color: '#8E8E93',
    fontWeight: '600',
    marginTop: 4,
  },
  analyticsEmpty: {
    fontSize: 13,
    color: '#AEAEB2',
    textAlign: 'center',
    paddingVertical: 10,
    fontStyle: 'italic',
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
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
  },
  kycBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    marginLeft: 8,
  },
  kycBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  verificationBanner: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.05)',
  },
  bannerTextContent: {
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
  },
  walletPreviewCard: {
    borderRadius: 20,
    marginBottom: 20,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 4,
  },
  walletPreviewInner: {
    padding: 22,
    borderRadius: 18,
  },
  walletBigAmount: {
    fontSize: 30,
    fontWeight: '900',
    color: '#FFF',
    letterSpacing: -0.5,
    marginTop: 4,
  },
  walletManageBtn: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.22)',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
  },
  walletManageBtnText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
  },
  walletPreviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  walletPreviewTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFF',
  },
  walletPreviewStats: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  walletPreviewStat: {
    flex: 1,
  },
  walletPreviewLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  walletPreviewLabelLight: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 3,
  },
  walletPreviewVal: {
    fontSize: 18,
    fontWeight: '900',
    color: '#FFF',
  },
  walletPreviewValLight: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFF',
  },
  walletPreviewDivider: {
    width: 1,
    height: 36,
    marginHorizontal: 16,
  },
  guestContainerWeb: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 420,
    justifyContent: 'center',
  },
  contentContainerWeb: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 600,
  },
  // Country & Currency selector styles
  countrySelector: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
  },
  countryFlag: {
    fontSize: 28,
  },
  countryName: {
    fontSize: 16,
    fontWeight: '700',
  },
  currencyTag: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '75%',
    paddingBottom: 32,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  countryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  countryRowFlag: {
    fontSize: 26,
  },
  countryRowName: {
    fontSize: 15,
    fontWeight: '600',
  },
  countryRowCurrency: {
    fontSize: 12,
    marginTop: 2,
  },
  // Saving overlay
  savingOverlay: {
    position: 'absolute',
    bottom: 80,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
  },
});
