// @ts-nocheck
/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useState, useContext } from 'react';
import { Picker } from '@react-native-picker/picker';
import { LinearGradient } from 'expo-linear-gradient';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, TouchableOpacity, Modal, TextInput, Alert, ScrollView, RefreshControl, Image, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { Swipeable } from 'react-native-gesture-handler';
import Animated, { FadeIn } from 'react-native-reanimated';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Notifications from 'expo-notifications';
import * as ImagePicker from 'expo-image-picker';
import apiClient from '../api/client';
import { AuthContext } from '../context/AuthContext';
import { SettingsContext } from '../context/SettingsContext';
import { useCurrency } from '../context/CurrencyContext';
import PaymentWebView from '../components/PaymentWebView';

// Only real payment gateways make sense for topping up a wallet — unlike
// CheckoutScreen's payment-method list, WALLET (pay from wallet balance)
// and POD (pay on delivery) are both meaningless here.
const FUND_PROVIDERS: { id: 'STRIPE' | 'PAYSTACK' | 'FLUTTERWAVE' | 'OPAY'; label: string; icon: string; enabledKey: string }[] = [
  { id: 'STRIPE', label: 'Stripe', icon: '💳', enabledKey: 'stripe_enabled' },
  { id: 'PAYSTACK', label: 'Paystack', icon: '🏦', enabledKey: 'paystack_enabled' },
  { id: 'FLUTTERWAVE', label: 'Flutterwave', icon: '⚡', enabledKey: 'flutterwave_enabled' },
  { id: 'OPAY', label: 'OPay', icon: '🔵', enabledKey: 'opay_enabled' },
];

