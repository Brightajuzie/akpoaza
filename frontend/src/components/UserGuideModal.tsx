import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  useWindowDimensions,
} from 'react-native';

interface UserGuideModalProps {
  visible: boolean;
  onClose: () => void;
  theme: any;
  colorMode?: 'light' | 'dark';
  initialTab?: 'CUSTOMER' | 'ESCROW' | 'HANDYMAN' | 'VENDOR' | 'RIDER';
}

export default function UserGuideModal({
  visible,
  onClose,
  theme,
  colorMode = 'light',
  initialTab = 'CUSTOMER',
}: UserGuideModalProps) {
  const [activeTab, setActiveTab] = useState<'CUSTOMER' | 'ESCROW' | 'HANDYMAN' | 'VENDOR' | 'RIDER'>(initialTab);
  const { width, height } = useWindowDimensions();
  const isDark = colorMode === 'dark';
  const isCompact = height <= 720;

  const tabs: { key: 'CUSTOMER' | 'ESCROW' | 'HANDYMAN' | 'VENDOR' | 'RIDER'; label: string; icon: string }[] = [
    { key: 'CUSTOMER', label: 'Customers', icon: '🛒' },
    { key: 'ESCROW', label: 'Escrow Safe', icon: '🛡️' },
    { key: 'HANDYMAN', label: 'Artisans', icon: '🔧' },
    { key: 'VENDOR', label: 'Vendors', icon: '🏪' },
    { key: 'RIDER', label: 'Riders', icon: '🛵' },
  ];

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View
          style={[
            styles.modalContainer,
            {
              backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
              borderColor: isDark ? '#334155' : '#E2E8F0',
              maxHeight: isCompact ? '90%' : '85%',
            },
          ]}
        >
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: isDark ? '#1E293B' : '#F1F5F9' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={[styles.headerIconBadge, { backgroundColor: theme.primary + '18' }]}>
                <Text style={{ fontSize: 20 }}>📘</Text>
              </View>
              <View>
                <Text style={[styles.title, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>
                  FixMart User Guide & Tips
                </Text>
                <Text style={[styles.subtitle, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                  Step-by-step prompts for seamless operations
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={[styles.closeBtnText, { color: isDark ? '#94A3B8' : '#64748B' }]}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Segmented Tab Bar */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.tabScroll}
            contentContainerStyle={styles.tabScrollContent}
          >
            {tabs.map((tab) => {
              const selected = activeTab === tab.key;
              return (
                <TouchableOpacity
                  key={tab.key}
                  onPress={() => setActiveTab(tab.key)}
                  style={[
                    styles.tabPill,
                    {
                      backgroundColor: selected ? theme.primary : isDark ? '#1E293B' : '#F8FAFC',
                      borderColor: selected ? theme.primary : isDark ? '#334155' : '#E2E8F0',
                    },
                  ]}
                >
                  <Text style={{ fontSize: 13 }}>{tab.icon}</Text>
                  <Text
                    style={[
                      styles.tabPillText,
                      { color: selected ? '#FFFFFF' : isDark ? '#CBD5E1' : '#475569' },
                    ]}
                  >
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Guide Content */}
          <ScrollView style={styles.contentScroll} showsVerticalScrollIndicator={false}>
            {activeTab === 'CUSTOMER' && (
              <View style={styles.section}>
                <View style={[styles.card, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: isDark ? '#334155' : '#E2E8F0' }]}>
                  <Text style={[styles.cardTitle, { color: isDark ? '#F8FAFC' : '#0F172A' }]}>
                    🛍️ 1. Shopping Genuine Products
                  </Text>
                  <Text style={[styles.cardBody, { color: isDark ? '#94A3B8' : '#475569' }]}>
                    • Explore verified merchant stores across Nigeria.{'\n'}
                    • Check real customer ratings and reviews on every tool and supply.{'\n'}
                    • Choose <Text style={{ fontWeight: '700', color: theme.primary }}>100% full payment</Text> or <Text style={{ fontWeight: '700', color: theme.primary }}>50% split payment</Text> at checkout.{'\n'}
                    • Follow your delivery rider live on the map.
                  </Text>
                </View>

                <View style={[styles.card, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: isDark ? '#334155' : '#E2E8F0' }]}>
                  <Text style={[styles.cardTitle, { color: isDark ? '#F8FAFC' : '#0F172A' }]}>
                    🔧 2. Booking Verified Artisans & Handymen
                  </Text>
                  <Text style={[styles.cardBody, { color: isDark ? '#94A3B8' : '#475569' }]}>
                    • Select your required trade (Plumber, Electrician, AC Repair, Painter, Carpenter).{'\n'}
                    • Artisans carry verified KYC badges and background checks.{'\n'}
                    • Transparent base rates upfront with zero hidden call-out fees.{'\n'}
                    • Communicate directly via in-app calls or instant chat.
                  </Text>
                </View>

                <View style={[styles.card, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: isDark ? '#334155' : '#E2E8F0' }]}>
                  <Text style={[styles.cardTitle, { color: isDark ? '#F8FAFC' : '#0F172A' }]}>
                    📦 3. Instant Parcel Dispatch
                  </Text>
                  <Text style={[styles.cardBody, { color: isDark ? '#94A3B8' : '#475569' }]}>
                    • Enter sender and recipient locations for instant price calculation.{'\n'}
                    • A verified rider arrives at your doorstep for pickup.{'\n'}
                    • Share real-time tracking links with the recipient.
                  </Text>
                </View>
              </View>
            )}

            {activeTab === 'ESCROW' && (
              <View style={styles.section}>
                <View style={[styles.card, { backgroundColor: isDark ? '#1E293B' : '#EFF6FF', borderColor: isDark ? '#3B82F6' : '#BFDBFE' }]}>
                  <Text style={[styles.cardTitle, { color: isDark ? '#60A5FA' : '#1D4ED8' }]}>
                    🛡️ How FixMart Escrow Protects Your Money
                  </Text>
                  <Text style={[styles.cardBody, { color: isDark ? '#94A3B8' : '#334155' }]}>
                    Every transaction on FixMart is secured by an encrypted digital escrow vault:
                  </Text>
                  <View style={{ marginTop: 10, gap: 8 }}>
                    <Text style={[styles.bulletPoint, { color: isDark ? '#CBD5E1' : '#1E293B' }]}>
                      🔒 <Text style={{ fontWeight: '700' }}>Step 1 — Secure Deposit:</Text> When you place an order or book an artisan, your payment is locked in FixMart's bank-grade escrow vault.
                    </Text>
                    <Text style={[styles.bulletPoint, { color: isDark ? '#CBD5E1' : '#1E293B' }]}>
                      🛠️ <Text style={{ fontWeight: '700' }}>Step 2 — Fulfillment:</Text> The service pro or vendor fulfills the job knowing your funds are guaranteed.
                    </Text>
                    <Text style={[styles.bulletPoint, { color: isDark ? '#CBD5E1' : '#1E293B' }]}>
                      ✅ <Text style={{ fontWeight: '700' }}>Step 3 — Release:</Text> You inspect the delivered items or completed repairs. Funds are ONLY disbursed to the provider when you confirm satisfaction!
                    </Text>
                    <Text style={[styles.bulletPoint, { color: isDark ? '#CBD5E1' : '#1E293B' }]}>
                      ⚖️ <Text style={{ fontWeight: '700' }}>Resolution Guarantee:</Text> If a job is not delivered as promised, our operations agents step in to resolve or refund your funds.
                    </Text>
                  </View>
                </View>
              </View>
            )}

            {activeTab === 'HANDYMAN' && (
              <View style={styles.section}>
                <View style={[styles.card, { backgroundColor: isDark ? '#1E293B' : '#F0FDF4', borderColor: isDark ? '#15803D' : '#BBF7D0' }]}>
                  <Text style={[styles.cardTitle, { color: isDark ? '#4ADE80' : '#15803D' }]}>
                    🛠️ Service Professional & Artisan Guide
                  </Text>
                  <Text style={[styles.cardBody, { color: isDark ? '#94A3B8' : '#334155' }]}>
                    • Complete KYC verification with your government ID to earn the Verified Pro badge.{'\n'}
                    • Keep your phone notification volume active to claim jobs first within your radius.{'\n'}
                    • Arrive promptly with clean equipment and professional conduct.{'\n'}
                    • Job earnings are deposited instantly into your FixMart virtual wallet upon client approval.{'\n'}
                    • Request instant bank withdrawals via secure 6-digit OTP anytime!
                  </Text>
                </View>
              </View>
            )}

            {activeTab === 'VENDOR' && (
              <View style={styles.section}>
                <View style={[styles.card, { backgroundColor: isDark ? '#1E293B' : '#FAF5FF', borderColor: isDark ? '#7E22CE' : '#E9D5FF' }]}>
                  <Text style={[styles.cardTitle, { color: isDark ? '#C084FC' : '#7E22CE' }]}>
                    🏪 Merchant & Vendor Growth Guide
                  </Text>
                  <Text style={[styles.cardBody, { color: isDark ? '#94A3B8' : '#334155' }]}>
                    • Upload clear high-resolution product photos showing multiple angles.{'\n'}
                    • Set clear competitive pricing in NGN with accurate stock numbers.{'\n'}
                    • When orders come in, package them securely — our dispatch riders handle doorstep pickup.{'\n'}
                    • Enjoy automatic sales tracking and instant balance withdrawal to any Nigerian bank.
                  </Text>
                </View>
              </View>
            )}

            {activeTab === 'RIDER' && (
              <View style={styles.section}>
                <View style={[styles.card, { backgroundColor: isDark ? '#1E293B' : '#FFFBEB', borderColor: isDark ? '#B45309' : '#FDE68A' }]}>
                  <Text style={[styles.cardTitle, { color: isDark ? '#FBBF24' : '#B45309' }]}>
                    🛵 Dispatch Rider Partner Guide
                  </Text>
                  <Text style={[styles.cardBody, { color: isDark ? '#94A3B8' : '#334155' }]}>
                    • Switch status to <Text style={{ fontWeight: '700', color: '#16A34A' }}>Online</Text> in the app to begin receiving delivery dispatches.{'\n'}
                    • Use in-app GPS routing to reach pickup points and destinations quickly.{'\n'}
                    • Hand over items safely and verify recipient OTP or signature.{'\n'}
                    • Earn delivery fees per completed drop with instant wallet crediting!
                  </Text>
                </View>
              </View>
            )}

            {/* Support Footer Banner */}
            <View style={[styles.supportCard, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }]}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: isDark ? '#F1F5F9' : '#0F172A', marginBottom: 2 }}>
                📞 Need Instant Assistance?
              </Text>
              <Text style={{ fontSize: 12, color: isDark ? '#94A3B8' : '#64748B', lineHeight: 17 }}>
                Our 24/7 support desk is available at <Text style={{ fontWeight: '700', color: theme.primary }}>admin.fixmart@gmail.com</Text>.
              </Text>
            </View>
          </ScrollView>

          {/* Footer Action */}
          <View style={[styles.footer, { borderTopColor: isDark ? '#1E293B' : '#F1F5F9' }]}>
            <TouchableOpacity
              style={[styles.gotItBtn, { backgroundColor: theme.primary }]}
              onPress={onClose}
              activeOpacity={0.85}
            >
              <Text style={styles.gotItBtnText}>Got It, Let's Go! 🚀</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 540,
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
  },
  headerIconBadge: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
  },
  subtitle: {
    fontSize: 12,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    fontSize: 18,
    fontWeight: '700',
  },
  tabScroll: {
    maxHeight: 52,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  tabScrollContent: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    flexDirection: 'row',
  },
  tabPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    gap: 6,
  },
  tabPillText: {
    fontSize: 12,
    fontWeight: '700',
  },
  contentScroll: {
    padding: 16,
  },
  section: {
    gap: 12,
    paddingBottom: 8,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 6,
  },
  cardBody: {
    fontSize: 13,
    lineHeight: 20,
  },
  bulletPoint: {
    fontSize: 13,
    lineHeight: 19,
  },
  supportCard: {
    borderRadius: 12,
    padding: 12,
    marginTop: 6,
    marginBottom: 16,
  },
  footer: {
    padding: 14,
    borderTopWidth: 1,
  },
  gotItBtn: {
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gotItBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
});
