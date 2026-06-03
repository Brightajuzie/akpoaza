import React, { useContext, useState } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Modal } from 'react-native';
import { CartContext } from '../context/CartContext';
import { AuthContext } from '../context/AuthContext';
import { SettingsContext } from '../context/SettingsContext';
import apiClient from '../api/client';

export default function CartScreen({ navigation }: any) {
  const { cart, cartTotal, removeFromCart, updateQuantity } = useContext(CartContext);
  const { userToken } = useContext(AuthContext);
  const { theme } = useContext(SettingsContext);
  const [loading, setLoading] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);

  const handleCheckout = async () => {
    if (cart.length === 0) return;

    // Guest guard — cart is preserved; prompt auth before checkout
    if (!userToken) {
      setShowAuthModal(true);
      return;
    }

    setLoading(true);
    try {
      const products = cart.filter(item => item.type === 'product');
      const productItems = products.map(item => ({
        productId: item.id,
        quantity: item.quantity,
      }));
      const productTotal = products.reduce((sum, item) => sum + item.price * item.quantity, 0);

      const response = await apiClient.post('/orders/checkout', {
        paymentProvider: 'NONE',
        items: productItems
      });

      const orderId = response.data.order?.id || 'dummy-order';
      navigation.navigate('Checkout', { checkoutType: 'order', id: orderId, amount: productTotal });
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'Failed to initialize checkout.');
    } finally {
      setLoading(false);
    }
  };

  if (cart.length === 0) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <Text style={styles.emptyText}>Your cart is empty.</Text>
        <TouchableOpacity 
          style={[styles.browseButton, { backgroundColor: theme.primary }]} 
          onPress={() => navigation.navigate('HomeTab')}
        >
          <Text style={styles.browseButtonText}>Browse items</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Auth Gate Modal for Guests */}
      <Modal
        visible={showAuthModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAuthModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { borderColor: theme.border }]}>
            <Text style={styles.modalIcon}>🔐</Text>
            <Text style={styles.modalTitle}>Sign In to Checkout</Text>
            <Text style={styles.modalSubtitle}>
              Your cart is saved! Log in or create an account to complete your purchase.
            </Text>
            <TouchableOpacity
              style={[styles.modalPrimaryBtn, { backgroundColor: theme.primary }]}
              onPress={() => {
                setShowAuthModal(false);
                navigation.navigate('Login', { redirectTo: 'CartTab' });
              }}
            >
              <Text style={styles.modalPrimaryText}>Log In</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalSecondaryBtn, { borderColor: theme.primary }]}
              onPress={() => {
                setShowAuthModal(false);
                navigation.navigate('Signup', { redirectTo: 'CartTab' });
              }}
            >
              <Text style={[styles.modalSecondaryText, { color: theme.primary }]}>Create Account</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowAuthModal(false)} style={styles.modalCancelBtn}>
              <Text style={styles.modalCancelText}>Continue Browsing</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <FlatList
        data={cart}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <View style={[styles.card, { borderColor: theme.border }]}>
            <View style={styles.itemInfo}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.type}>{item.type === 'product' ? 'Product' : 'Service'}</Text>
              <Text style={[styles.price, { color: theme.primary }]}>${(item.price * item.quantity).toFixed(2)}</Text>
            </View>
            <View style={styles.actions}>
              <View style={[styles.quantityContainer, { backgroundColor: theme.background }]}>
                <TouchableOpacity onPress={() => updateQuantity(item.id, item.quantity - 1)} style={styles.qtyButton}>
                  <Text style={[styles.qtyText, { color: theme.primary }]}>-</Text>
                </TouchableOpacity>
                <Text style={styles.quantity}>{item.quantity}</Text>
                <TouchableOpacity onPress={() => updateQuantity(item.id, item.quantity + 1)} style={styles.qtyButton}>
                  <Text style={[styles.qtyText, { color: theme.primary }]}>+</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity onPress={() => removeFromCart(item.id)} style={styles.removeBtn}>
                <Text style={styles.removeText}>Remove</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      />
      <View style={[styles.footer, { borderTopColor: theme.border }]}>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total:</Text>
          <Text style={[styles.totalPrice, { color: theme.primary }]}>${cartTotal.toFixed(2)}</Text>
        </View>
        <TouchableOpacity 
          style={[styles.checkoutButton, { backgroundColor: theme.primary }]}
          onPress={handleCheckout}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.checkoutButtonText}>Proceed to Checkout</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Auth modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#FFF',
    borderRadius: 24,
    padding: 32,
    width: '100%',
    alignItems: 'center',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 10,
  },
  modalIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1C1C1E',
    marginBottom: 8,
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#8E8E93',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 28,
  },
  modalPrimaryBtn: {
    width: '100%',
    height: 50,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalPrimaryText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  modalSecondaryBtn: {
    width: '100%',
    height: 50,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    marginBottom: 16,
  },
  modalSecondaryText: {
    fontSize: 16,
    fontWeight: '700',
  },
  modalCancelBtn: {
    paddingVertical: 8,
  },
  modalCancelText: {
    color: '#8E8E93',
    fontSize: 14,
  },
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyText: {
    fontSize: 18,
    color: '#666',
    marginBottom: 20,
  },
  browseButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  browseButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  card: {
    backgroundColor: '#fff',
    padding: 16,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
  },
  itemInfo: {
    flex: 1,
  },
  name: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
    marginBottom: 4,
  },
  type: {
    fontSize: 12,
    color: '#888',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  price: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  actions: {
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  quantityContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  qtyButton: {
    paddingHorizontal: 8,
  },
  qtyText: {
    fontSize: 18,
    fontWeight: '600',
  },
  quantity: {
    fontSize: 16,
    marginHorizontal: 12,
    fontWeight: '500',
  },
  removeBtn: {
    marginTop: 12,
  },
  removeText: {
    color: '#FF3B30',
    fontSize: 14,
    fontWeight: '500',
  },
  footer: {
    backgroundColor: '#fff',
    padding: 20,
    borderTopWidth: 1,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  totalLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  totalPrice: {
    fontSize: 22,
    fontWeight: 'bold',
  },
  checkoutButton: {
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  checkoutButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
