import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Dimensions,
} from 'react-native';
import { useCurrency } from '../context/CurrencyContext';

interface AddToCartModalProps {
  visible: boolean;
  item: {
    name: string;
    price: number;
    imageUrl?: string;
  } | null;
  cartCount: number;
  onContinueShopping: () => void;
  onProceedToCheckout: () => void;
  themePrimary?: string;
}

export default function AddToCartModal({
  visible,
  item,
  cartCount,
  onContinueShopping,
  onProceedToCheckout,
  themePrimary = '#007AFF',
}: AddToCartModalProps) {
  const { fmt } = useCurrency();
  if (!item) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onContinueShopping}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* Header Badge */}
          <View style={[styles.successBadge, { backgroundColor: '#E8F5E9' }]}>
            <Text style={styles.successBadgeText}>✅ Item Added to Cart!</Text>
          </View>

          {/* Product Details Preview */}
          <View style={styles.itemRow}>
            {item.imageUrl ? (
              <Image source={{ uri: item.imageUrl }} style={styles.image} resizeMode="cover" />
            ) : (
              <View style={styles.imagePlaceholder}>
                <Text style={styles.placeholderIcon}>📦</Text>
              </View>
            )}
            <View style={styles.itemInfo}>
              <Text style={styles.itemName} numberOfLines={2}>{item.name}</Text>
              <Text style={[styles.itemPrice, { color: themePrimary }]}>
                {fmt(item.price)}
              </Text>
            </View>
          </View>

          {/* Cart Status Banner */}
          <View style={styles.cartCountBanner}>
            <Text style={styles.cartCountText}>
              🛒 Total items in your cart: <Text style={styles.cartCountHighlight}>{cartCount}</Text>
            </Text>
          </View>

          {/* Action Buttons */}
          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[styles.checkoutBtn, { backgroundColor: themePrimary }]}
              onPress={onProceedToCheckout}
              activeOpacity={0.85}
            >
              <Text style={styles.checkoutBtnText}>🛒 Proceed to Checkout</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.continueBtn, { borderColor: themePrimary }]}
              onPress={onContinueShopping}
              activeOpacity={0.85}
            >
              <Text style={[styles.continueBtnText, { color: themePrimary }]}>
                🛍️ Continue Shopping
              </Text>
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
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  successBadge: {
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 18,
  },
  successBadgeText: {
    color: '#2E7D32',
    fontSize: 14,
    fontWeight: '800',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    backgroundColor: '#F8F9FA',
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  image: {
    width: 64,
    height: 64,
    borderRadius: 12,
    marginRight: 14,
  },
  imagePlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 12,
    backgroundColor: '#E9ECEF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  placeholderIcon: {
    fontSize: 28,
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1C1C1E',
    marginBottom: 4,
  },
  itemPrice: {
    fontSize: 17,
    fontWeight: '800',
  },
  cartCountBanner: {
    backgroundColor: '#F2F2F7',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    marginBottom: 20,
    alignItems: 'center',
  },
  cartCountText: {
    fontSize: 13,
    color: '#6C757D',
    fontWeight: '600',
  },
  cartCountHighlight: {
    color: '#1C1C1E',
    fontWeight: '900',
    fontSize: 15,
  },
  buttonContainer: {
    gap: 12,
  },
  checkoutBtn: {
    height: 50,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 3,
  },
  checkoutBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  continueBtn: {
    height: 50,
    borderRadius: 14,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  continueBtnText: {
    fontSize: 15,
    fontWeight: '700',
  },
});
