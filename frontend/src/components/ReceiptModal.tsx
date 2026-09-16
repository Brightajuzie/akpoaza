import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  Alert,
  Image,
  useWindowDimensions,
} from 'react-native';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';

export interface ReceiptModalData {
  receiptNumber: string;
  type: 'order' | 'booking' | 'parcel';
  typeLabel: string;
  recordId: string;
  createdAt: string | Date;
  paidAt?: string | Date;
  status: 'PAID' | 'DUE_ON_DELIVERY' | 'ESCROW_HELD' | 'PENDING' | string;
  statusLabel: string;
  paymentMethod: string;
  reference: string;
  currency: string;
  customer: {
    id?: string;
    name: string;
    email: string;
    phone?: string | null;
    address?: string | null;
  };
  items: Array<{
    name: string;
    description?: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
  }>;
  subtotal: number;
  deliveryFee: number;
  totalAmount: number;
  amountPaid: number;
  balanceDue: number;
  isSplitPayment: boolean;
  notes?: string;
  assignedProvider?: {
    name: string;
    phone?: string | null;
    role: 'RIDER' | 'HANDYMAN';
  } | null;
}

interface ReceiptModalProps {
  visible: boolean;
  receipt: ReceiptModalData | null;
  onClose: () => void;
}

export default function ReceiptModal({ visible, receipt, onClose }: ReceiptModalProps) {
  if (!receipt) return null;

  const { width } = useWindowDimensions();
  const isCompact = width < 380;
  const qrData = `https://akpoaza-3.onrender.com/api/payments/receipt-verify?num=${encodeURIComponent(receipt.receiptNumber || '')}&ref=${encodeURIComponent(receipt.reference || '')}&amt=${encodeURIComponent(String(receipt.amountPaid || 0))}`;

  const cur = receipt.currency === 'USD' ? '$' : '₦';
  const formatMoney = (val: number) => `${cur}${(val || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const createdDate = new Date(receipt.createdAt).toLocaleString();
  const paidDate = receipt.paidAt ? new Date(receipt.paidAt).toLocaleString() : 'Pending Confirmation';

  const statusColor =
    receipt.status === 'PAID' ? '#16A34A' :
    receipt.status === 'ESCROW_HELD' ? '#7C3AED' :
    receipt.status === 'DUE_ON_DELIVERY' ? '#D97706' : '#2563EB';

  const handlePrint = async () => {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined') {
        window.print();
      }
      return;
    }

    try {
      const summaryText = `
FIXMART OFFICIAL RECEIPT
Receipt #: ${receipt.receiptNumber}
Date: ${createdDate}
Customer: ${receipt.customer.name} (${receipt.customer.email})
Status: ${receipt.statusLabel}
Payment: ${receipt.paymentMethod} (${receipt.reference})

ITEMS:
${receipt.items.map(i => `- ${i.name} x${i.quantity} @ ${formatMoney(i.unitPrice)} = ${formatMoney(i.subtotal)}`).join('\n')}

Subtotal: ${formatMoney(receipt.subtotal)}
Delivery: ${formatMoney(receipt.deliveryFee)}
Total: ${formatMoney(receipt.totalAmount)}
Paid: ${formatMoney(receipt.amountPaid)}
Balance: ${formatMoney(receipt.balanceDue)}
      `.trim();

      const filePath = `${FileSystem.cacheDirectory || ''}receipt_${receipt.receiptNumber}.txt`;
      await FileSystem.writeAsStringAsync(filePath, summaryText);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(filePath, { mimeType: 'text/plain', dialogTitle: `Receipt #${receipt.receiptNumber}` });
      } else {
        Alert.alert('Receipt Ready', summaryText);
      }
    } catch (e: any) {
      Alert.alert('Error', 'Unable to share receipt text: ' + (e?.message || 'Unknown error'));
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.brandTitle}>FixMart Receipt</Text>
              <Text style={styles.receiptNum}>#{receipt.receiptNumber}</Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: statusColor + '18', borderColor: statusColor }]}>
              <Text style={[styles.statusBadgeText, { color: statusColor }]}>{receipt.statusLabel}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton} accessibilityLabel="Close Receipt">
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
            {/* Meta Details Card */}
            <View style={styles.sectionCard}>
              <View style={styles.rowBetween}>
                <Text style={styles.metaLabel}>Transaction Type</Text>
                <Text style={styles.metaValue}>{receipt.typeLabel}</Text>
              </View>
              <View style={styles.rowBetween}>
                <Text style={styles.metaLabel}>Date Issued</Text>
                <Text style={styles.metaValue}>{createdDate}</Text>
              </View>
              {receipt.paidAt && (
                <View style={styles.rowBetween}>
                  <Text style={styles.metaLabel}>Payment Date</Text>
                  <Text style={styles.metaValue}>{paidDate}</Text>
                </View>
              )}
              <View style={styles.rowBetween}>
                <Text style={styles.metaLabel}>Payment Method</Text>
                <Text style={styles.metaValue}>{receipt.paymentMethod}</Text>
              </View>
              <View style={styles.rowBetween}>
                <Text style={styles.metaLabel}>Reference</Text>
                <Text style={[styles.metaValue, styles.monoText]}>{receipt.reference}</Text>
              </View>
            </View>

            {/* Customer Details */}
            <View style={styles.sectionCard}>
              <Text style={styles.sectionHeading}>Customer Information</Text>
              <Text style={styles.custName}>{receipt.customer.name}</Text>
              <Text style={styles.custDetail}>✉️ {receipt.customer.email}</Text>
              {receipt.customer.phone ? <Text style={styles.custDetail}>📞 {receipt.customer.phone}</Text> : null}
              {receipt.customer.address ? <Text style={styles.custDetail}>📍 {receipt.customer.address}</Text> : null}

              {receipt.assignedProvider && (
                <View style={styles.providerCard}>
                  <Text style={styles.providerHeading}>
                    {receipt.assignedProvider.role === 'RIDER' ? '🛵 Assigned Dispatch Rider' : '🔧 Assigned Handyman'}
                  </Text>
                  <Text style={styles.providerName}>{receipt.assignedProvider.name}</Text>
                  {receipt.assignedProvider.phone ? (
                    <Text style={styles.providerPhone}>📞 {receipt.assignedProvider.phone}</Text>
                  ) : null}
                </View>
              )}
            </View>

            {/* Items Breakdown */}
            <View style={styles.sectionCard}>
              <Text style={styles.sectionHeading}>Items & Services</Text>
              {receipt.items.map((item, idx) => (
                <View key={idx} style={[styles.itemRow, idx > 0 && styles.itemRowBorder]}>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={styles.itemName}>{item.name}</Text>
                    {item.description ? <Text style={styles.itemDesc}>{item.description}</Text> : null}
                    <Text style={styles.itemQty}>Qty: {item.quantity} × {formatMoney(item.unitPrice)}</Text>
                  </View>
                  <Text style={styles.itemSubtotal}>{formatMoney(item.subtotal)}</Text>
                </View>
              ))}
            </View>

            {/* Pricing Summary */}
            <View style={styles.sectionCard}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Subtotal</Text>
                <Text style={styles.summaryValue}>{formatMoney(receipt.subtotal)}</Text>
              </View>
              {receipt.deliveryFee > 0 && (
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Delivery / Logistics</Text>
                  <Text style={styles.summaryValue}>{formatMoney(receipt.deliveryFee)}</Text>
                </View>
              )}
              <View style={[styles.summaryRow, styles.totalRow]}>
                <Text style={styles.totalLabel}>Total Amount</Text>
                <Text style={styles.totalValue}>{formatMoney(receipt.totalAmount)}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Amount Credited / Paid</Text>
                <Text style={[styles.summaryValue, { color: '#16A34A', fontWeight: '700' }]}>
                  {formatMoney(receipt.amountPaid)}
                </Text>
              </View>
              {receipt.balanceDue > 0 && (
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Balance Due on Delivery</Text>
                  <Text style={[styles.summaryValue, { color: '#D97706', fontWeight: '700' }]}>
                    {formatMoney(receipt.balanceDue)}
                  </Text>
                </View>
              )}
            </View>

            {/* Official QR Code Verification Section */}
            <View style={[styles.qrSection, isCompact && { flexDirection: 'column', alignItems: 'center' }]}>
              <View style={styles.qrImageContainer}>
                <Image
                  source={{ uri: `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(qrData)}` }}
                  style={styles.qrImage}
                  resizeMode="contain"
                />
              </View>
              <View style={[styles.qrInfo, isCompact && { alignItems: 'center', marginTop: 10 }]}>
                <View style={styles.qrBadge}>
                  <Text style={styles.qrBadgeText}>🛡️ VERIFIED RECEIPT</Text>
                </View>
                <Text style={[styles.qrTitle, isCompact && { textAlign: 'center' }]}>Scan to Verify Authenticity</Text>
                <Text style={[styles.qrSubtitle, isCompact && { textAlign: 'center' }]}>
                  Scan using any phone camera to verify official FixMart purchase record, delivery route, and buyer guarantee.
                </Text>
                <Text style={styles.qrHash} numberOfLines={1} ellipsizeMode="middle">
                  VERIFY: #{receipt.receiptNumber}
                </Text>
              </View>
            </View>

            {receipt.notes ? (
              <View style={styles.notesCard}>
                <Text style={styles.notesTitle}>Note</Text>
                <Text style={styles.notesBody}>{receipt.notes}</Text>
              </View>
            ) : null}
          </ScrollView>

          {/* Footer Actions */}
          <View style={styles.footer}>
            <TouchableOpacity style={styles.printBtn} onPress={handlePrint} activeOpacity={0.8}>
              <Text style={styles.printBtnText}>🖨️ Print / Share Receipt</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.doneBtn} onPress={onClose} activeOpacity={0.8}>
              <Text style={styles.doneBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    width: '100%',
    maxWidth: 580,
    maxHeight: '90%',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  brandTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  receiptNum: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '600',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 10,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    fontSize: 16,
    color: '#475569',
    fontWeight: '700',
  },
  body: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  sectionCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 3,
  },
  metaLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  metaValue: {
    fontSize: 12,
    color: '#0F172A',
    fontWeight: '600',
  },
  monoText: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 11,
  },
  sectionHeading: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  custName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  custDetail: {
    fontSize: 12,
    color: '#475569',
    marginTop: 3,
  },
  providerCard: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  providerHeading: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2563EB',
    textTransform: 'uppercase',
  },
  providerName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
    marginTop: 2,
  },
  providerPhone: {
    fontSize: 12,
    color: '#475569',
    marginTop: 1,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  itemRowBorder: {
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingTop: 8,
  },
  itemName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
  },
  itemDesc: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  itemQty: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  itemSubtotal: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 4,
  },
  summaryLabel: {
    fontSize: 13,
    color: '#64748B',
  },
  summaryValue: {
    fontSize: 13,
    color: '#0F172A',
    fontWeight: '600',
  },
  totalRow: {
    borderTopWidth: 1,
    borderTopColor: '#CBD5E1',
    paddingTop: 8,
    marginTop: 6,
  },
  totalLabel: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  totalValue: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  notesCard: {
    backgroundColor: '#FEF3C7',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
    marginBottom: 12,
  },
  notesTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#92400E',
    textTransform: 'uppercase',
  },
  notesBody: {
    fontSize: 12,
    color: '#78350F',
    marginTop: 2,
  },
  footer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    gap: 12,
  },
  printBtn: {
    flex: 1,
    backgroundColor: '#0F172A',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  printBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  doneBtn: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#E2E8F0',
    borderRadius: 8,
    alignItems: 'center',
  },
  doneBtnText: {
    color: '#334155',
    fontWeight: '700',
    fontSize: 13,
  },
  // QR Section Styles
  qrSection: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: '#10B98130',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  qrImageContainer: {
    backgroundColor: '#FFFFFF',
    padding: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  qrImage: {
    width: 100,
    height: 100,
  },
  qrInfo: {
    flex: 1,
    flexShrink: 1,
  },
  qrBadge: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#10B98140',
  },
  qrBadgeText: {
    color: '#059669',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  qrTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 4,
  },
  qrSubtitle: {
    fontSize: 11.5,
    color: '#64748B',
    lineHeight: 16,
    marginBottom: 6,
  },
  qrHash: {
    fontSize: 10,
    fontWeight: '700',
    color: '#059669',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
});
