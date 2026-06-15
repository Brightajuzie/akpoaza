import React, { useEffect, useState, useContext } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, Image, TouchableOpacity, Alert, TextInput, useWindowDimensions } from 'react-native';
import apiClient from '../api/client';
import { CartContext } from '../context/CartContext';
import { SettingsContext } from '../context/SettingsContext';

export default function ProductsScreen({ navigation }: any) {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [locationQuery, setLocationQuery] = useState('');
  const { addToCart } = useContext(CartContext);
  const { theme } = useContext(SettingsContext);
  const { width } = useWindowDimensions();
  const numColumns = width > 1024 ? 4 : width > 600 ? 3 : 2;

  const fetchProducts = async () => {
    try {
      setLoading(true);
      let url = '/products';
      const params: string[] = [];
      if (locationQuery.trim()) {
        params.push(`location=${encodeURIComponent(locationQuery.trim())}`);
      }
      if (params.length > 0) {
        url += `?${params.join('&')}`;
      }
      const response = await apiClient.get(url);
      setProducts(response.data);
    } catch (error) {
      console.error('Failed to fetch products', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, [locationQuery]); // Refresh automatically when location filter is updated

  const handleAddToCart = (product: any) => {
    addToCart({
      id: product.id,
      name: product.name,
      price: product.price,
      type: 'product'
    });
    Alert.alert('Added to Cart', `${product.name} has been added to your cart.`);
  };

  // Local text search filter
  const filteredProducts = products.filter(product => {
    const query = searchQuery.toLowerCase();
    return (
      product.name.toLowerCase().includes(query) ||
      (product.description && product.description.toLowerCase().includes(query)) ||
      (product.category && product.category.toLowerCase().includes(query))
    );
  });

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Search & Location Filter Bar Container */}
      <View style={styles.filterSection}>
        <TextInput
          style={styles.searchBar}
          placeholder="🔍 Search products, tools, apparel..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholderTextColor="#8E8E93"
        />
        <View style={styles.locationContainer}>
          <TextInput
            style={styles.locationInput}
            placeholder="📍 Filter by City / State (e.g. New York)"
            value={locationQuery}
            onChangeText={setLocationQuery}
            placeholderTextColor="#8E8E93"
          />
          {locationQuery.trim() !== '' && (
            <TouchableOpacity 
              style={styles.clearBtn} 
              onPress={() => setLocationQuery('')}
            >
              <Text style={styles.clearBtnText}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      ) : (
        <FlatList
          key={`grid-${numColumns}`}
          data={filteredProducts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
          numColumns={numColumns}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const isFeatured = item.featured;
            return (
              <TouchableOpacity 
                style={[
                  styles.card, 
                  isFeatured && { 
                    borderColor: '#FF9500', 
                    borderWidth: 2,
                    shadowColor: '#FF9500',
                    shadowOpacity: 0.15,
                  }
                ]} 
                activeOpacity={0.9} 
                onPress={() => navigation.navigate('ProductDetail', { productId: item.id })}
              >
                {item.imageUrl ? (
                  <Image source={{ uri: item.imageUrl }} style={styles.image} resizeMode="cover" />
                ) : (
                  <View style={styles.placeholderImage}>
                    <Text style={styles.placeholderText}>📦 Product</Text>
                  </View>
                )}
                
                {isFeatured && (
                  <View style={styles.promotedTag}>
                    <Text style={styles.promotedTagText}>🔥 Promoted ad</Text>
                  </View>
                )}

                <View style={styles.cardContent}>
                  <Text style={styles.name}>{item.name}</Text>
                  
                  {item.vendor && (
                    <View style={styles.vendorRow}>
                      <Text style={styles.vendorText}>👤 Seller: {item.vendor.name}</Text>
                      {item.vendor.address && (
                        <Text style={styles.locationText}>📍 {item.vendor.address}</Text>
                      )}
                    </View>
                  )}
                  
                  <Text style={styles.desc} numberOfLines={2}>{item.description}</Text>
                  
                  <View style={styles.footerRow}>
                    <Text style={[styles.price, { color: theme.primary }]}>
                      ${item.price.toFixed(2)}
                    </Text>
                    <TouchableOpacity 
                      style={[styles.addButton, { backgroundColor: theme.primary }]} 
                      onPress={() => handleAddToCart(item)}
                    >
                      <Text style={styles.addButtonText}>Add to Cart</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No products match your filters.</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterSection: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderBottomWidth: 1,
    borderColor: '#E5E5EA',
  },
  searchBar: {
    backgroundColor: '#F2F2F7',
    height: 44,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 15,
    color: '#1C1C1E',
    marginBottom: 10,
  },
  locationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F2F2F7',
    borderRadius: 10,
    height: 44,
    paddingHorizontal: 12,
  },
  locationInput: {
    flex: 1,
    fontSize: 14,
    color: '#1C1C1E',
  },
  clearBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#AEAEB2',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
  clearBtnText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  listContainer: {
    padding: 16,
  },
  card: {
    flex: 1,
    margin: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E5E5EA',
    position: 'relative',
  },
  image: {
    width: '100%',
    height: 180,
  },
  placeholderImage: {
    width: '100%',
    height: 180,
    backgroundColor: '#E9ECEF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    color: '#ADB5BD',
    fontSize: 16,
    fontWeight: 'bold',
  },
  promotedTag: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: '#FF9500',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  promotedTagText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  cardContent: {
    padding: 16,
  },
  name: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1C1C1E',
    marginBottom: 6,
  },
  vendorRow: {
    marginBottom: 8,
  },
  vendorText: {
    fontSize: 12,
    color: '#5856D6',
    fontWeight: '600',
  },
  locationText: {
    fontSize: 11,
    color: '#8E8E93',
    marginTop: 2,
  },
  desc: {
    color: '#8E8E93',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 16,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  price: {
    fontSize: 22,
    fontWeight: '800',
  },
  addButton: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 40,
  },
  emptyText: {
    fontSize: 15,
    color: '#8E8E93',
    textAlign: 'center',
  },
});
