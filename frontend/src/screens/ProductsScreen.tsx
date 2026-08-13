import React, { useEffect, useState, useContext } from 'react';
import {
  View, Text, FlatList, StyleSheet, ActivityIndicator,
  Image, TouchableOpacity, TextInput, useWindowDimensions, Platform,
} from 'react-native';
import apiClient from '../api/client';
import { CartContext } from '../context/CartContext';
import { SettingsContext } from '../context/SettingsContext';
import { useCurrency } from '../context/CurrencyContext';
import AddToCartModal from '../components/AddToCartModal';
import FloatingCartBar from '../components/FloatingCartBar';

const CATEGORY_ICONS: Record<string, string> = {
  tools: '🔧', electronics: '💡', clothing: '👕',
  furniture: '🪑', food: '🍱', health: '💊',
  sports: '⚽', books: '📚', default: '📦',
};

export default function ProductsScreen({ navigation }: any) {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [locationQuery, setLocationQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [addedItem, setAddedItem] = useState<any | null>(null);
  const [searchFocused, setSearchFocused] = useState(false);

  const { cart, addToCart } = useContext(CartContext);
  const { theme, colorMode } = useContext(SettingsContext);
  const { fmt } = useCurrency();
  const { width } = useWindowDimensions();

  const isDark = colorMode === 'dark';
  const numColumns = width >= 1200 ? 4 : width >= 768 ? 3 : 2;
  const imageH = width >= 1200 ? 160 : width >= 768 ? 140 : 120;

  const totalCartCount = cart.reduce((s, i) => s + i.quantity, 0);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      let url = '/products';
      if (locationQuery.trim()) url += `?location=${encodeURIComponent(locationQuery.trim())}`;
      const res = await apiClient.get(url);
      setProducts(res.data);
    } catch (e) {
      console.error('Failed to fetch products', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchProducts(); }, [locationQuery]);

  const categories = ['All', ...Array.from(new Set(products.map((p: any) => p.category).filter(Boolean)))];

  const filteredProducts = products.filter(p => {
    const q = searchQuery.toLowerCase();
    const matchSearch = !q || p.name.toLowerCase().includes(q) ||
      (p.description && p.description.toLowerCase().includes(q)) ||
      (p.category && p.category.toLowerCase().includes(q));
    const matchCat = selectedCategory === 'All' || p.category === selectedCategory;
    return matchSearch && matchCat;
  });

  const handleAddToCart = (product: any) => {
    addToCart({ id: product.id, name: product.name, price: product.price, type: 'product' });
    setAddedItem(product);
  };

  const renderProduct = ({ item }: any) => {
    const isFeatured = item.featured;
    const isNew = item.isNew || item.new ||
      (item.createdAt && Date.now() - new Date(item.createdAt).getTime() < 14 * 24 * 60 * 60 * 1000);
    const catKey = (item.category || '').toLowerCase();
    const catIcon = CATEGORY_ICONS[catKey] || CATEGORY_ICONS.default;

    return (
      <TouchableOpacity
        style={[
          styles.card,
          { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderColor: isFeatured ? '#F59E0B' : (isDark ? '#334155' : '#E2E8F0') },
          isFeatured && { borderWidth: 2, shadowColor: '#F59E0B', shadowOpacity: 0.2 },
        ]}
        activeOpacity={0.88}
        onPress={() => navigation.navigate('ProductDetail', { productId: item.id })}
      >
        {/* Image */}
        {item.imageUrl ? (
          <Image source={{ uri: item.imageUrl }} style={[styles.cardImage, { height: imageH }]} resizeMode="cover" />
        ) : (
          <View style={[styles.cardImagePlaceholder, { height: imageH, backgroundColor: isDark ? '#334155' : '#F1F5F9' }]}>
            <Text style={styles.cardPlaceholderIcon}>{catIcon}</Text>
          </View>
        )}

        {/* Badges */}
        <View style={styles.badgeRow}>
          {isFeatured && (
            <View style={styles.featuredBadge}>
              <Text style={styles.featuredBadgeText}>🔥 HOT</Text>
            </View>
          )}
          {isNew && !isFeatured && (
            <View style={styles.newBadge}>
              <Text style={styles.newBadgeText}>✨ NEW</Text>
            </View>
          )}
        </View>

        {/* Body */}
        <View style={styles.cardBody}>
          {item.category && (
            <Text style={[styles.cardCat, { color: isDark ? '#64748B' : '#94A3B8' }]} numberOfLines={1}>
              {catIcon} {item.category}
            </Text>
          )}
          <Text style={[styles.cardName, { color: isDark ? '#F1F5F9' : '#0F172A' }]} numberOfLines={2}>
            {item.name}
          </Text>
          {item.vendor && (
            <Text style={[styles.cardVendor, { color: isDark ? '#475569' : '#94A3B8' }]} numberOfLines={1}>
              👤 {item.vendor.name}{item.vendor.address ? ` · 📍 ${item.vendor.address}` : ''}
            </Text>
          )}

          {/* Price + CTA */}
          <View style={styles.cardFooter}>
            <Text style={[styles.cardPrice, { color: theme.primary }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
              {fmt(item.price)}
            </Text>
            <TouchableOpacity
              style={[styles.addBtn, { backgroundColor: theme.primary }]}
              onPress={() => handleAddToCart(item)}
              activeOpacity={0.82}
            >
              <Text style={styles.addBtnText}>{numColumns === 2 ? '+ Cart' : '+ Add'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <AddToCartModal
        visible={addedItem !== null}
        item={addedItem}
        cartCount={totalCartCount}
        themePrimary={theme.primary}
        onContinueShopping={() => setAddedItem(null)}
        onProceedToCheckout={() => { setAddedItem(null); navigation.navigate('CartTab'); }}
      />

      {/* ── Sticky Header ─────────────────────────────────────────────────── */}
      <View style={[styles.header, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderBottomColor: isDark ? '#334155' : '#E2E8F0' }]}>
        {/* Page Title Row */}
        <View style={styles.titleRow}>
          <View>
            <Text style={[styles.pageTitle, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>🛍️ Products</Text>
            <Text style={[styles.pageSubtitle, { color: isDark ? '#64748B' : '#94A3B8' }]}>
              {loading ? 'Loading...' : `${filteredProducts.length} item${filteredProducts.length !== 1 ? 's' : ''} available`}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.cartIndicator, { backgroundColor: theme.primary + '18', borderColor: theme.primary + '40' }]}
            onPress={() => navigation.navigate('CartTab')}
          >
            <Text style={styles.cartIndicatorIcon}>🛒</Text>
            {totalCartCount > 0 && (
              <View style={[styles.cartBadge, { backgroundColor: theme.primary }]}>
                <Text style={styles.cartBadgeText}>{totalCartCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Search bar */}
        <View style={[
          styles.searchRow,
          { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderColor: searchFocused ? theme.primary : (isDark ? '#334155' : '#E2E8F0') },
        ]}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={[styles.searchInput, { color: isDark ? '#F1F5F9' : '#0F172A' }]}
            placeholder="Search products, tools, apparel..."
            placeholderTextColor={isDark ? '#475569' : '#94A3B8'}
            value={searchQuery}
            onChangeText={setSearchQuery}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.searchClear}>
              <Text style={[styles.searchClearText, { color: isDark ? '#64748B' : '#94A3B8' }]}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Location filter */}
        <View style={[styles.locationRow, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderColor: isDark ? '#334155' : '#E2E8F0' }]}>
          <Text style={styles.searchIcon}>📍</Text>
          <TextInput
            style={[styles.searchInput, { color: isDark ? '#F1F5F9' : '#0F172A' }]}
            placeholder="Filter by City / State..."
            placeholderTextColor={isDark ? '#475569' : '#94A3B8'}
            value={locationQuery}
            onChangeText={setLocationQuery}
          />
          {locationQuery.length > 0 && (
            <TouchableOpacity onPress={() => setLocationQuery('')} style={styles.searchClear}>
              <Text style={[styles.searchClearText, { color: isDark ? '#64748B' : '#94A3B8' }]}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Category pills */}
        <FlatList
          data={categories}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={c => c}
          contentContainerStyle={styles.pillList}
          renderItem={({ item }) => {
            const active = selectedCategory === item;
            return (
              <TouchableOpacity
                style={[
                  styles.pill,
                  { backgroundColor: active ? theme.primary : (isDark ? '#0F172A' : '#F1F5F9'), borderColor: active ? theme.primary : (isDark ? '#334155' : '#E2E8F0') }
                ]}
                onPress={() => setSelectedCategory(item)}
              >
                <Text style={[styles.pillText, { color: active ? '#FFF' : (isDark ? '#94A3B8' : '#64748B') }]}>
                  {item}
                </Text>
              </TouchableOpacity>
            );
          }}
        />
      </View>

      {/* ── Product Grid ───────────────────────────────────────────────────── */}
      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.loadingText, { color: isDark ? '#64748B' : '#94A3B8' }]}>Loading products...</Text>
        </View>
      ) : (
        <FlatList
          key={`grid-${numColumns}`}
          data={filteredProducts}
          keyExtractor={i => i.id}
          numColumns={numColumns}
          contentContainerStyle={[styles.gridContainer, { paddingBottom: 110 }]}
          showsVerticalScrollIndicator={false}
          renderItem={renderProduct}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyIcon}>🔍</Text>
              <Text style={[styles.emptyTitle, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>No products found</Text>
              <Text style={[styles.emptySub, { color: isDark ? '#64748B' : '#94A3B8' }]}>Try adjusting your search or filters</Text>
              <TouchableOpacity
                style={[styles.emptyReset, { backgroundColor: theme.primary }]}
                onPress={() => { setSearchQuery(''); setLocationQuery(''); setSelectedCategory('All'); }}
              >
                <Text style={styles.emptyResetText}>Clear Filters</Text>
              </TouchableOpacity>
            </View>
          }
          columnWrapperStyle={numColumns > 1 ? { gap: 0 } : undefined}
        />
      )}

      <FloatingCartBar />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  // Header
  header: {
    borderBottomWidth: 1,
    paddingTop: Platform.OS === 'ios' ? 4 : 0,
    paddingBottom: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
  },
  pageTitle: { fontSize: 22, fontWeight: '900', letterSpacing: -0.5 },
  pageSubtitle: { fontSize: 12, marginTop: 2, fontWeight: '500' },

  cartIndicator: {
    width: 42, height: 42, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, position: 'relative',
  },
  cartIndicatorIcon: { fontSize: 18 },
  cartBadge: {
    position: 'absolute', top: -4, right: -4,
    width: 18, height: 18, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
  },
  cartBadgeText: { color: '#FFF', fontSize: 10, fontWeight: '800' },

  searchRow: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 16, marginBottom: 8,
    borderRadius: 12, borderWidth: 1.5,
    paddingHorizontal: 12, paddingVertical: Platform.OS === 'ios' ? 10 : 2,
  },
  locationRow: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 16, marginBottom: 10,
    borderRadius: 12, borderWidth: 1.5,
    paddingHorizontal: 12, paddingVertical: Platform.OS === 'ios' ? 10 : 2,
  },
  searchIcon: { fontSize: 15, marginRight: 8 },
  searchInput: { flex: 1, fontSize: 14, fontWeight: '500', paddingVertical: 8 },
  searchClear: { padding: 6 },
  searchClearText: { fontSize: 13, fontWeight: '700' },

  pillList: { paddingHorizontal: 16, paddingBottom: 4, gap: 6 },
  pill: {
    paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1,
  },
  pillText: { fontSize: 13, fontWeight: '700' },

  // Loading
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { fontSize: 13, fontWeight: '500' },

  // Grid
  gridContainer: { padding: 10 },

  // Card
  card: {
    flex: 1, margin: 6, borderRadius: 16, borderWidth: 1,
    overflow: 'hidden', minWidth: 0, position: 'relative',
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.07, shadowRadius: 10, elevation: 3,
  },
  cardImage: { width: '100%' },
  cardImagePlaceholder: {
    width: '100%', alignItems: 'center', justifyContent: 'center',
  },
  cardPlaceholderIcon: { fontSize: 32 },
  badgeRow: { position: 'absolute', top: 8, left: 8, flexDirection: 'row', gap: 4 },
  featuredBadge: {
    backgroundColor: '#EF4444', paddingHorizontal: 7, paddingVertical: 3,
    borderRadius: 6, elevation: 2,
  },
  featuredBadgeText: { color: '#FFF', fontSize: 8, fontWeight: '800' },
  newBadge: {
    backgroundColor: '#22C55E', paddingHorizontal: 7, paddingVertical: 3,
    borderRadius: 6, elevation: 2,
  },
  newBadgeText: { color: '#FFF', fontSize: 8, fontWeight: '800' },

  cardBody: { padding: 10 },
  cardCat: { fontSize: 10, fontWeight: '700', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.3 },
  cardName: { fontSize: 13, fontWeight: '800', lineHeight: 18, marginBottom: 4 },
  cardVendor: { fontSize: 10, marginBottom: 8 },
  cardFooter: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', gap: 6, marginTop: 2,
  },
  cardPrice: { fontSize: 15, fontWeight: '900', flexShrink: 1 },
  addBtn: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, flexShrink: 0 },
  addBtnText: { color: '#FFF', fontSize: 11, fontWeight: '800' },

  // Empty
  emptyWrap: { alignItems: 'center', justifyContent: 'center', paddingTop: 60, paddingHorizontal: 32 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '800', marginBottom: 6 },
  emptySub: { fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  emptyReset: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  emptyResetText: { color: '#FFF', fontWeight: '700', fontSize: 14 },
});
