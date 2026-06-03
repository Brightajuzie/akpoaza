import React, { useContext, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { AuthContext } from '../context/AuthContext';
import { SettingsContext } from '../context/SettingsContext';

export default function KYCStatusScreen({ navigation }: any) {
  const { theme } = useContext(SettingsContext);
  const { refreshUser, userInfo } = useContext(AuthContext);
  const [refreshing, setRefreshing] = useState(false);

  const fetchLatestStatus = async () => {
    setRefreshing(true);
    await refreshUser();
    setRefreshing(false);
  };

  useEffect(() => {
    fetchLatestStatus();
  }, []);

  const getStatusDetails = () => {
    const status = userInfo?.verificationStatus || 'UNVERIFIED';

    switch (status) {
      case 'UNVERIFIED':
        return {
          icon: '👤',
          title: 'Verification Required',
          description: 'To list products, build services, or accept job dispatch requests, you must verify your identity.',
          color: theme.primary,
          showAction: true,
          actionText: 'Start Verification',
          onAction: () => navigation.navigate('KYCVerification'),
        };
      case 'PENDING_REVIEW':
        return {
          icon: '🔍',
          title: 'Under Review',
          description: 'Your identity details, selfie scan, and documents are currently being checked. This usually takes under 24 hours.',
          color: '#FF9500',
          showAction: false,
        };
      case 'VERIFIED':
        return {
          icon: '✅',
          title: 'Identity Verified',
          description: 'Congratulations! Your profile has been successfully verified. You have full access to merchant and handyman portals.',
          color: '#34C759',
          showAction: true,
          actionText: 'Go to Dashboard',
          onAction: () => navigation.navigate('Main', { screen: 'ProfileTab' }),
        };
      case 'REJECTED':
        return {
          icon: '❌',
          title: 'Verification Failed',
          description: userInfo?.rejectionReason || 'Your submitted document could not be matched against database records.',
          color: '#FF3B30',
          showAction: true,
          actionText: 'Re-submit Details',
          onAction: () => navigation.navigate('KYCVerification'),
        };
      default:
        return {
          icon: '❓',
          title: 'Unknown Status',
          description: 'Please contact support if you are seeing this error.',
          color: theme.lightText,
          showAction: false,
        };
    }
  };

  const statusInfo = getStatusDetails();

  return (
    <ScrollView 
      style={[styles.container, { backgroundColor: theme.background }]} 
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.card, { borderColor: theme.border }]}>
        <View style={[styles.iconCircle, { backgroundColor: statusInfo.color + '15' }]}>
          <Text style={[styles.iconText, { color: statusInfo.color }]}>
            {statusInfo.icon}
          </Text>
        </View>

        <Text style={[styles.statusTitle, { color: theme.text }]}>
          {statusInfo.title}
        </Text>
        
        <Text style={[styles.statusDesc, { color: theme.lightText }]}>
          {statusInfo.description}
        </Text>

        {statusInfo.showAction && (
          <TouchableOpacity 
            style={[styles.actionBtn, { backgroundColor: theme.primary }]}
            onPress={statusInfo.onAction}
          >
            <Text style={styles.actionBtnText}>{statusInfo.actionText}</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity 
          style={[styles.refreshBtn, { borderColor: theme.border }]} 
          onPress={fetchLatestStatus}
          disabled={refreshing}
        >
          {refreshing ? (
            <ActivityIndicator size="small" color={theme.primary} />
          ) : (
            <Text style={[styles.refreshBtnText, { color: theme.text }]}>Refresh Status</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 24,
    justifyContent: 'center',
    flexGrow: 1,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    borderWidth: 1,
    padding: 32,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.04,
    shadowRadius: 16,
    elevation: 3,
  },
  iconCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  iconText: {
    fontSize: 40,
  },
  statusTitle: {
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 12,
    textAlign: 'center',
  },
  statusDesc: {
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 32,
    paddingHorizontal: 12,
  },
  actionBtn: {
    height: 52,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    marginBottom: 12,
  },
  actionBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  refreshBtn: {
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  refreshBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
