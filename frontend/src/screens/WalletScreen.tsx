// @ts-nocheck
import React, { useEffect, useState, useContext } from 'react';
import { Picker } from '@react-native-picker/picker';
import { LinearGradient } from 'expo-linear-gradient';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, TouchableOpacity, Modal, TextInput, Alert, ScrollView, RefreshControl } from 'react-native';
import { BlurView } from 'expo-blur';
import { Swipeable } from 'react-native-gesture-handler';
import Animated, { FadeIn } from 'react-native-reanimated';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as Notifications from 'expo-notifications';
import apiClient from '../api/client';
import { AuthContext } from '../context/AuthContext';
import { SettingsContext } from '../context/SettingsContext';

export default function WalletScreen({ navigation }: any) {
  const { userInfo } = useContext(AuthContext);
  const { theme } = useContext(SettingsContext);

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>({ balance: 0, pendingBalance: 0, transactions: [], withdrawals: [] });
  
  // Pull-to-refresh state
  const [refreshing, setRefreshing] = useState(false);

  // Withdrawal Form states
  const [modalVisible, setModalVisible] = useState(false);
  const [amount, setAmount] = useState('');
  const [instant, setInstant] = useState(false);
  const [accountNumber, setAccountNumber] = useState('');
  const [bankName, setBankName] = useState('');
  const [submitting, setSubmitting] = useState(false);

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
  }, []);

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

    setSubmitting(true);
    try {
      const payload = {
        amount: amtFloat,
        instant,
        accountNumber: accountNumber.trim(),
        bankName: bankName.trim(),
      };
      
      const response = await apiClient.post('/wallet/withdraw', payload);
      Alert.alert('Success', response.data.message);
      // Schedule a local notification to inform the user of the withdrawal request
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Withdrawal Requested',
          body: `Your withdrawal of ₦${amtFloat.toFixed(2)} is being processed.`,
        },
        trigger: null,
      });
      
      // Reset form
      setAmount('');
      setAccountNumber('');
      setBankName('');
      setInstant(false);
      setModalVisible(false);
      
      // Refresh balance and transaction log
      fetchWalletData();
    } catch (error: any) {
      Alert.alert('Withdrawal Failed', error.response?.data?.error || 'Failed to submit withdrawal request.');
    } finally {
      setSubmitting(false);
    }
  };

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

    return (
      <Animated.View entering={FadeIn.duration(300)}>
        <Swipeable
          renderRightActions={(progress, dragX) => (
            <View style={styles.swipeAction}>
              <Text style={styles.swipeActionText}>Delete</Text>
            </View>
          )}
          onSwipeableRightOpen={() => { Alert.alert('Delete', 'Delete action triggered for this item.'); }}
        >
          <BlurView intensity={20} style={[styles.logCard, { borderColor: theme.border, backgroundColor: 'rgba(255,255,255,0.1)' }]} tint="light">
            <View style={styles.logRow}>
              <Text style={[styles.logTitle, { color: theme.text }]} numberOfLines={1}>
                {title}
              </Text>
              <Text style={[styles.logAmount, { color }]}>
                {isNegative ? '-' : '+'}₦{absAmount.toFixed(2)}
              </Text>
            </View>
            <View style={styles.logSubRow}>
              <Text style={styles.logDate}>{dateStr}</Text>
              <Text style={styles.logTypeBadge}>
                {item.logType === 'withdrawal' ? 'Payout' : item.type.replace('_', ' ')}
              </Text>
            </View>
          </BlurView>
        </Swipeable>
      </Animated.View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Balance Panel */}
      <LinearGradient colors={['#008080', '#00bfff']} style={styles.balanceCard}>
        <Text style={styles.balanceHeader}>Cleared Balance</Text>
        <Text style={styles.balanceValue}>₦{data.balance.toFixed(2)}</Text>
        
        <View style={styles.pendingRow}>
          <Text style={styles.pendingLabel}>Pending Clearance:</Text>
          <Text style={styles.pendingValue}>₦{data.pendingBalance.toFixed(2)}</Text>
        </View>

        <TouchableOpacity 
          style={styles.withdrawBtn} 
          onPress={() => setModalVisible(true)}
          disabled={data.balance <= 0}
        >
          <Text style={[styles.withdrawBtnText, { color: theme.primary }]}>Withdraw Funds</Text>
        </TouchableOpacity>
      </LinearGradient>

      {/* Activity Log Section */}
      <View style={styles.activityHeader}>
        <Text style={[styles.activityTitle, { color: theme.text }]}>Transaction Activity</Text>
        <View style={styles.activityHeaderButtons}>
          <TouchableOpacity onPress={() => setFilterModalVisible(true)} style={styles.headerBtn}>
            <Text style={{ color: theme.primary, fontWeight: '700' }}>⚙️ Filter</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onRefresh} style={styles.headerBtn}>
            <Text style={{ color: theme.primary, fontWeight: '700' }}>🔄 Refresh</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={exportCsv} style={styles.headerBtn}>
            <Text style={{ color: theme.primary, fontWeight: '700' }}>📥 Export CSV</Text>
          </TouchableOpacity>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  balanceCard: {
    padding: 24,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 6,
    marginBottom: 28,
  },
  balanceHeader: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 14,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  balanceValue: {
    color: '#FFF',
    fontSize: 36,
    fontWeight: '900',
    marginVertical: 10,
  },
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  pendingLabel: {
    color: 'rgba(255, 255, 255, 0.75)',
    fontSize: 13,
    fontWeight: '600',
  },
  pendingValue: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '800',
    marginLeft: 6,
  },
  withdrawBtn: {
    backgroundColor: '#FFF',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  withdrawBtnText: {
    fontSize: 15,
    fontWeight: '800',
  },
  activityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  activityTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  listContainer: {
    paddingBottom: 20,
  },
  logCard: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
  },
  logRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  logTitle: {
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
    marginRight: 12,
  },
  logAmount: {
    fontSize: 15,
    fontWeight: '800',
  },
  logSubRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  logDate: {
    fontSize: 12,
    color: '#8E8E93',
  },
  logTypeBadge: {
    fontSize: 10,
    color: '#8E8E93',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 14,
    color: '#8E8E93',
  },
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
});
