import React, { useEffect, useState, useContext } from 'react';
import {
  View, Text, FlatList, StyleSheet, ActivityIndicator,
  Image, TouchableOpacity, TextInput, useWindowDimensions, Platform,
} from 'react-native';
import apiClient, { getImageUri } from '../api/client';
import { CartContext } from '../context/CartContext';
import { SettingsContext } from '../context/SettingsContext';
import { useCurrency } from '../context/CurrencyContext';
import AddToCartModal from '../components/AddToCartModal';
import FloatingCartBar from '../components/FloatingCartBar';
import ImageViewerModal from '../components/ImageViewerModal';

const CATEGORY_ICONS: Record<string, string> = {
  tools: '🔧', electronics: '💡', clothing: '👕',
  furniture: '🪑', food: '🍱', health: '💊',
  sports: '⚽', books: '📚', plumbing: '🚿',
  electrical: '⚡', carpentry: '🪚', painting: '🖌️',
  cleaning: '🧹', hvac: '❄️', general: '🛠️', default: '📦',
};

type SearchTab = 'ALL' | 'PRODUCTS' | 'SERVICES';

export default function ProductsScreen({ navigation, route }: any) {
  const initialSearch = route?.params?.search || '';

  const [products, setProducts] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<SearchTab>('ALL');
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [locationQuery, setLocationQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [addedItem, setAddedItem] = useState<any | null>(null);
  const [previewImage, setPreviewImage] = useState<any | null>(null);
  const [searchFocused, setSearchFocused] = useState(false);

  const { cart, addToCart } = useContext(CartContext);
  const { theme, colorMode } = useContext(SettingsContext);
  const { fmt } = useCurrency();
  const { width } = useWindowDimensions();

  const isDark = colorMode === 'dark';
  const numColumns = width >= 1200 ? 4 : width >= 768 ? 3 : 2;
  const imageH = width >= 1200 ? 160 : width >= 768 ? 140 : 120;

  const totalCartCount = cart.reduce((s, i) => s + i.quantity, 0);

  // Sync route param changes (e.g. from Home search)
  useEffect(() => {
    if (route?.params?.search !== undefined) {
      setSearchQuery(route.params.search);
    }
  }, [route?.params?.search]);

  const fetchData = async () => {
    try {
      setLoading(true);
      let prodUrl = '/products';
      if (locationQuery.trim()) prodUrl += `?location=${encodeURIComponent(locationQuery.trim())}`;
      
      const [prodRes, servRes] = await Promise.all([
        apiClient.get(prodUrl),
        apiClient.get('/services'),
      ]);

      setProducts(Array.isArray(prodRes.data) ? prodRes.data : []);
      setServices(Array.isArray(servRes.data) ? servRes.data : []);
    } catch (e) {
      console.error('Failed to fetch products and services', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [locationQuery]);

  // Unified Filtering
  const q = searchQuery.toLowerCase().trim();

  const filteredProducts = products.filter(p => {
    const matchSearch = !q ||
      (p.name && p.name.toLowerCase().includes(q)) ||
      (p.description && p.description.toLowerCase().includes(q)) ||
      (p.category && p.category.toLowerCase().includes(q)) ||
      (p.vendor?.name && p.vendor.name.toLowerCase().includes(q));
    const matchCat = selectedCategory === 'All' || p.category === selectedCategory;
    return matchSearch && matchCat;
  });

  const filteredServices = services.filter(s => {
    const matchSearch = !q ||
      (s.name && s.name.toLowerCase().includes(q)) ||
      (s.description && s.description.toLowerCase().includes(q)) ||
      (s.category && s.category.toLowerCase().includes(q));
    const matchCat = selectedCategory === 'All' || s.category === selectedCategory;
    return matchSearch && matchCat;
  });

  // Dynamic Categories based on active tab
  const activeCategories = [
    'All',
    ...Array.from(
      new Set(
        (activeTab === 'SERVICES'
          ? services.map((s: any) => s.category)
          : activeTab === 'PRODUCTS'
          ? products.map((p: any) => p.category)
          : [...products.map((p: any) => p.category), ...services.map((s: any) => s.category)]
        ).filter(Boolean)
      )
    ),
  ];

  // Combined Results List
  const combinedItems: any[] = [];
  if (activeTab === 'ALL' || activeTab === 'PRODUCTS') {
    filteredProducts.forEach(p => combinedItems.push({ ...p, itemType: 'product' }));
  }
  if (activeTab === 'ALL' || activeTab === 'SERVICES') {
    filteredServices.forEach(s => combinedItems.push({ ...s, itemType: 'service' }));
  }

  // Prioritize Boosted / Featured listings
  combinedItems.sort((a, b) => {
    const aBoost = a.featured ? 1 : 0;
    const bBoost = b.featured ? 1 : 0;
    return bBoost - aBoost;
  });

  const handleAddToCart = (product: any) => {
    addToCart({ id: product.id, name: product.name, price: product.price, type: 'product' });
    setAddedItem(product);
  };

  const handleBookService = (service: any) => {
    navigation.navigate('BookingSetup', { service });
  };

  const renderCard = ({ item }: any) => {
    const isService = item.itemType === 'service';
    const isFeatured = !!item.featured;
    const isNew = !isService && (item.isNew || item.new ||
      (item.createdAt && Date.now() - new Date(item.createdAt).getTime() < 14 * 24 * 60 * 60 * 1000));
    
    const catKey = (item.category || '').toLowerCase();
    const catIcon = CATEGORY_ICONS[catKey] || CATEGORY_ICONS.default;

    const rawImgUrl = isService ? item.imageUrl : (item.images?.[0]?.url || item.imageUrl);
    const resolvedImageUri = rawImgUrl ? (getImageUri(rawImgUrl) || rawImgUrl) : null;

    if (isService) {
      // ── Service Card ────────────────────────────────────────────────────────
      return (
        <TouchableOpacity
          style={[
            styles.card,
            { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderColor: isFeatured ? '#F59E0B' : (isDark ? '#334155' : '#E2E8F0') },
            isFeatured && { borderWidth: 2, shadowColor: '#F59E0B', shadowOpacity: 0.25 },
          ]}
          activeOpacity={0.88}
          onPress={() => handleBookService(item)}
        >
          {/* Cover Image / Placeholder */}
          {resolvedImageUri ? (
            <View style={{ position: 'relative' }}>
              <Image source={{ uri: resolvedImageUri }} style={[styles.cardImage, { height: imageH }]} resizeMode="cover" />
              <View style={[styles.typeTag, { backgroundColor: '#3B82F6' }]}>
                <Text style={styles.typeTagText}>⚡ SERVICE</Text>
              </View>
            </View>
          ) : (
            <View style={[styles.cardImagePlaceholder, { height: imageH, backgroundColor: isDark ? '#1E3A5F' : '#EFF6FF' }]}>
              <Text style={styles.cardPlaceholderIcon}>{catIcon || '⚡'}</Text>
              <View style={[styles.typeTag, { backgroundColor: '#3B82F6' }]}>
                <Text style={styles.typeTagText}>⚡ SERVICE</Text>
              </View>
            </View>
          )}

          {/* Featured / Boost Badge */}
          {isFeatured && (
            <View style={styles.featuredBadge}>
              <Text style={styles.featuredBadgeText}>🚀 BOOSTED</Text>
            </View>
          )}

          {/* Details */}
          <View style={styles.cardBody}>
            {item.category && (
              <Text style={[styles.cardCat, { color: '#3B82F6' }]} numberOfLines={1}>
                {catIcon} {item.category}
              </Text>
            )}
            <Text style={[styles.cardName, { color: isDark ? '#F1F5F9' : '#0F172A' }]} numberOfLines={2}>
              {item.name}
            </Text>
            {item.description ? (
              <Text style={[styles.cardDesc, { color: isDark ? '#64748B' : '#94A3B8' }]} numberOfLines={2}>
                {item.description}
              </Text>
            ) : null}

            {/* Price & Book Action */}
            <View style={styles.cardFooter}>
              <View>
                <Text style={[styles.cardPrice, { color: '#3B82F6' }]} numberOfLines={1}>
                  {fmt(item.basePrice || 0)}
                  <Text style={{ fontSize: 10, fontWeight: '600', color: isDark ? '#64748B' : '#94A3B8' }}>/hr</Text>
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.serviceBookBtn, { backgroundColor: '#3B82F6' }]}
                onPress={() => handleBookService(item)}
                activeOpacity={0.82}
              >
                <Text style={styles.serviceBookBtnText}>⚡ Book</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      );
    }

    // ── Product Card ──────────────────────────────────────────────────────────
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
        {/* Image with Direct Tap to View Fullscreen */}
        {resolvedImageUri ? (
          <TouchableOpacity
            style={{ position: 'relative' }}
            activeOpacity={0.9}
            onPress={(e) => {
              e.stopPropagation();
              setPreviewImage(item);
            }}
          >
            <Image source={{ uri: resolvedImageUri }} style={[styles.cardImage, { height: imageH }]} resizeMode="cover" />
            <View style={styles.imageZoomBadge}>
              <Text style={styles.imageZoomText}>🔍</Text>
            </View>
            <View style={[styles.typeTag, { backgroundColor: '#F59E0B' }]}>
              <Text style={styles.typeTagText}>📦 PRODUCT</Text>
            </View>
          </TouchableOpacity>
        ) : (
          <View style={[styles.cardImagePlaceholder, { height: imageH, backgroundColor: isDark ? '#334155' : '#F1F5F9' }]}>
            <Text style={styles.cardPlaceholderIcon}>{catIcon}</Text>
            <View style={[styles.typeTag, { backgroundColor: '#F59E0B' }]}>
              <Text style={styles.typeTagText}>📦 PRODUCT</Text>
            </View>
          </View>
        )}

        {/* Badges */}
        <View style={styles.badgeRow}>
          {isFeatured && (
            <View style={styles.featuredBadge}>
              <Text style={styles.featuredBadgeText}>🚀 BOOSTED</Text>
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
              🏪 {item.vendor.name}{item.vendor.address ? ` · 📍 ${item.vendor.address}` : ''}
            </Text>
          )}

          {/* Price + Add to Cart */}
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

      <ImageViewerModal
        visible={previewImage !== null}
        imageUrl={previewImage?.images?.[0]?.url || previewImage?.imageUrl}
        title={previewImage?.name}
        subtitle={previewImage?.category}
        price={previewImage ? fmt(previewImage.price) : undefined}
        onClose={() => setPreviewImage(null)}
      />

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <View style={[styles.header, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderBottomColor: isDark ? '#334155' : '#E2E8F0' }]}>
        {/* Page Title Row */}
        <View style={styles.titleRow}>
          <View>
            <Text style={[styles.pageTitle, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>🔍 Search Marketplace</Text>
            <Text style={[styles.pageSubtitle, { color: isDark ? '#64748B' : '#94A3B8' }]}>
              {loading ? 'Loading listings...' : `${combinedItems.length} result${combinedItems.length !== 1 ? 's' : ''} available`}
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

        {/* Search Bar */}
        <View style={[
          styles.searchRow,
          { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderColor: searchFocused ? theme.primary : (isDark ? '#334155' : '#E2E8F0') },
        ]}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={[styles.searchInput, { color: isDark ? '#F1F5F9' : '#0F172A' }]}
            placeholder="Search products, services, tools, artisans..."
            placeholderTextColor={isDark ? '#475569' : '#94A3B8'}
            value={searchQuery}
            onChangeText={setSearchQuery}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.searchClear}>
              <Text style={[styles.searchClearText, { color: isDark ? '#64748B' : '#94A3B8' }]}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Location Filter */}
        <View style={[styles.locationRow, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderColor: isDark ? '#334155' : '#E2E8F0' }]}>
          <Text style={styles.searchIcon}>📍</Text>
          <TextInput
            style={[styles.searchInput, { color: isDark ? '#F1F5F9' : '#0F172A' }]}
            placeholder="Filter by City / State / Location..."
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

        {/* Segmented Filter Tabs: All | Products | Services */}
        <View style={styles.tabSegmentContainer}>
          <TouchableOpacity
            style={[
              styles.tabSegment,
              activeTab === 'ALL' && { backgroundColor: theme.primary },
              { borderColor: activeTab === 'ALL' ? theme.primary : (isDark ? '#334155' : '#CBD5E1') }
            ]}
            onPress={() => { setActiveTab('ALL'); setSelectedCategory('All'); }}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabSegmentText, { color: activeTab === 'ALL' ? '#FFF' : (isDark ? '#94A3B8' : '#475569') }]}>
              🛍️ All ({filteredProducts.length + filteredServices.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.tabSegment,
              activeTab === 'PRODUCTS' && { backgroundColor: theme.primary },
              { borderColor: activeTab === 'PRODUCTS' ? theme.primary : (isDark ? '#334155' : '#CBD5E1') }
            ]}
            onPress={() => { setActiveTab('PRODUCTS'); setSelectedCategory('All'); }}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabSegmentText, { color: activeTab === 'PRODUCTS' ? '#FFF' : (isDark ? '#94A3B8' : '#475569') }]}>
              📦 Products ({filteredProducts.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.tabSegment,
              activeTab === 'SERVICES' && { backgroundColor: '#3B82F6' },
              { borderColor: activeTab === 'SERVICES' ? '#3B82F6' : (isDark ? '#334155' : '#CBD5E1') }
            ]}
            onPress={() => { setActiveTab('SERVICES'); setSelectedCategory('All'); }}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabSegmentText, { color: activeTab === 'SERVICES' ? '#FFF' : (isDark ? '#94A3B8' : '#475569') }]}>
              ⚡ Services ({filteredServices.length})
            </Text>
          </TouchableOpacity>
        </View>

        {/* Category Pills */}
        <FlatList
          data={activeCategories}
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

      {/* ── Search Results Grid ─────────────────────────────────────────────── */}
      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.loadingText, { color: isDark ? '#64748B' : '#94A3B8' }]}>Searching marketplace...</Text>
        </View>
      ) : (
        <FlatList
          key={`grid-${numColumns}`}
          data={combinedItems}
          keyExtractor={(item, index) => `${item.itemType}-${item.id || index}`}
          numColumns={numColumns}
          contentContainerStyle={[styles.gridContainer, { paddingBottom: 110 }]}
          showsVerticalScrollIndicator={false}
          renderItem={renderCard}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyIcon}>🔍</Text>
              <Text style={[styles.emptyTitle, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>
                {searchQuery ? `No results for "${searchQuery}"` : 'No items found'}
              </Text>
              <Text style={[styles.emptySub, { color: isDark ? '#64748B' : '#94A3B8' }]}>
                Try searching for general terms like plumbing, tools, electrical, or clearing your filters.
              </Text>
              <TouchableOpacity
                style={[styles.emptyReset, { backgroundColor: theme.primary }]}
                onPress={() => { setSearchQuery(''); setLocationQuery(''); setSelectedCategory('All'); setActiveTab('ALL'); }}
              >
                <Text style={styles.emptyResetText}>Clear All Filters</Text>
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
    marginHorizontal: 16, marginBottom: 8,
    borderRadius: 12, borderWidth: 1.5,
    paddingHorizontal: 12, paddingVertical: Platform.OS === 'ios' ? 10 : 2,
  },
  searchIcon: { fontSize: 15, marginRight: 8 },
  searchInput: { flex: 1, fontSize: 14, fontWeight: '500', paddingVertical: 8 },
  searchClear: { padding: 6 },
  searchClearText: { fontSize: 13, fontWeight: '700' },

  // Tab Segment
  tabSegmentContainer: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 10,
    gap: 8,
  },
  tabSegment: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabSegmentText: {
    fontSize: 11,
    fontWeight: '800',
  },

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
  typeTag: {
    position: 'absolute',
    top: 8,
    right: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  typeTagText: {
    color: '#FFF',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  imageZoomBadge: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.55)',
    width: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageZoomText: {
    fontSize: 12,
  },
  badgeRow: { position: 'absolute', top: 8, left: 8, flexDirection: 'row', gap: 4 },
  featuredBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: '#F59E0B',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    zIndex: 2,
  },
  featuredBadgeText: { color: '#FFF', fontSize: 8, fontWeight: '900' },
  newBadge: {
    backgroundColor: '#22C55E', paddingHorizontal: 7, paddingVertical: 3,
    borderRadius: 6, elevation: 2,
  },
  newBadgeText: { color: '#FFF', fontSize: 8, fontWeight: '800' },

  cardBody: { padding: 10 },
  cardCat: { fontSize: 10, fontWeight: '700', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.3 },
  cardName: { fontSize: 13, fontWeight: '800', lineHeight: 18, marginBottom: 4 },
  cardDesc: { fontSize: 11, lineHeight: 15, marginBottom: 6 },
  cardVendor: { fontSize: 10, marginBottom: 8 },
  cardFooter: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', gap: 6, marginTop: 2,
  },
  cardPrice: { fontSize: 15, fontWeight: '900', flexShrink: 1 },
  addBtn: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, flexShrink: 0 },
  addBtnText: { color: '#FFF', fontSize: 11, fontWeight: '800' },
  serviceBookBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, flexShrink: 0 },
  serviceBookBtnText: { color: '#FFF', fontSize: 11, fontWeight: '800' },

  // Empty
  emptyWrap: { alignItems: 'center', justifyContent: 'center', paddingTop: 60, paddingHorizontal: 32 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '800', marginBottom: 6, textAlign: 'center' },
  emptySub: { fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  emptyReset: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  emptyResetText: { color: '#FFF', fontWeight: '700', fontSize: 14 },
});
