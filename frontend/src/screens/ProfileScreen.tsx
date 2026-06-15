import React, { useContext, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { AuthContext } from '../context/AuthContext';
import { SettingsContext } from '../context/SettingsContext';
import apiClient from '../api/client';

export default function ProfileScreen({ navigation }: any) {
  const { logout, userToken, userInfo, refreshUser } = useContext(AuthContext);
  const { theme } = useContext(SettingsContext);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(false);
  const [trackingIntervalId, setTrackingIntervalId] = useState<any>(null);

  // Analytics state for handyman
  // Analytics state for handyman
  const [analytics, setAnalytics] = useState<any>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [walletPreview, setWalletPreview] = useState<any>(null);

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
      <View style={[styles.guestContainer, { backgroundColor: theme.background }]}>
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
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      {renderVerificationBanner()}
      
      {/* Header Profile Info */}
      <View style={styles.header}>
        <View style={[styles.avatarPlaceholder, { backgroundColor: theme.primary, shadowColor: theme.primary }]}>
          <Text style={styles.avatarText}>{profile.name.charAt(0).toUpperCase()}</Text>
        </View>
        <Text style={styles.name}>{profile.name}</Text>
        <Text style={styles.email}>{profile.email}</Text>
        <View style={styles.badgeRow}>
          <View style={[styles.roleBadge, { backgroundColor: theme.primary + '15' }]}>
            <Text style={[styles.roleText, { color: theme.primary }]}>{profile.role}</Text>
          </View>
          {renderVerificationBadge()}
        </View>
      </View>

      {/* Live Location Sharing Panel for Handymen, Vendors, and Riders */}
      {(profile.role === 'HANDYMAN' || profile.role === 'VENDOR' || profile.role === 'RIDER') && (
        <View style={[styles.trackingCard, { borderColor: theme.border }]}>
          <View style={styles.trackingHeader}>
            <Text style={styles.trackingTitle}>Live Location Sharing</Text>
            <TouchableOpacity
              style={[styles.switchContainer, isOnline ? { backgroundColor: theme.primary } : styles.switchOff]}
              onPress={toggleOnlineStatus}
            >
              <View style={[styles.switchThumb, isOnline ? styles.switchThumbOn : styles.switchThumbOff]} />
            </TouchableOpacity>
          </View>
          <Text style={styles.trackingDesc}>
            {isOnline 
              ? '🟢 Active. Simulating transit route to show customer on map.' 
              : '🔴 Inactive. Toggle switch to share location and start receiving jobs.'}
          </Text>
        </View>
      )}

      {/* Wallet Preview Card */}
      {(profile.role === 'HANDYMAN' || profile.role === 'VENDOR' || profile.role === 'RIDER') && (
        <TouchableOpacity 
          style={[styles.walletPreviewCard, { borderColor: theme.border, backgroundColor: theme.primary + '0B' }]}
          onPress={() => navigation.navigate('Wallet')}
          activeOpacity={0.8}
        >
          <View style={styles.walletPreviewHeader}>
            <Text style={[styles.walletPreviewTitle, { color: theme.text }]}>💳 Virtual Wallet</Text>
            <Text style={{ color: theme.primary, fontWeight: '800', fontSize: 13 }}>View &amp; Withdraw →</Text>
          </View>
          <View style={styles.walletPreviewStats}>
            <View style={styles.walletPreviewStat}>
              <Text style={styles.walletPreviewLabel}>Withdrawable</Text>
              <Text style={[styles.walletPreviewVal, { color: '#34C759' }]}>
                ₦{walletPreview?.balance !== undefined ? walletPreview.balance.toFixed(2) : '---'}
              </Text>
            </View>
            <View style={[styles.walletPreviewDivider, { backgroundColor: theme.border }]} />
            <View style={styles.walletPreviewStat}>
              <Text style={styles.walletPreviewLabel}>Pending Hold</Text>
              <Text style={[styles.walletPreviewVal, { color: '#FF9500' }]}>
                ₦{walletPreview?.pendingBalance !== undefined ? walletPreview.pendingBalance.toFixed(2) : '---'}
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      )}

      {/* Handyman Earnings Analytics Card */}
      {profile.role === 'HANDYMAN' && (
        <View style={[styles.analyticsCard, { borderColor: theme.border }]}>
          <View style={styles.analyticsHeader}>
            <Text style={styles.cardTitle}>📊 Earnings Analytics</Text>
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
        <View style={[styles.card, { borderColor: theme.border }]}>
          <Text style={styles.cardTitle}>Vehicle Registration</Text>
          <Text style={styles.label}>Vehicle Type:</Text>
          <Text style={styles.valueText}>{profile.vehicleType || 'Not Registered'}</Text>
          <Text style={styles.label}>License Plate:</Text>
          <Text style={styles.valueText}>{profile.licensePlate || 'Not Registered'}</Text>
        </View>
      )}

      {/* Location / GPS Settings Card */}
      <View style={[styles.card, { borderColor: theme.border }]}>
        <Text style={styles.cardTitle}>GPS Location Details</Text>
        <Text style={styles.label}>Home Base Address:</Text>
        <Text style={styles.valueText}>{profile.address || 'No address set'}</Text>
        
        {hasCoordinates ? (
          <View style={[styles.coordinatesRow, { backgroundColor: theme.background }]}>
            <Text style={styles.coordinatesLabel}>
              Latitude: <Text style={[styles.coordinatesVal, { color: theme.primary }]}>{profile.latitude.toFixed(6)}</Text>
            </Text>
            <Text style={styles.coordinatesLabel}>
              Longitude: <Text style={[styles.coordinatesVal, { color: theme.primary }]}>{profile.longitude.toFixed(6)}</Text>
            </Text>
          </View>
        ) : (
          <Text style={styles.subLabel}>Set your location address during sign-up to enable distance matchmaking.</Text>
        )}
      </View>

      {/* Navigation Options List */}
      <View style={[styles.section, { borderColor: theme.border }]}>
        {profile.role === 'VENDOR' ? (
          <TouchableOpacity 
            style={[styles.menuItem, { borderBottomColor: theme.border }]} 
            onPress={() => navigation.navigate('History', { type: 'orders', role: profile.role })}
          >
            <Text style={styles.menuItemText}>Product Sales Activity</Text>
          </TouchableOpacity>
        ) : profile.role === 'RIDER' ? (
          <TouchableOpacity 
            style={[styles.menuItem, { borderBottomColor: theme.border }]} 
            onPress={() => navigation.navigate('History', { type: 'orders', role: profile.role })}
          >
            <Text style={styles.menuItemText}>Deliveries / Dispatches</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity 
            style={[styles.menuItem, { borderBottomColor: theme.border }]} 
            onPress={() => navigation.navigate('History', { type: 'orders', role: profile.role })}
          >
            <Text style={styles.menuItemText}>Order History</Text>
          </TouchableOpacity>
        )}

        {profile.role !== 'VENDOR' && profile.role !== 'RIDER' && (
          <TouchableOpacity 
            style={[styles.menuItem, { borderBottomColor: theme.border }]} 
            onPress={() => navigation.navigate('History', { type: 'bookings', role: profile.role })}
          >
            <Text style={styles.menuItemText}>
              {profile.role === 'HANDYMAN' ? 'Assigned Jobs / Tickets' : 'Booking History'}
            </Text>
          </TouchableOpacity>
        )}

        {(profile.role === 'VENDOR' || profile.role === 'HANDYMAN' || profile.role === 'RIDER') && (
          <TouchableOpacity 
            style={[styles.menuItem, { borderBottomColor: theme.border }]} 
            onPress={() => navigation.navigate('Wallet')}
          >
            <Text style={styles.menuItemText}>💳 Virtual Platform Wallet</Text>
          </TouchableOpacity>
        )}

        {(profile.role === 'VENDOR' || profile.role === 'HANDYMAN' || profile.role === 'RIDER') && (
          <TouchableOpacity 
            style={[styles.menuItem, { borderBottomColor: theme.border }]} 
            onPress={() => navigation.navigate('KYCStatus')}
          >
            <Text style={styles.menuItemText}>🛡️ Identity Verification Status</Text>
          </TouchableOpacity>
        )}

        {(profile.role === 'ADMIN' || profile.role === 'VENDOR') && (
          <TouchableOpacity 
            style={[styles.menuItem, { borderBottomColor: theme.border }]} 
            onPress={() => navigation.navigate('Admin')}
          >
            <Text style={[styles.menuItemText, { color: theme.primary }]}>
              {profile.role === 'ADMIN' ? 'Admin Control Panel' : 'Manage Catalog'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <TouchableOpacity style={styles.logoutButton} onPress={logout}>
        <Text style={styles.logoutButtonText}>Log Out</Text>
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
    marginBottom: 28,
    marginTop: 12,
  },
  avatarPlaceholder: {
    width: 90,
    height: 90,
    borderRadius: 45,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 3,
  },
  avatarText: {
    fontSize: 36,
    color: '#FFF',
    fontWeight: '800',
  },
  name: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1C1C1E',
    marginBottom: 4,
  },
  email: {
    fontSize: 14,
    color: '#8E8E93',
    marginBottom: 12,
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
  trackingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  trackingTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  trackingDesc: {
    fontSize: 13,
    color: '#8E8E93',
    lineHeight: 18,
  },
  card: {
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
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1C1C1E',
    marginBottom: 16,
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
    backgroundColor: '#FFF',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 24,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 2,
  },
  menuItem: {
    padding: 18,
    borderBottomWidth: 1,
    backgroundColor: '#FFF',
  },
  menuItemText: {
    fontSize: 15,
    color: '#1C1C1E',
    fontWeight: '600',
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
  walletPreviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  walletPreviewTitle: {
    fontSize: 16,
    fontWeight: '800',
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
    color: '#8E8E93',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  walletPreviewVal: {
    fontSize: 18,
    fontWeight: '900',
  },
  walletPreviewDivider: {
    width: 1,
    height: 36,
    marginHorizontal: 16,
  },
});
