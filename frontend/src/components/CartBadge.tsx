import React, { useContext } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { CartContext } from '../context/CartContext';

const CartBadge = () => {
  const { cart } = useContext(CartContext);
  const count = cart.reduce((sum, item) => sum + item.quantity, 0);
  const display = count > 9 ? '9+' : count;
  return (
    <View style={styles.container}>
      <Text style={styles.icon}>🛒</Text>
      {count > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{display}</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { position: 'relative' },
  icon: { fontSize: 18 },
  badge: {
    position: 'absolute',
    top: -4,
    right: -8,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#FF0000',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
  },
  badgeText: { color: '#FFF', fontSize: 9, fontWeight: '800' },
});

export default CartBadge;
