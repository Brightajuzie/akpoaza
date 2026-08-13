import React, { useContext, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert, Modal, Platform, ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { CartContext } from '../context/CartContext';
import { AuthContext } from '../context/AuthContext';
import { SettingsContext } from '../context/SettingsContext';
import { useCurrency } from '../context/CurrencyContext';
import apiClient from '../api/client';

const TYPE_CONFIG: Record<string, { icon: string; label: string; color: string }> = {
  product: { icon: '📦', label: 'Product', color: '#F59E0B' },
  service: { icon: '⚡', label: 'Service', color: '#3B82F6' },
};

export default function CartScreen({ route, navigation }: any) {
  const { cart, cartTotal, removeFromCart, updateQuantity } = useContext(CartContext);
  const { userToken } = useContext(AuthContext);
  const { theme, colorMode } = useContext(SettingsContext);
  const { fmt } = useCurrency();
  const [loading, setLoading] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const isDark = colorMode === 'dark';

  React.useEffect(() => {
    if (userToken && route?.params?.autoProceed && cart.length > 0 && !loading) {
      navigation.setParams({ autoProceed: undefined });
      handleCheckout();
    }
  }, [userToken, route?.params?.autoProceed, cart.length]);

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    const products = cart.filter(i => i.type === 'product');
    const productItems = products.map(i => ({ productId: i.id, quantity: i.quantity }));
    const productTotal = products.reduce((s, i) => s + i.price * i.quantity, 0);

    if (!userToken) {
      navigation.navigate('Checkout', {
        checkoutType: 'order', isGuest: true,
        cartItems: productItems, amount: productTotal,
      });
      return;
    }
    setLoading(true);
    try {
      const res = await apiClient.post('/orders/checkout', { paymentProvider: 'NONE', items: productItems });
      const orderId = res.data.order?.id || 'dummy-order';
      navigation.navigate('Checkout', { checkoutType: 'order', id: orderId, amount: productTotal });
    } catch (e) {
      Alert.alert('Error', 'Failed to initialize checkout.');
    } finally {
      setLoading(false);
    }
  };

  const itemCount = cart.reduce((s, i) => s + i.quantity, 0);

  // ── Empty State ────────────────────────────────────────────────────────────
  if (cart.length === 0) {
    return (
      <View style={[styles.root, { backgroundColor: theme.background }]}>
        <View style={[styles.emptyHeader, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderBottomColor: isDark ? '#334155' : '#E2E8F0' }]}>
          <Text style={[styles.headerTitle, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>🛒 My Cart</Text>
        </View>
        <View style={styles.emptyBody}>
          <View style={[styles.emptyIconWrap, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC' }]}>
            <Text style={styles.emptyIcon}>🛒</Text>
          </View>
          <Text style={[styles.emptyTitle, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>Your cart is empty</Text>
          <Text style={[styles.emptySubtitle, { color: isDark ? '#64748B' : '#94A3B8' }]}>
            Browse products and services and add them here to checkout.
          </Text>
          <TouchableOpacity
            style={[styles.browseCta, { backgroundColor: theme.primary }]}
            onPress={() => navigation.navigate('Products')}
          >
            <Text style={styles.browseCtaText}>🛍️ Browse Products</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.browseCtaSecondary, { borderColor: theme.primary + '50', backgroundColor: theme.primary + '10' }]}
            onPress={() => navigation.navigate('Services')}
          >
            <Text style={[styles.browseCtaSecondaryText, { color: theme.primary }]}>⚡ Browse Services</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      {/* ── Auth Modal ───────────────────────────────────────────────────── */}
      <Modal visible={showAuthModal} transparent animationType="fade" onRequestClose={() => setShowAuthModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderColor: isDark ? '#334155' : '#E2E8F0' }]}>
            <Text style={styles.modalEmoji}>🔐</Text>
            <Text style={[styles.modalTitle, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>Sign In to Checkout</Text>
            <Text style={[styles.modalSubtitle, { color: isDark ? '#64748B' : '#94A3B8' }]}>
              Your cart is saved! Log in or create an account to complete your purchase securely.
            </Text>
            <TouchableOpacity
              style={[styles.modalPrimary, { backgroundColor: theme.primary }]}
              onPress={() => { setShowAuthModal(false); navigation.navigate('Login', { redirectTo: 'CartTab', redirectParams: { autoProceed: true } }); }}
            >
              <Text style={styles.modalPrimaryText}>Log In →</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalSecondary, { borderColor: theme.primary + '60', backgroundColor: theme.primary + '10' }]}
              onPress={() => { setShowAuthModal(false); navigation.navigate('Signup', { redirectTo: 'CartTab', redirectParams: { autoProceed: true } }); }}
            >
              <Text style={[styles.modalSecondaryText, { color: theme.primary }]}>Create Account</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowAuthModal(false)} style={styles.modalCancel}>
              <Text style={[styles.modalCancelText, { color: isDark ? '#475569' : '#94A3B8' }]}>Continue Browsing</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <View style={[styles.header, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderBottomColor: isDark ? '#334155' : '#E2E8F0' }]}>
        <View>
          <Text style={[styles.headerTitle, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>🛒 My Cart</Text>
          <Text style={[styles.headerSub, { color: isDark ? '#64748B' : '#94A3B8' }]}>
            {itemCount} item{itemCount !== 1 ? 's' : ''} · {fmt(cartTotal)} total
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.clearAllBtn, { borderColor: '#EF444460' }]}
          onPress={() => Alert.alert('Clear Cart', 'Remove all items from your cart?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Clear All', style: 'destructive', onPress: () => cart.forEach(i => removeFromCart(i.id)) },
          ])}
        >
          <Text style={styles.clearAllText}>Clear All</Text>
        </TouchableOpacity>
      </View>

      {/* ── Cart List ─────────────────────────────────────────────────────── */}
      <FlatList
        data={cart}
        keyExtractor={i => i.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => {
          const conf = TYPE_CONFIG[item.type] || TYPE_CONFIG.product;
          const lineTotal = item.price * item.quantity;
          return (
            <View style={[styles.cartCard, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderColor: isDark ? '#334155' : '#E2E8F0' }]}>
              {/* Left: Type icon */}
              <View style={[styles.cartCardIcon, { backgroundColor: conf.color + '15' }]}>
                <Text style={styles.cartCardIconText}>{conf.icon}</Text>
              </View>

              {/* Middle: Info */}
              <View style={styles.cartCardInfo}>
                <View style={[styles.cartTypeBadge, { backgroundColor: conf.color + '18' }]}>
                  <Text style={[styles.cartTypeBadgeText, { color: conf.color }]}>{conf.label}</Text>
                </View>
                <Text style={[styles.cartItemName, { color: isDark ? '#F1F5F9' : '#0F172A' }]} numberOfLines={2}>
                  {item.name}
                </Text>
                <Text style={[styles.cartUnitPrice, { color: isDark ? '#64748B' : '#94A3B8' }]}>
                  {fmt(item.price)} each
                </Text>
                <Text style={[styles.cartLineTotal, { color: theme.primary }]}>
                  {fmt(lineTotal)}
                </Text>
              </View>

              {/* Right: Qty controls + Remove */}
              <View style={styles.cartCardActions}>
                <View style={[styles.qtyRow, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderColor: isDark ? '#334155' : '#E2E8F0' }]}>
                  <TouchableOpacity
                    style={styles.qtyBtn}
                    onPress={() => updateQuantity(item.id, item.quantity - 1)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={[styles.qtyBtnText, { color: item.quantity <= 1 ? (isDark ? '#334155' : '#CBD5E1') : theme.primary }]}>−</Text>
                  </TouchableOpacity>
                  <Text style={[styles.qtyValue, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>{item.quantity}</Text>
                  <TouchableOpacity
                    style={styles.qtyBtn}
                    onPress={() => updateQuantity(item.id, item.quantity + 1)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={[styles.qtyBtnText, { color: theme.primary }]}>+</Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity style={styles.removeBtn} onPress={() => removeFromCart(item.id)}>
                  <Text style={styles.removeBtnText}>🗑 Remove</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        }}
        ListFooterComponent={
          <View style={[styles.orderSummary, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderColor: isDark ? '#334155' : '#E2E8F0' }]}>
            <Text style={[styles.summaryTitle, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>Order Summary</Text>

            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: isDark ? '#64748B' : '#94A3B8' }]}>Subtotal ({itemCount} items)</Text>
              <Text style={[styles.summaryValue, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>{fmt(cartTotal)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: isDark ? '#64748B' : '#94A3B8' }]}>Delivery fee</Text>
              <Text style={[styles.summaryValueGreen, { color: '#22C55E' }]}>Calculated at checkout</Text>
            </View>
            <View style={[styles.summaryDivider, { backgroundColor: isDark ? '#334155' : '#E2E8F0' }]} />
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryTotalLabel, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>Estimated Total</Text>
              <Text style={[styles.summaryTotalValue, { color: theme.primary }]}>{fmt(cartTotal)}</Text>
            </View>

            {/* Trust badges */}
            <View style={styles.trustRow}>
              {['🔒 Secure Payment', '🏦 Escrow Protected', '↩️ Easy Returns'].map(t => (
                <View key={t} style={[styles.trustBadge, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC' }]}>
                  <Text style={[styles.trustBadgeText, { color: isDark ? '#64748B' : '#94A3B8' }]}>{t}</Text>
                </View>
              ))}
            </View>
          </View>
        }
      />

      {/* ── Sticky Footer ────────────────────────────────────────────────── */}
      <View style={[styles.stickyFooter, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderTopColor: isDark ? '#334155' : '#E2E8F0' }]}>
        <View style={styles.footerTotalRow}>
          <Text style={[styles.footerTotalLabel, { color: isDark ? '#64748B' : '#94A3B8' }]}>Total</Text>
          <Text style={[styles.footerTotalValue, { color: theme.primary }]}>{fmt(cartTotal)}</Text>
        </View>
        <TouchableOpacity
          style={[styles.checkoutBtn, { backgroundColor: theme.primary }]}
          onPress={handleCheckout}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.checkoutBtnText}>
              🔒 Proceed to Checkout → {fmt(cartTotal)}
            </Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.continueBtn, { borderColor: theme.primary + '50', backgroundColor: theme.primary + '08' }]}
          onPress={() => navigation.navigate('Products')}
        >
          <Text style={[styles.continueBtnText, { color: theme.primary }]}>🛍️ Continue Shopping</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1,
  },
  emptyHeader: {
    paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 22, fontWeight: '900', letterSpacing: -0.5 },
  headerSub: { fontSize: 12, fontWeight: '500', marginTop: 2 },
  clearAllBtn: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1,
  },
  clearAllText: { fontSize: 12, fontWeight: '700', color: '#EF4444' },

  // Empty state
  emptyBody: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, paddingBottom: 60 },
  emptyIconWrap: {
    width: 100, height: 100, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { fontSize: 22, fontWeight: '900', marginBottom: 8, textAlign: 'center' },
  emptySubtitle: { fontSize: 14, textAlign: 'center', lineHeight: 21, marginBottom: 28 },
  browseCta: {
    width: '100%', paddingVertical: 15, borderRadius: 14,
    alignItems: 'center', marginBottom: 10,
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4,
  },
  browseCtaText: { color: '#FFF', fontSize: 15, fontWeight: '800' },
  browseCtaSecondary: {
    width: '100%', paddingVertical: 15, borderRadius: 14,
    alignItems: 'center', borderWidth: 1.5,
  },
  browseCtaSecondaryText: { fontSize: 15, fontWeight: '800' },

  // List
  listContent: { padding: 12, paddingBottom: 8 },

  // Cart Card
  cartCard: {
    flexDirection: 'row', borderRadius: 16, borderWidth: 1,
    marginBottom: 10, padding: 14, gap: 12, alignItems: 'flex-start',
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
  },
  cartCardIcon: {
    width: 46, height: 46, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  cartCardIconText: { fontSize: 22 },
  cartCardInfo: { flex: 1, gap: 3 },
  cartTypeBadge: {
    alignSelf: 'flex-start', paddingHorizontal: 7, paddingVertical: 2,
    borderRadius: 6, marginBottom: 2,
  },
  cartTypeBadgeText: { fontSize: 9, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },
  cartItemName: { fontSize: 14, fontWeight: '800', lineHeight: 19 },
  cartUnitPrice: { fontSize: 11, fontWeight: '500' },
  cartLineTotal: { fontSize: 16, fontWeight: '900', marginTop: 2 },

  cartCardActions: { alignItems: 'flex-end', gap: 10 },
  qtyRow: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 10, borderWidth: 1, overflow: 'hidden',
  },
  qtyBtn: { paddingHorizontal: 10, paddingVertical: 8 },
  qtyBtnText: { fontSize: 18, fontWeight: '700' },
  qtyValue: { fontSize: 15, fontWeight: '800', minWidth: 28, textAlign: 'center' },
  removeBtn: { paddingVertical: 4 },
  removeBtnText: { fontSize: 11, fontWeight: '700', color: '#EF4444' },

  // Order Summary
  orderSummary: {
    borderRadius: 16, borderWidth: 1, margin: 12, padding: 16,
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
  },
  summaryTitle: { fontSize: 16, fontWeight: '800', marginBottom: 14 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  summaryLabel: { fontSize: 13, fontWeight: '500' },
  summaryValue: { fontSize: 14, fontWeight: '700' },
  summaryValueGreen: { fontSize: 12, fontWeight: '700' },
  summaryDivider: { height: 1, marginVertical: 10 },
  summaryTotalLabel: { fontSize: 15, fontWeight: '800' },
  summaryTotalValue: { fontSize: 20, fontWeight: '900' },
  trustRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 14 },
  trustBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  trustBadgeText: { fontSize: 10, fontWeight: '600' },

  // Sticky Footer
  stickyFooter: {
    padding: 16,
    paddingBottom: Platform.OS === 'ios' ? 28 : 16,
    borderTopWidth: 1,
    gap: 10,
  },
  footerTotalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  footerTotalLabel: { fontSize: 13, fontWeight: '600' },
  footerTotalValue: { fontSize: 22, fontWeight: '900' },
  checkoutBtn: {
    paddingVertical: 16, borderRadius: 14, alignItems: 'center',
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 10, elevation: 6,
  },
  checkoutBtnText: { color: '#FFF', fontSize: 15, fontWeight: '800' },
  continueBtn: {
    paddingVertical: 14, borderRadius: 14, alignItems: 'center', borderWidth: 1.5,
  },
  continueBtnText: { fontSize: 14, fontWeight: '700' },

  // Modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  modalCard: {
    width: '100%', maxWidth: 400, borderRadius: 24, padding: 28,
    alignItems: 'center', borderWidth: 1,
    shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.15, shadowRadius: 24, elevation: 10,
  },
  modalEmoji: { fontSize: 48, marginBottom: 14 },
  modalTitle: { fontSize: 22, fontWeight: '900', marginBottom: 8, textAlign: 'center' },
  modalSubtitle: { fontSize: 14, textAlign: 'center', lineHeight: 21, marginBottom: 24 },
  modalPrimary: {
    width: '100%', paddingVertical: 15, borderRadius: 12, alignItems: 'center', marginBottom: 10,
  },
  modalPrimaryText: { color: '#FFF', fontSize: 15, fontWeight: '800' },
  modalSecondary: {
    width: '100%', paddingVertical: 15, borderRadius: 12, alignItems: 'center', borderWidth: 1.5, marginBottom: 16,
  },
  modalSecondaryText: { fontSize: 15, fontWeight: '800' },
  modalCancel: { paddingVertical: 8 },
  modalCancelText: { fontSize: 13, fontWeight: '500' },
});