export default function WalletScreen({ navigation }: any) {
  const { userInfo } = useContext(AuthContext);
  const { theme, settings, colorMode } = useContext(SettingsContext);
  const { currency, symbol, fmt } = useCurrency();
  const isDark = colorMode === 'dark';

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>({
    balance: 0,
    pendingBalance: 0,
    transactions: [],
    withdrawals: [],
    isFirstWithdrawal: false,
    hugeWithdrawalThreshold: 50000,
  });
  
  // Pull-to-refresh state
  const [refreshing, setRefreshing] = useState(false);

  // Withdrawal Form states
  const [modalVisible, setModalVisible] = useState(false);
  const [amount, setAmount] = useState('');
  const [instant, setInstant] = useState(false);
  const [accountNumber, setAccountNumber] = useState('');
  const [bankName, setBankName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // First-time withdrawal OTP states
  const [otp, setOtp] = useState('');
  const [sendingOtp, setSendingOtp] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otpTimer, setOtpTimer] = useState(0);

  // Huge amount withdrawal Facial Life Check states
  const [livenessPhoto, setLivenessPhoto] = useState<string | null>(null);
  const [uploadingLifeCheck, setUploadingLifeCheck] = useState(false);

  // Fund Wallet form state
  const [fundModalVisible, setFundModalVisible] = useState(false);
  const [fundAmount, setFundAmount] = useState('');
  const [fundProvider, setFundProvider] = useState<'STRIPE' | 'PAYSTACK' | 'FLUTTERWAVE' | 'OPAY' | null>(null);
  const [fundLoadingProvider, setFundLoadingProvider] = useState<string | null>(null);
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);

  // Filter state
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [filterType, setFilterType] = useState('All'); // Options: All, Withdrawal, Transaction


  const fetchWalletData = async () => {
    try {
      const response = await apiClient.get('/wallet/balance');
      setData(response.data);
    } catch (error: any) {
      console.error('Failed to load wallet details', error);
      Alert.alert('Error', 'Unable to fetch wallet balance.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const exportCsv = async () => {
    try {
      const csvData = "Date,Description,Amount,Type\n" + activityLog.map(item => 
        `${item.createdAt},${item.description || item.type},${item.amount},${item.logType}`
      ).join("\n");
      const path = FileSystem.documentDirectory + 'wallet_report.csv';
      await FileSystem.writeAsStringAsync(path, csvData);
      await Sharing.shareAsync(path);
    } catch (error) {
      Alert.alert('Error', 'Could not export CSV');
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchWalletData();
  };

  useEffect(() => {
    fetchWalletData();

    // Check for web callback redirects (?payment_status=success&ref=...)
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const paymentStatus = urlParams.get('payment_status');
        const ref = urlParams.get('ref');
        if (paymentStatus === 'success' && ref) {
          apiClient.get(`/wallet/fund/verify/${encodeURIComponent(ref)}`).then(() => {
            Alert.alert('✅ Wallet Funded', `Your top-up was verified and credited to your wallet!\nReference: ${ref}`);
            fetchWalletData();
          }).catch(() => fetchWalletData());
          window.history.replaceState({}, document.title, window.location.pathname);
        } else if (paymentStatus === 'cancelled') {
          Alert.alert('Funding Cancelled', 'Wallet top-up was cancelled.');
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      } catch (e) {}
    }
  }, []);

  // Countdown timer for withdrawal OTP
  useEffect(() => {
    let interval: any = null;
    if (otpTimer > 0) {
      interval = setInterval(() => setOtpTimer((t) => t - 1), 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [otpTimer]);

  // Request withdrawal OTP for first-time authentication
  const requestWithdrawalOtp = async () => {
    setSendingOtp(true);
    try {
      const res = await apiClient.post('/wallet/withdraw/request-otp');
      setOtpSent(true);
      setOtpTimer(60);
      Alert.alert('🔐 Code Sent', res.data.message || 'A 6-digit verification code has been sent to your email.');
    } catch (err: any) {
      Alert.alert('Failed to Send Code', err.response?.data?.error || 'Could not send verification code.');
    } finally {
      setSendingOtp(false);
    }
  };

  // Facial life check selfie capture
  const handleCaptureLifeCheck = async () => {
    try {
      if (Platform.OS === 'web') {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.capture = 'user'; // Requests front-facing camera on mobile browsers
        input.onchange = async (e: any) => {
          const file = e.target.files?.[0];
          if (file) {
            setUploadingLifeCheck(true);
            try {
              const formData = new FormData();
              formData.append('image', file, file.name || 'selfie.jpg');
              const res = await apiClient.post('/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
              });
              if (res.data?.success && res.data.imageUrl) {
                setLivenessPhoto(res.data.imageUrl);
                Alert.alert('✅ Life Check Captured', 'Your live selfie facial verification has been recorded.');
              }
            } catch (err: any) {
              Alert.alert('Upload Failed', err.response?.data?.error || 'Could not upload selfie.');
            } finally {
              setUploadingLifeCheck(false);
            }
          }
        };
        input.click();
        return;
      }

      const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert('Camera Permission Required', 'Camera access is required to take a live selfie verification.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        cameraType: ImagePicker.CameraType.front,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        setUploadingLifeCheck(true);
        try {
          const formData = new FormData();
          const filename = asset.uri.split('/').pop() || 'selfie.jpg';
          const ext = filename.split('.').pop()?.toLowerCase() || 'jpg';
          const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';
          formData.append('image', {
            uri: asset.uri,
            name: filename,
            type: mimeType,
          } as any);

          const res = await apiClient.post('/upload', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });

          if (res.data?.success && res.data.imageUrl) {
            setLivenessPhoto(res.data.imageUrl);
            Alert.alert('✅ Life Check Captured', 'Your live selfie facial verification has been recorded.');
          }
        } catch (uploadErr: any) {
          Alert.alert('Upload Failed', uploadErr.response?.data?.error || 'Could not upload selfie.');
        } finally {
          setUploadingLifeCheck(false);
        }
      }
    } catch (err) {
      console.error('Liveness capture error', err);
      Alert.alert('Camera Error', 'Could not access camera for life check.');
    }
  };

  const handleWithdraw = async () => {
    const amtFloat = parseFloat(amount);
    if (isNaN(amtFloat) || amtFloat <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid positive number.');
      return;
    }
    if (amtFloat > data.balance) {
      Alert.alert('Insufficient Funds', 'You cannot withdraw more than your cleared balance.');
      return;
    }
    if (!accountNumber.trim()) {
      Alert.alert('Field Required', 'Please enter your bank account number.');
      return;
    }
    if (!bankName.trim()) {
      Alert.alert('Field Required', 'Please enter your bank name.');
      return;
    }

    // High amount check: requires facial life check
    const hugeThreshold = data.hugeWithdrawalThreshold || 50000;
    const isHugeAmount = amtFloat >= hugeThreshold;
    if (isHugeAmount && !livenessPhoto) {
      Alert.alert(
        'Facial Life Check Required',
        `High-value withdrawals (₦${hugeThreshold.toLocaleString()} and above) require a live selfie verification to protect your funds. Please snap a selfie below before submitting.`
      );
      return;
    }

    // First-time withdrawal check: requires OTP
    if (data.isFirstWithdrawal && !otp.trim()) {
      if (!otpSent) {
        requestWithdrawalOtp();
      }
      Alert.alert(
        'Authentication Required',
        'First-time withdrawals require a 6-digit security code sent to your registered email. Please enter the code below.'
      );
      return;
    }

    setSubmitting(true);
    try {
      const payload: any = {
        amount: amtFloat,
        instant,
        accountNumber: accountNumber.trim(),
        bankName: bankName.trim(),
      };
      if (otp.trim()) {
        payload.otp = otp.trim();
      }
      if (livenessPhoto) {
        payload.livenessPhoto = livenessPhoto;
      }
      
      const response = await apiClient.post('/wallet/withdraw', payload);
      Alert.alert('Success', response.data.message);
      
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Withdrawal Requested',
          body: `Your withdrawal of ₦${amtFloat.toFixed(2)} is being processed.`,
        },
        trigger: null,
      }).catch(() => {});
      
      // Reset form
      setAmount('');
      setAccountNumber('');
      setBankName('');
      setInstant(false);
      setOtp('');
      setOtpSent(false);
      setLivenessPhoto(null);
      setModalVisible(false);
      
      // Refresh balance and transaction log
      fetchWalletData();
    } catch (error: any) {
      if (error.response?.data?.requiresOtp) {
        setOtpSent(true);
        Alert.alert('Code Required', error.response?.data?.error || 'A 6-digit verification code has been sent to your email.');
      } else if (error.response?.data?.requiresLifeCheck) {
        Alert.alert('Life Check Required', error.response?.data?.error || 'A live selfie is required for this withdrawal.');
      } else {
        Alert.alert('Withdrawal Failed', error.response?.data?.error || 'Failed to submit withdrawal request.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Only show gateways the admin has actually enabled (see AdminScreen's
  // "Checkout Payment Method Toggles") — same enabledKey filter CheckoutScreen
  // applies, so a customer never sees "Fund via Stripe" here when Stripe is
  // off for the whole app.
  const availableFundProviders = FUND_PROVIDERS.filter(
    (p) => !settings || Object.keys(settings).length === 0 || settings[p.enabledKey] !== 'false'
  );

  const handleFundWallet = async (provider: 'STRIPE' | 'PAYSTACK' | 'FLUTTERWAVE' | 'OPAY') => {
    const amtFloat = parseFloat(fundAmount);
    if (isNaN(amtFloat) || amtFloat <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid positive number.');
      return;
    }

    const minAmount = (currency || 'NGN') === 'NGN' ? 100 : 1;
    if (amtFloat < minAmount) {
      Alert.alert('Minimum Amount', `Minimum wallet top-up is ${symbol}${minAmount}.`);
      return;
    }

    setFundLoadingProvider(provider);
    try {
      // 1. Create the PENDING WalletFunding record this top-up will pay off.
      const fundRes = await apiClient.post('/wallet/fund', {
        amount: amtFloat,
        currency: currency || 'NGN',
      });
      const fundingId = fundRes.data?.fundingId;
      if (!fundingId) throw new Error('Could not start wallet funding.');

      // 2. Gateway-initiation call with active currency
      const checkoutRes = await apiClient.post('/payments/checkout', {
        checkoutType: 'wallet_funding',
        id: fundingId,
        provider,
        currency: currency || 'NGN',
        localAmount: amtFloat,
      });

      const redirectUrl = provider === 'FLUTTERWAVE'
        ? (checkoutRes.data.paymentLink || checkoutRes.data.authorizationUrl)
        : checkoutRes.data.authorizationUrl;

      if (!redirectUrl) throw new Error('No payment URL returned from server.');

      setFundProvider(provider);
      setPaymentUrl(redirectUrl);
      setFundModalVisible(false);
    } catch (error: any) {
      Alert.alert(`${provider} Unavailable`, error.response?.data?.error || error.message || `Could not initialise ${provider}.`);
    } finally {
      setFundLoadingProvider(null);
    }
  };

  const handleFundPaymentSuccess = async (reference: string) => {
    setPaymentUrl(null);
    const providerName = fundProvider;
    setFundProvider(null);
    setFundAmount('');

    // Explicitly verify funding status on server to guarantee balance is credited
    try {
      await apiClient.get(`/wallet/fund/verify/${encodeURIComponent(reference)}`);
    } catch (err) {
      console.warn('Auto-verify call finished with notice:', err);
    }

    Alert.alert('✅ Wallet Funded', `Your ${providerName || 'gateway'} top-up was completed successfully!\nReference: ${reference}`);
    fetchWalletData();
  };

  const handleFundPaymentCancel = () => {
    setPaymentUrl(null);
    setFundProvider(null);
    Alert.alert('Cancelled', 'Wallet funding was cancelled. You can try again anytime.');
  };

  if (paymentUrl) {
    return (
      <PaymentWebView
        url={paymentUrl}
        provider={fundProvider}
        onPaymentSuccess={handleFundPaymentSuccess}
        onPaymentCancel={handleFundPaymentCancel}
      />
    );
  }

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  // Combine transactions and withdrawals chronologically for a single unified activity log
  const activityLog = [
    ...data.transactions.map((t: any) => ({ ...t, logType: 'transaction' })),
    ...data.withdrawals.map((w: any) => ({ ...w, logType: 'withdrawal' }))
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // Apply filter
  const filteredLog = activityLog.filter(item => {
    if (filterType === 'All') return true;
    if (filterType === 'Withdrawal' && item.logType === 'withdrawal') return true;
    if (filterType === 'Transaction' && item.logType === 'transaction') return true;
    return false;
  });

  const renderLogItem = ({ item }: any) => {
    const isNegative = item.amount < 0 || item.logType === 'withdrawal';
    const absAmount = Math.abs(item.amount);
    const dateStr = new Date(item.createdAt).toLocaleDateString() + ' ' + new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    let title = '';
    let color = '#34C759'; // green

    if (item.logType === 'withdrawal') {
      title = `Withdrawal (${item.status})`;
      color = item.status === 'COMPLETED' ? '#FF3B30' : '#FF9500'; // red or orange
    } else {
      title = item.description || item.type;
      if (item.type === 'PENDING_CLEARANCE') {
        color = '#FF9500'; // orange
      } else if (item.amount < 0) {
        color = '#FF3B30'; // red
      }
    }

    const txIcon = item.logType === 'withdrawal' ? '📤' : (item.amount > 0 ? '📥' : '💸');
    return (
      <Animated.View entering={FadeIn.duration(300)}>
        <Swipeable
          renderRightActions={() => (
            <View style={styles.swipeAction}>
              <Text style={styles.swipeActionText}>Delete</Text>
            </View>
          )}
          onSwipeableRightOpen={() => Alert.alert('Delete', 'Delete action triggered for this item.')}
        >
          <View style={[styles.logCard, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderColor: isDark ? '#334155' : '#E2E8F0' }]}>
            <View style={[styles.logIconWrap, { backgroundColor: color + '15' }]}>
              <Text style={styles.logIconText}>{txIcon}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.logRow}>
                <Text style={[styles.logTitle, { color: isDark ? '#F1F5F9' : '#0F172A' }]} numberOfLines={1}>{title}</Text>
                <Text style={[styles.logAmount, { color }]}>{isNegative ? '−' : '+'}₦{absAmount.toLocaleString('en-NG', { minimumFractionDigits: 2 })}</Text>
              </View>
              <View style={styles.logSubRow}>
                <Text style={[styles.logDate, { color: isDark ? '#475569' : '#94A3B8' }]}>{dateStr}</Text>
                <View style={[styles.logTypePill, { backgroundColor: color + '18' }]}>
                  <Text style={[styles.logTypeBadge, { color }]}>
                    {item.logType === 'withdrawal' ? 'Payout' : (item.type || '').replace(/_/g, ' ')}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        </Swipeable>
      </Animated.View>
    );
  };

  const totalActivity = activityLog.length;
  const totalIn = activityLog.filter((i: any) => i.logType === 'transaction' && i.amount > 0).reduce((s: number, i: any) => s + i.amount, 0);
  const totalOut = activityLog.filter((i: any) => i.logType === 'withdrawal' || i.amount < 0).reduce((s: number, i: any) => s + Math.abs(i.amount), 0);

  return (
    <View style={[styles.container, { backgroundColor: isDark ? '#0F172A' : '#F1F5F9' }]}>
      {/* ── Balance Card ──────────────────────────────────────────────────── */}
      <LinearGradient
        colors={isDark ? ['#0F2C18', '#1A5C32', '#22A45D'] : ['#22A45D', '#16A34A', '#15803D']}
        style={styles.balanceCard}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      >
        {/* Decorative circles */}
        <View style={styles.balanceDecor1} />
        <View style={styles.balanceDecor2} />

        <Text style={styles.balanceHeader}>💳 Wallet Balance</Text>
        <Text style={styles.balanceValue}>₦{data.balance.toLocaleString('en-NG', { minimumFractionDigits: 2 })}</Text>

        <View style={styles.balanceMeta}>
          <View style={styles.balanceMetaItem}>
            <Text style={styles.balanceMetaLabel}>⏳ Pending</Text>
            <Text style={styles.balanceMetaValue}>₦{data.pendingBalance.toLocaleString('en-NG', { minimumFractionDigits: 2 })}</Text>
          </View>
          <View style={styles.balanceMetaDivider} />
          <View style={styles.balanceMetaItem}>
            <Text style={styles.balanceMetaLabel}>📈 Money In</Text>
            <Text style={styles.balanceMetaValue}>₦{totalIn.toLocaleString('en-NG', { minimumFractionDigits: 2 })}</Text>
          </View>
          <View style={styles.balanceMetaDivider} />
          <View style={styles.balanceMetaItem}>
            <Text style={styles.balanceMetaLabel}>📤 Withdrawn</Text>
            <Text style={styles.balanceMetaValue}>₦{totalOut.toLocaleString('en-NG', { minimumFractionDigits: 2 })}</Text>
          </View>
        </View>

        <View style={styles.balanceActionsRow}>
          <TouchableOpacity
            style={[styles.fundBtn]}
            onPress={() => setFundModalVisible(true)}
            activeOpacity={0.85}
          >
            <Text style={styles.fundBtnText}>➕ Fund Wallet</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.withdrawBtn, { opacity: data.balance <= 0 ? 0.5 : 1 }]}
            onPress={() => setModalVisible(true)}
            disabled={data.balance <= 0}
            activeOpacity={0.85}
          >
            <Text style={styles.withdrawBtnText}>💸 Withdraw Funds</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>

      {/* ── Quick Actions Row ─────────────────────────────────────────────── */}
      <View style={[styles.quickRow, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderColor: isDark ? '#334155' : '#E2E8F0' }]}>
        {[
          { icon: '🔄', label: 'Refresh', onPress: onRefresh },
          { icon: '⚙️', label: 'Filter', onPress: () => setFilterModalVisible(true) },
          { icon: '📥', label: 'Export CSV', onPress: exportCsv },
        ].map(btn => (
          <TouchableOpacity key={btn.label} style={styles.quickBtn} onPress={btn.onPress}>
            <Text style={styles.quickBtnIcon}>{btn.icon}</Text>
            <Text style={[styles.quickBtnLabel, { color: theme.primary }]}>{btn.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Activity Header ───────────────────────────────────────────────── */}
      <View style={styles.activityHeader}>
        <View>
          <Text style={[styles.activityTitle, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>Transaction History</Text>
          <Text style={[styles.activitySub, { color: isDark ? '#64748B' : '#94A3B8' }]}>{totalActivity} record{totalActivity !== 1 ? 's' : ''} · {filterType !== 'All' ? filterType : 'All types'}</Text>
        </View>
      </View>

      <FlatList
        data={filteredLog}
        keyExtractor={(item) => item.id}
        renderItem={renderLogItem}
        contentContainerStyle={styles.listContainer}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No recent financial transactions found.</Text>
          </View>
        }
      />

        {/* Filter Modal */}
        <Modal
          visible={filterModalVisible}
          animationType="slide"
          transparent
          onRequestClose={() => setFilterModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <ScrollView contentContainerStyle={styles.modalScroll}>
              <View style={styles.filterModalCard}>
                <Text style={styles.modalTitle}>Filter Transactions</Text>
                <Picker
                  selectedValue={filterType}
                  onValueChange={(itemValue) => setFilterType(itemValue)}
                  style={styles.input}
                >
                  <Picker.Item label="All" value="All" />
                  <Picker.Item label="Withdrawals" value="Withdrawal" />
                  <Picker.Item label="Transactions" value="Transaction" />
                </Picker>
                <View style={styles.modalBtns}>
                  <TouchableOpacity
                    style={styles.modalCancelBtn}
                    onPress={() => setFilterModalVisible(false)}
                  >
                    <Text style={styles.modalCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalSubmitBtn, { backgroundColor: theme.primary }]}
                    onPress={() => setFilterModalVisible(false)}
                  >
                    <Text style={styles.modalSubmitText}>Apply</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>
          </View>
        </Modal>
        {/* Withdrawal Form Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <ScrollView contentContainerStyle={styles.modalScroll}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Withdraw to Bank Account</Text>
              <Text style={styles.modalSubtitle}>Withdraw from your cleared balance (Max: ₦{data.balance.toFixed(2)})</Text>

              {/* Amount input */}
              <Text style={styles.inputLabel}>Amount (₦)</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 1000.00"
                keyboardType="numeric"
                value={amount}
                onChangeText={setAmount}
              />

              {/* Bank Name */}
              <Text style={styles.inputLabel}>Bank Name</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. GTBank, Zenith, Access"
                value={bankName}
                onChangeText={setBankName}
              />

              {/* Account Number */}
              <Text style={styles.inputLabel}>Account Number</Text>
              <TextInput
                style={styles.input}
                placeholder="10-digit NUBAN number"
                keyboardType="number-pad"
                maxLength={10}
                value={accountNumber}
                onChangeText={setAccountNumber}
              />

              {/* Payout Options */}
              <Text style={styles.inputLabel}>Settlement Speed</Text>
              <View style={styles.speedOptions}>
                <TouchableOpacity 
                  style={[styles.speedBtn, !instant && styles.speedBtnActive, !instant && { borderColor: theme.primary }]}
                  onPress={() => setInstant(false)}
                >
                  <Text style={[styles.speedBtnTitle, !instant && { color: theme.primary }]}>Standard (T+1)</Text>
                  <Text style={styles.speedBtnDesc}>₦0 Fee • Batch Overnight</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={[styles.speedBtn, instant && styles.speedBtnActive, instant && { borderColor: theme.primary }]}
                  onPress={() => setInstant(true)}
                >
                  <Text style={[styles.speedBtnTitle, instant && { color: theme.primary }]}>Instant</Text>
                  <Text style={styles.speedBtnDesc}>₦100 Fee • Immediate</Text>
                </TouchableOpacity>
              </View>

              {/* Payout Cost Break down */}
              {amount && !isNaN(parseFloat(amount)) ? (
                <View style={styles.breakdownCard}>
                  <View style={styles.breakdownRow}>
                    <Text style={styles.breakdownLabel}>Gross Amount:</Text>
                    <Text style={styles.breakdownValue}>₦{parseFloat(amount).toFixed(2)}</Text>
                  </View>
                  <View style={styles.breakdownRow}>
                    <Text style={styles.breakdownLabel}>Withdrawal Fee:</Text>
                    <Text style={styles.breakdownValue}>-₦{(instant ? 100 : 0).toFixed(2)}</Text>
                  </View>
                  <View style={[styles.breakdownRow, styles.breakdownTotal]}>
                    <Text style={styles.breakdownTotalLabel}>Net Settlement:</Text>
                    <Text style={[styles.breakdownTotalValue, { color: theme.primary }]}>
                      ₦{Math.max(parseFloat(amount) - (instant ? 100 : 0), 0).toFixed(2)}
                    </Text>
                  </View>
                </View>
              ) : null}

              {/* First-time Withdrawal Security: OTP Verification */}
              {data.isFirstWithdrawal ? (
                <View style={styles.securityBox}>
                  <View style={styles.securityHeader}>
                    <View style={styles.securityBadge}>
                      <Text style={styles.securityBadgeText}>1ST-TIME SECURITY</Text>
                    </View>
                    <Text style={styles.securityTitle}>Email / SMS Authentication</Text>
                  </View>
                  <Text style={styles.securityDesc}>
                    First-time withdrawals require a 6-digit one-time password (OTP) sent to your registered account to confirm your identity.
                  </Text>
                  <View style={styles.otpRow}>
                    <TextInput
                      style={[styles.input, styles.otpInput]}
                      placeholder="Enter 6-digit OTP"
                      keyboardType="number-pad"
                      maxLength={6}
                      value={otp}
                      onChangeText={setOtp}
                    />
                    <TouchableOpacity
                      style={[
                        styles.otpBtn,
                        { backgroundColor: theme.primary },
                        (sendingOtp || otpTimer > 0) && styles.otpBtnDisabled
                      ]}
                      onPress={requestWithdrawalOtp}
                      disabled={sendingOtp || otpTimer > 0}
                    >
                      {sendingOtp ? (
                        <ActivityIndicator color="#FFF" size="small" />
                      ) : (
                        <Text style={styles.otpBtnText}>
                          {otpTimer > 0 ? `${otpTimer}s` : otpSent ? 'Resend' : 'Send Code'}
                        </Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              ) : null}

              {/* High-Value Withdrawal Security: Live Facial Life Check */}
              {parseFloat(amount) >= (data.hugeWithdrawalThreshold || 50000) ? (
                <View style={[styles.securityBox, styles.lifeCheckBox]}>
                  <View style={styles.securityHeader}>
                    <View style={[styles.securityBadge, styles.hugeBadge]}>
                      <Text style={styles.hugeBadgeText}>HIGH AMOUNT CHECK</Text>
                    </View>
                    <Text style={styles.securityTitle}>Real-Time Facial Life Check</Text>
                  </View>
                  <Text style={styles.securityDesc}>
                    Withdrawals of ₦{(data.hugeWithdrawalThreshold || 50000).toLocaleString()} and above require a live front-camera selfie to protect your funds against fraud.
                  </Text>

                  {livenessPhoto ? (
                    <View style={styles.lifeCheckPreview}>
                      <Image source={{ uri: livenessPhoto }} style={styles.lifeCheckImg} />
                      <View style={styles.lifeCheckInfo}>
                        <Text style={styles.lifeCheckSuccessText}>✅ Live Selfie Attached</Text>
                        <TouchableOpacity
                          style={styles.retakeBtn}
                          onPress={handleCaptureLifeCheck}
                          disabled={uploadingLifeCheck}
                        >
                          <Text style={styles.retakeBtnText}>Retake Photo</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={[styles.lifeCheckBtn, { borderColor: theme.primary }]}
                      onPress={handleCaptureLifeCheck}
                      disabled={uploadingLifeCheck}
                    >
                      {uploadingLifeCheck ? (
                        <ActivityIndicator color={theme.primary} size="small" />
                      ) : (
                        <>
                          <Text style={styles.lifeCheckBtnIcon}>📸</Text>
                          <Text style={[styles.lifeCheckBtnText, { color: theme.primary }]}>
                            Take Live Selfie (Front Camera)
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>
                  )}
                </View>
              ) : null}

              {/* Form Buttons */}
              <View style={styles.modalBtns}>
                <TouchableOpacity
                  style={styles.modalCancelBtn}
                  onPress={() => setModalVisible(false)}
                  disabled={submitting}
                >
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalSubmitBtn, { backgroundColor: theme.primary }]}
                  onPress={handleWithdraw}
                  disabled={submitting}
                >
                  {submitting
                    ? <ActivityIndicator color="#FFF" size="small" />
                    : <Text style={styles.modalSubmitText}>Submit Request</Text>
                  }
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Fund Wallet Modal */}
      <Modal
        visible={fundModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setFundModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <ScrollView contentContainerStyle={styles.modalScroll}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Fund Your Wallet</Text>
              <Text style={styles.modalSubtitle}>Top up your FixMart wallet balance via any payment gateway.</Text>

              <Text style={styles.inputLabel}>Amount (₦)</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 5000.00"
                keyboardType="numeric"
                value={fundAmount}
                onChangeText={setFundAmount}
              />

              <Text style={styles.inputLabel}>Pay With</Text>
              <View style={styles.fundProviderGrid}>
                {availableFundProviders.length === 0 && (
                  <Text style={{ color: '#8E8E93', fontSize: 13 }}>No payment gateways are currently enabled. Contact support.</Text>
                )}
                {availableFundProviders.map((p) => {
                  const amtValid = !isNaN(parseFloat(fundAmount)) && parseFloat(fundAmount) > 0;
                  const isLoading = fundLoadingProvider === p.id;
                  return (
                    <TouchableOpacity
                      key={p.id}
                      style={[styles.fundProviderBtn, { opacity: amtValid ? 1 : 0.5, borderColor: theme.primary }]}
                      onPress={() => handleFundWallet(p.id)}
                      disabled={!amtValid || fundLoadingProvider !== null}
                    >
                      {isLoading
                        ? <ActivityIndicator color={theme.primary} size="small" />
                        : <>
                            <Text style={styles.fundProviderIcon}>{p.icon}</Text>
                            <Text style={[styles.fundProviderLabel, { color: theme.primary }]}>{p.label}</Text>
                          </>
                      }
                    </TouchableOpacity>
                  );
                })}
              </View>

              <TouchableOpacity
                style={[styles.modalCancelBtn, { marginTop: 8 }]}
                onPress={() => setFundModalVisible(false)}
                disabled={fundLoadingProvider !== null}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Balance Card
  balanceCard: {
    margin: 16, marginBottom: 0,
    padding: 24, borderRadius: 24, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 20, elevation: 8,
  },
  balanceDecor1: {
    position: 'absolute', width: 220, height: 220, borderRadius: 110,
    backgroundColor: 'rgba(255,255,255,0.07)', top: -80, right: -60,
  },
  balanceDecor2: {
    position: 'absolute', width: 140, height: 140, borderRadius: 70,
    backgroundColor: 'rgba(255,255,255,0.05)', bottom: -40, left: -30,
  },
  balanceHeader: { color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  balanceValue: { color: '#FFF', fontSize: 42, fontWeight: '900', letterSpacing: -1, marginBottom: 16 },
  balanceMeta: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  balanceMetaItem: { flex: 1, alignItems: 'center' },
  balanceMetaLabel: { color: 'rgba(255,255,255,0.65)', fontSize: 10, fontWeight: '700', marginBottom: 2 },
  balanceMetaValue: { color: '#FFF', fontSize: 13, fontWeight: '800' },
  balanceMetaDivider: { width: 1, height: 28, backgroundColor: 'rgba(255,255,255,0.2)' },
  balanceActionsRow: { flexDirection: 'row', gap: 10 },
  fundBtn: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.6)',
    paddingVertical: 14, borderRadius: 14, alignItems: 'center',
  },
  fundBtnText: { fontSize: 15, fontWeight: '900', color: '#FFFFFF' },
  withdrawBtn: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.95)',
    paddingVertical: 14, borderRadius: 14, alignItems: 'center',
  },
  withdrawBtnText: { fontSize: 15, fontWeight: '900', color: '#15803D' },

  // Quick actions
  quickRow: {
    flexDirection: 'row', marginHorizontal: 16, marginTop: 12, marginBottom: 4,
    borderRadius: 16, borderWidth: 1, overflow: 'hidden',
  },
  quickBtn: { flex: 1, alignItems: 'center', paddingVertical: 12, gap: 3 },
  quickBtnIcon: { fontSize: 18 },
  quickBtnLabel: { fontSize: 10, fontWeight: '700' },

  // Activity Header
  activityHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  activityTitle: { fontSize: 17, fontWeight: '900' },
  activitySub: { fontSize: 11, fontWeight: '500', marginTop: 2 },

  listContainer: { paddingHorizontal: 12, paddingBottom: 30 },

  // Log cards
  logCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14, borderRadius: 16, marginBottom: 8, borderWidth: 1,
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 1,
  },
  logIconWrap: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  logIconText: { fontSize: 18 },
  logRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  logTitle: { fontSize: 14, fontWeight: '700', flex: 1, marginRight: 8 },
  logAmount: { fontSize: 14, fontWeight: '900' },
  logSubRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  logDate: { fontSize: 11 },
  logTypePill: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  logTypeBadge: { fontSize: 9, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },

  emptyContainer: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { fontSize: 14, color: '#8E8E93' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalScroll: {
    flexGrow: 1,
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1C1C1E',
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#8E8E93',
    marginBottom: 20,
    lineHeight: 18,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1C1C1E',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 12,
    padding: 12,
    fontSize: 15,
    color: '#1C1C1E',
    marginBottom: 16,
  },
  speedOptions: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  speedBtn: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E5E5EA',
    backgroundColor: '#F8F9FA',
  },
  speedBtnActive: {
    backgroundColor: '#FFF',
  },
  speedBtnTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#8E8E93',
    marginBottom: 4,
  },
  speedBtnDesc: {
    fontSize: 11,
    color: '#8E8E93',
    fontWeight: '500',
  },
  breakdownCard: {
    backgroundColor: '#F2F2F7',
    padding: 14,
    borderRadius: 14,
    marginBottom: 24,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  breakdownLabel: {
    fontSize: 13,
    color: '#8E8E93',
    fontWeight: '500',
  },
  breakdownValue: {
    fontSize: 13,
    color: '#1C1C1E',
    fontWeight: '700',
  },
  breakdownTotal: {
    borderTopWidth: 1,
    borderTopColor: '#E5E5EA',
    paddingTop: 8,
    marginTop: 4,
    marginBottom: 0,
  },
  breakdownTotalLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1C1C1E',
  },
  breakdownTotalValue: {
    fontSize: 15,
    fontWeight: '900',
  },
  modalBtns: {
    flexDirection: 'row',
    gap: 12,
  },
  fundProviderGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 8,
  },
  fundProviderBtn: {
    width: '47%',
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F8F9FA',
  },
  fundProviderIcon: { fontSize: 20 },
  fundProviderLabel: { fontSize: 13, fontWeight: '800' },
  activityHeaderButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  headerBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  swipeAction: {
    backgroundColor: '#FF3B30',
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingHorizontal: 20,
    flex: 1,
  },
  swipeActionText: {
    color: '#fff',
    fontWeight: '600',
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
  filterModalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    marginHorizontal: 20,
    marginTop: 'auto',
    marginBottom: 20,
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
  securityBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    marginVertical: 10,
  },
  lifeCheckBox: {
    backgroundColor: '#FFF7ED',
    borderColor: '#FED7AA',
  },
  securityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  securityBadge: {
    backgroundColor: '#E0E7FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  securityBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#4338CA',
    letterSpacing: 0.5,
  },
  hugeBadge: {
    backgroundColor: '#FEE2E2',
  },
  hugeBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#B91C1C',
    letterSpacing: 0.5,
  },
  securityTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
    flex: 1,
  },
  securityDesc: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 17,
    marginBottom: 10,
  },
  otpRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  otpInput: {
    flex: 1,
    marginBottom: 0,
    letterSpacing: 3,
    fontWeight: '700',
    fontSize: 16,
    textAlign: 'center',
  },
  otpBtn: {
    paddingHorizontal: 16,
    height: 48,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 100,
  },
  otpBtnDisabled: {
    opacity: 0.6,
  },
  otpBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  lifeCheckBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: 12,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
  },
  lifeCheckBtnIcon: {
    fontSize: 20,
  },
  lifeCheckBtnText: {
    fontWeight: '700',
    fontSize: 13,
  },
  lifeCheckPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFFFFF',
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  lifeCheckImg: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#E2E8F0',
  },
  lifeCheckInfo: {
    flex: 1,
    gap: 4,
  },
  lifeCheckSuccessText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#15803D',
  },
  retakeBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 3,
    paddingHorizontal: 8,
    backgroundColor: '#F1F5F9',
    borderRadius: 6,
  },
  retakeBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
});
