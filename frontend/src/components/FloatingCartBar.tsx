import React, { useContext } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { CartContext } from '../context/CartContext';
import { SettingsContext } from '../context/SettingsContext';
import { useCurrency } from '../context/CurrencyContext';

export default function FloatingCartBar() {
  const navigation = useNavigation<any>();
  const { cart, cartTotal } = useContext(CartContext);
  const { theme } = useContext(SettingsContext);
  const { fmt } = useCurrency();

  const totalCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  if (totalCount === 0) return null;

  return (
    <View style={styles.outerContainer}>
      <TouchableOpacity
        style={[
          styles.container,
          {
            backgroundColor: theme.primary || '#22A45D',
            borderColor: theme.border || '#E5E5EA',
          },
        ]}
        activeOpacity={0.9}
        onPress={() => {
          try {
            navigation.navigate('CartTab');
          } catch {
            navigation.navigate('Cart');
          }
        }}
      >
        <View style={styles.infoSection}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{totalCount}</Text>
          </View>
          <View style={styles.textColumn}>
            <Text style={styles.cartLabel}>
              {totalCount === 1 ? '1 Item in Cart' : `${totalCount} Items in Cart`}
            </Text>
            <Text style={styles.cartPrice}>{fmt(cartTotal)}</Text>
          </View>
        </View>

        <View style={styles.actionSection}>
          <Text style={styles.actionText}>View Cart & Checkout</Text>
          <Text style={styles.arrowIcon}>→</Text>
        </View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
    zIndex: 999,
    alignItems: 'center',
  },
  container: {
    width: '100%',
    maxWidth: 600,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 8,
  },
  infoSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  badge: {
    backgroundColor: '#FFFFFF',
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  badgeText: {
    color: '#1C1C1E',
    fontWeight: '800',
    fontSize: 13,
  },
  textColumn: {
    justifyContent: 'center',
  },
  cartLabel: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  cartPrice: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  actionSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  actionText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  arrowIcon: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
  },
});
