import React, { useEffect, useState, useContext } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Image,
  TouchableOpacity,
  TextInput,
  useWindowDimensions,
} from 'react-native';
import apiClient from '../api/client';
import { CartContext } from '../context/CartContext';
import { SettingsContext } from '../context/SettingsContext';
import { useCurrency } from '../context/CurrencyContext';
import AddToCartModal from '../components/AddToCartModal';

export default function ProductsScreen({ navigation }: any) {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [locationQuery, setLocationQuery] = useState('');
  const [addedItem, setAddedItem] = useState<any | null>(null);

  const { cart, addToCart } = useContext(CartContext);
  const { theme } = useContext(SettingsContext);
  const { fmt } = useCurrency();
  const { width } = useWindowDimensions();
  const numColumns = width >= 1024 ? 4 : width >= 600 ? 3 : 2;

  // Responsive sizing helpers
  const isTwoCol = numColumns === 2;
  const isNarrow = numColumns >= 3;
  const imageHeight = width >= 1024 ? 140 : width >= 600 ? 120 : 110;
  const cardPadding = isTwoCol ? 10 : 12;
  const nameFontSize = isTwoCol ? 13 : isNarrow ? 13 : 15;
  const descFontSize = isTwoCol ? 11 : 12;
  const priceFontSize = isTwoCol ? 14 : 16;
  const btnFontSize = isTwoCol ? 10 : 12;
  const btnPaddingH = isTwoCol ? 8 : 12;
  const btnPaddingV = isTwoCol ? 6 : 8;
  const vendorFontSize = isTwoCol ? 10 : 11;
  const locationFontSize = isTwoCol ? 9 : 10;

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
  }, [locationQuery]);

  const handleAddToCart = (product: any) => {
    addToCart({
      id: product.id,
      name: product.name,
      price: product.price,
      type: 'product',
    });
    setAddedItem(product);
  };

  const totalCartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

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
      <AddToCartModal
        visible={addedItem !== null}
        item={addedItem}
        cartCount={totalCartCount}
        themePrimary={theme.primary}
        onContinueShopping={() => setAddedItem(null)}
        onProceedToCheckout={() => {
          setAddedItem(null);
          navigation.navigate('CartTab');
        }}
      />

      {/* Filter Bar */}
      <View style={[styles.filterSection, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <TextInput
          style={[styles.searchBar, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
          placeholder="🔍 Search products, tools, apparel..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholderTextColor="#8E8E93"
        />
        <View style={[styles.locationContainer, { backgroundColor: theme.background, borderColor: theme.border }]}>
          <TextInput
            style={[styles.locationInput, { color: theme.text }]}
            placeholder="📍 Filter by City / State"
            value={locationQuery}
            onChangeText={setLocationQuery}
            placeholderTextColor="#8E8E93"
          />
          {locationQuery.trim() !== '' && (
            <TouchableOpacity style={styles.clearBtn} onPress={() => setLocationQuery('')}>
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
          key={`products-grid-${numColumns}`}
          data={filteredProducts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
          numColumns={numColumns}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const isFeatured = item.featured;
            const createdTime = item.createdAt ? new Date(item.createdAt).getTime() : 0;
            const isNewItem =
              item.isNew ||
              item.new ||
              (createdTime > 0 && Date.now() - createdTime < 14 * 24 * 60 * 60 * 1000);

            return (
              <TouchableOpacity
                style={[
                  styles.card,
                  {
                    backgroundColor: theme.card,
                    borderColor: isFeatured ? '#FF9500' : theme.border,
                    borderWidth: isFeatured ? 2 : 1,
                  },
                  isFeatured && { shadowColor: '#FF9500', shadowOpacity: 0.18 },
                ]}
                activeOpacity={0.9}
                onPress={() => navigation.navigate('ProductDetail', { productId: item.id })}
              >
                {/* Image */}
                {item.imageUrl ? (
                  <Image
                    source={{ uri: item.imageUrl }}
                    style={[styles.image, { height: imageHeight }]}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={[styles.placeholderImage, { height: imageHeight, backgroundColor: theme.border }]}>
                    <Text style={styles.placeholderText}>📦</Text>
                  </View>
                )}

                {/* Badge */}
                {isFeatured ? (
                  <View style={styles.promotedTag}>
                    <Text style={styles.promotedTagText}>🔥 Promoted</Text>
                  </View>
                ) : isNewItem ? (
                  <View style={styles.newTag}>
                    <Text style={styles.newTagText}>✨ NEW</Text>
                  </View>
                ) : null}

                {/* Content */}
                <View style={{ padding: cardPadding }}>
                  <Text
                    style={[styles.name, { fontSize: nameFontSize, color: theme.text }]}
                    numberOfLines={2}
                    ellipsizeMode="tail"
                  >
                    {item.name}
                  </Text>

                  {item.vendor && (
                    <View style={styles.vendorRow}>
                      <Text
                        style={[styles.vendorText, { fontSize: vendorFontSize }]}
                        numberOfLines={1}
                        ellipsizeMode="tail"
                      >
                        👤 {item.vendor.name}
                      </Text>
                      {item.vendor.address && (
                        <Text
                          style={[styles.locationText, { fontSize: locationFontSize }]}
                          numberOfLines={1}
                          ellipsizeMode="tail"
                        >
                          📍 {item.vendor.address}
                        </Text>
                      )}
                    </View>
                  )}

                  <Text
                    style={[styles.desc, { fontSize: descFontSize }]}
                    numberOfLines={2}
                    ellipsizeMode="tail"
                  >
                    {item.description}
                  </Text>

                  {/* Price + Button */}
                  <View style={styles.footerRow}>
                    <Text
                      style={[styles.price, { fontSize: priceFontSize, color: theme.primary }]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.7}
                    >
                      {fmt(item.price)}
                    </Text>
                    <TouchableOpacity
                      style={[
                        styles.addButton,
                        {
                          backgroundColor: theme.primary,
                          paddingHorizontal: btnPaddingH,
                          paddingVertical: btnPaddingV,
                        },
                      ]}
                      onPress={() => handleAddToCart(item)}
                    >
                      <Text style={[styles.addButtonText, { fontSize: btnFontSize }]}>
                        {isTwoCol ? '+ Cart' : 'Add to Cart'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={[styles.emptyText, { color: theme.text }]}>
                No products match your filters.
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  filterSection: {
    padding: 12,
    borderBottomWidth: 1,
  },
  searchBar: {
    height: 42,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 14,
    marginBottom: 8,
    borderWidth: 1,
  },
  locationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    height: 40,
    paddingHorizontal: 12,
    borderWidth: 1,
  },
  locationInput: { flex: 1, fontSize: 13 },
  clearBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#AEAEB2',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
  clearBtnText: { color: '#FFFFFF', fontSize: 9, fontWeight: '700' },
  listContainer: { padding: 6 },
  card: {
    flex: 1,
    margin: 5,
    borderRadius: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
    overflow: 'hidden',
    minWidth: 0,        // critical: prevents flex children from overflowing
    position: 'relative',
  },
  image: { width: '100%' },
  placeholderImage: { width: '100%', justifyContent: 'center', alignItems: 'center' },
  placeholderText: { fontSize: 24 },
  promotedTag: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: '#FF9500',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
    elevation: 2,
    zIndex: 10,
  },
  promotedTagText: { color: '#FFFFFF', fontSize: 9, fontWeight: '800', textTransform: 'uppercase' },
  newTag: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: '#22C55E',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
    zIndex: 10,
    elevation: 3,
  },
  newTagText: { color: '#FFFFFF', fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  name: {
    fontWeight: '700',
    marginBottom: 4,
    lineHeight: 18,
  },
  vendorRow: { marginBottom: 4 },
  vendorText: { color: '#5856D6', fontWeight: '600' },
  locationText: { color: '#8E8E93', marginTop: 1 },
  desc: { color: '#8E8E93', lineHeight: 16, marginBottom: 8 },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
    flexWrap: 'nowrap',
  },
  price: {
    fontWeight: '800',
    flexShrink: 1,
    flexGrow: 0,
  },
  addButton: {
    borderRadius: 7,
    flexShrink: 0,
  },
  addButtonText: { color: '#FFFFFF', fontWeight: '700' },
  emptyContainer: { alignItems: 'center', paddingTop: 40 },
  emptyText: { fontSize: 15, textAlign: 'center' },
});
