import React, { useContext, useEffect, useState, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image, ActivityIndicator, TextInput } from 'react-native';
import { AuthContext } from '../context/AuthContext';
import { SettingsContext } from '../context/SettingsContext';
import apiClient from '../api/client';

export default function HomeScreen({ navigation }: any) {
  const { userInfo } = useContext(AuthContext);
  const { theme, logoUrl, heroTitle, heroSubtitle, footerText } = useContext(SettingsContext);

  const [promotedListings, setPromotedListings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Search states
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{ products: any[]; services: any[] } | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchDebounceRef = useRef<any>(null);

  const performSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults(null);
      return;
    }
    setSearchLoading(true);
    try {
      const [productsRes, servicesRes] = await Promise.all([
        apiClient.get(`/products?search=${encodeURIComponent(query)}`),
        apiClient.get(`/services?search=${encodeURIComponent(query)}`),
      ]);
      setSearchResults({
        products: productsRes.data.slice(0, 5),
        services: servicesRes.data.slice(0, 5),
      });
    } catch (e) {
      console.error('Search error', e);
    } finally {
      setSearchLoading(false);
    }
  }, []);

  const handleSearchChange = (text: string) => {
    setSearchQuery(text);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      performSearch(text);
    }, 400);
  };

  useEffect(() => {
    const fetchPromoted = async () => {
      try {
        setLoading(true);
        // Fetch products and services concurrently
        const [productsRes, servicesRes] = await Promise.all([
          apiClient.get('/products'),
          apiClient.get('/services')
        ]);

        const featuredProducts = productsRes.data
          .filter((p: any) => p.featured)
          .map((p: any) => ({ ...p, itemType: 'product' }));

        const featuredServices = servicesRes.data
          .filter((s: any) => s.featured)
          .map((s: any) => ({ ...s, itemType: 'service' }));

        // Mix and sort
        setPromotedListings([...featuredProducts, ...featuredServices]);
      } catch (error) {
        console.error('Failed to load promoted spotlights', error);
      } finally {
        setLoading(false);
      }
    };

    fetchPromoted();
  }, []);

  return (
    <ScrollView 
      style={[styles.container, { backgroundColor: theme.background }]} 
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {/* Dynamic Header / Logo */}
      <View style={styles.brandHeader}>
        {logoUrl ? (
          <Image source={{ uri: logoUrl }} style={styles.logoImage} resizeMode="contain" />
        ) : (
          <Text style={[styles.logoText, { color: theme.primary }]}>🛠️Akpoaza</Text>
        )}
        <TouchableOpacity 
          style={[styles.profileIndicator, { borderColor: theme.primary }]}
          onPress={() => navigation.navigate('ProfileTab')}
        >
          <Text style={styles.profileIndicatorText}>
            {userInfo?.name ? userInfo.name.charAt(0).toUpperCase() : 'G'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* 🔍 Unified Smart Search Bar */}
      <View style={[styles.searchContainer, { borderColor: searchQuery ? theme.primary : '#E5E5EA' }]}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search services, products, categories..."
          placeholderTextColor="#AEAEB2"
          value={searchQuery}
          onChangeText={handleSearchChange}
          returnKeyType="search"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity
            onPress={() => { setSearchQuery(''); setSearchResults(null); }}
            style={styles.clearBtn}
          >
            <Text style={styles.clearBtnText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Search Results Panel */}
      {(searchQuery.length > 0) && (
        <View style={[styles.searchResultsPanel, { borderColor: theme.border }]}>
          {searchLoading ? (
            <ActivityIndicator size="small" color={theme.primary} style={{ marginVertical: 16 }} />
          ) : searchResults && (searchResults.products.length > 0 || searchResults.services.length > 0) ? (
            <>
              {searchResults.services.length > 0 && (
                <View>
                  <Text style={styles.resultGroupLabel}>⚡ Services</Text>
                  {searchResults.services.map(item => (
                    <TouchableOpacity
                      key={item.id}
                      style={styles.resultRow}
                      onPress={() => {
                        setSearchQuery('');
                        setSearchResults(null);
                        navigation.navigate('Services');
                      }}
                    >
                      <View style={[styles.resultIcon, { backgroundColor: theme.primary + '15' }]}>
                        <Text style={{ fontSize: 14 }}>⚡</Text>
                      </View>
                      <View style={styles.resultInfo}>
                        <Text style={styles.resultName} numberOfLines={1}>{item.name}</Text>
                        <Text style={styles.resultMeta}>{item.category} · ${item.basePrice.toFixed(0)}/hr</Text>
                      </View>
                      <Text style={[styles.resultArrow, { color: theme.primary }]}>→</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              {searchResults.products.length > 0 && (
                <View>
                  <Text style={styles.resultGroupLabel}>📦 Products</Text>
                  {searchResults.products.map(item => (
                    <TouchableOpacity
                      key={item.id}
                      style={styles.resultRow}
                      onPress={() => {
                        setSearchQuery('');
                        setSearchResults(null);
                        navigation.navigate('ProductDetail', { productId: item.id });
                      }}
                    >
                      <View style={[styles.resultIcon, { backgroundColor: '#FF950015' }]}>
                        <Text style={{ fontSize: 14 }}>📦</Text>
                      </View>
                      <View style={styles.resultInfo}>
                        <Text style={styles.resultName} numberOfLines={1}>{item.name}</Text>
                        <Text style={styles.resultMeta}>{item.category || 'Product'} · ${item.price.toFixed(2)}</Text>
                      </View>
                      <Text style={[styles.resultArrow, { color: '#FF9500' }]}>→</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </>
          ) : (
            <Text style={styles.noResultsText}>No results found for "{searchQuery}"</Text>
          )}
        </View>
      )}

      {/* Dynamic Welcome Hero Banner */}
      <View style={[styles.welcomeBanner, { backgroundColor: theme.primary }]}>
        <View style={styles.bannerOverlay} />
        <Text style={styles.welcomeSubtitle}>Hello, {userInfo?.name || 'Guest User'} 👋</Text>
        <Text style={styles.welcomeTitle}>{heroTitle}</Text>
        <Text style={styles.bannerDesc}>{heroSubtitle}</Text>
      </View>

      {/* Dynamic Statistics Cards */}
      <View style={[styles.statsCard, { borderColor: theme.border }]}>
        <View style={styles.statsCol}>
          <Text style={[styles.statsVal, { color: theme.secondary }]}>Active</Text>
          <Text style={styles.statsLabel}>Ready to Serve</Text>
        </View>
        <View style={[styles.statsDivider, { backgroundColor: theme.border }]} />
        <View style={styles.statsCol}>
          <Text style={[styles.statsVal, { color: theme.primary }]}>24/7</Text>
          <Text style={styles.statsLabel}>Customer Care</Text>
        </View>
      </View>

      {/* Jiji Premium Spotlights Section */}
      <View style={styles.spotlightHeader}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>🔥 Premium Spotlight</Text>
        <Text style={styles.spotlightBadge}>Boosted Ads</Text>
      </View>

      {loading ? (
        <ActivityIndicator size="small" color={theme.primary} style={{ marginVertical: 20 }} />
      ) : promotedListings.length === 0 ? (
        <View style={[styles.emptySpotlightCard, { borderColor: theme.border }]}>
          <Text style={styles.emptySpotlightText}>No boosted ads today. Promoted items show here!</Text>
        </View>
      ) : (
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false} 
          contentContainerStyle={styles.carouselContainer}
        >
          {promotedListings.map((item) => (
            <TouchableOpacity
              key={`${item.itemType}-${item.id}`}
              style={[styles.spotlightCard, { borderColor: theme.border }]}
              onPress={() => {
                if (item.itemType === 'product') {
                  navigation.navigate('ProductDetail', { productId: item.id });
                } else {
                  // Navigate to the Services list — BookingSetup opens from there
                  navigation.navigate('Services');
                }
              }}
              activeOpacity={0.9}
            >
              {item.imageUrl ? (
                <Image source={{ uri: item.imageUrl }} style={styles.spotlightImage} />
              ) : (
                <View style={styles.spotlightPlaceholder}>
                  <Text style={styles.spotlightPlaceholderText}>
                    {item.itemType === 'product' ? '📦 Product' : '⚡ Service'}
                  </Text>
                </View>
              )}
              <View style={styles.spotlightPromoTag}>
                <Text style={styles.spotlightPromoTagText}>🔥 Promoted</Text>
              </View>
              <View style={styles.spotlightContent}>
                <Text style={styles.spotlightName} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.spotlightCategory}>
                  {item.category || (item.itemType === 'product' ? 'Merchandise' : 'General')}
                </Text>
                <Text style={[styles.spotlightPrice, { color: theme.primary }]}>
                  ${item.price?.toFixed(2) || item.basePrice?.toFixed(2)}
                  {item.itemType === 'service' && <Text style={styles.perHourText}>/hr base</Text>}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Grid Menu Actions */}
      <Text style={[styles.sectionTitle, { color: theme.text, marginTop: 10 }]}>Explore Services & Shop</Text>
      
      <TouchableOpacity 
        style={[styles.card, { borderLeftColor: '#FF9500', borderColor: theme.border }]} 
        onPress={() => navigation.navigate('Products')}
        activeOpacity={0.8}
      >
        <View style={styles.cardInfo}>
          <Text style={[styles.cardTitle, { color: '#FF9500' }]}>🛒 Shop</Text>
          <Text style={styles.cardDesc}>Order high-end tools, hardware supplies, and appliances.</Text>
        </View>
        <View style={styles.chevron}><Text style={styles.chevronText}>→</Text></View>
      </TouchableOpacity>

      <TouchableOpacity 
        style={[styles.card, { borderLeftColor: '#34C759', borderColor: theme.border }]} 
        onPress={() => navigation.navigate('Services')}
        activeOpacity={0.8}
      >
        <View style={styles.cardInfo}>
          <Text style={[styles.cardTitle, { color: '#34C759' }]}>⚡ Book a Handyman</Text>
          <Text style={styles.cardDesc}>Hire verified technicians for plumbing, wiring, and repairs.</Text>
        </View>
        <View style={styles.chevron}><Text style={styles.chevronText}>→</Text></View>
      </TouchableOpacity>

      {(userInfo?.role === 'ADMIN' || userInfo?.role === 'HANDYMAN') && (
        <TouchableOpacity 
          style={[styles.card, { borderLeftColor: theme.secondary, borderColor: theme.border }]} 
          onPress={() => navigation.navigate('History', { type: 'bookings', role: userInfo.role })}
          activeOpacity={0.8}
        >
          <View style={styles.cardInfo}>
            <Text style={[styles.cardTitle, { color: theme.secondary }]}>📋 Manage Bookings</Text>
            <Text style={styles.cardDesc}>
              {userInfo?.role === 'ADMIN' 
                ? 'View and manage all platform bookings and job assignments.'
                : 'View your assigned jobs, track job locations, and mark completions.'}
            </Text>
          </View>
          <View style={styles.chevron}><Text style={styles.chevronText}>→</Text></View>
        </TouchableOpacity>
      )}

      {/* Dynamic brand footer */}
      <View style={styles.footerContainer}>
        <Text style={styles.footerText}>{footerText}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    paddingVertical: 4,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  searchIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#1C1C1E',
    paddingVertical: 10,
  },
  clearBtn: {
    padding: 4,
  },
  clearBtnText: {
    fontSize: 13,
    color: '#AEAEB2',
    fontWeight: '700',
  },
  searchResultsPanel: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  resultGroupLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#8E8E93',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 4,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#F2F2F7',
  },
  resultIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  resultInfo: {
    flex: 1,
  },
  resultName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1C1C1E',
    marginBottom: 2,
  },
  resultMeta: {
    fontSize: 12,
    color: '#8E8E93',
  },
  resultArrow: {
    fontSize: 16,
    fontWeight: '800',
    marginLeft: 8,
  },
  noResultsText: {
    fontSize: 13,
    color: '#8E8E93',
    textAlign: 'center',
    paddingVertical: 20,
    paddingHorizontal: 14,
  },
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    paddingTop: 10,
  },
  brandHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    marginTop: 10,
  },
  logoImage: {
    width: 140,
    height: 38,
  },
  logoText: {
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  profileIndicator: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  profileIndicatorText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  welcomeBanner: {
    padding: 24,
    borderRadius: 20,
    marginBottom: 20,
    position: 'relative',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 15,
    elevation: 3,
  },
  bannerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.12)',
  },
  welcomeSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    fontWeight: '600',
    marginBottom: 4,
  },
  welcomeTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 10,
    lineHeight: 30,
  },
  bannerDesc: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.9)',
    lineHeight: 18,
  },
  statsCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    paddingVertical: 16,
    borderRadius: 16,
    marginBottom: 28,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 1,
  },
  statsCol: {
    flex: 1,
    alignItems: 'center',
  },
  statsVal: {
    fontSize: 18,
    fontWeight: '800',
  },
  statsLabel: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 2,
    fontWeight: '500',
  },
  statsDivider: {
    width: 1,
    height: '100%',
  },
  spotlightHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  spotlightBadge: {
    backgroundColor: '#FFF3E0',
    color: '#FF9500',
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    textTransform: 'uppercase',
  },
  emptySpotlightCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  emptySpotlightText: {
    fontSize: 13,
    color: '#8E8E93',
    textAlign: 'center',
  },
  carouselContainer: {
    paddingRight: 20,
    paddingBottom: 10,
  },
  spotlightCard: {
    width: 160,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    marginRight: 14,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
    marginBottom: 20,
  },
  spotlightImage: {
    width: '100%',
    height: 100,
    resizeMode: 'cover',
  },
  spotlightPlaceholder: {
    width: '100%',
    height: 100,
    backgroundColor: '#E9ECEF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  spotlightPlaceholderText: {
    color: '#ADB5BD',
    fontSize: 12,
    fontWeight: '700',
  },
  spotlightPromoTag: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: '#FF9500',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  spotlightPromoTagText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  spotlightContent: {
    padding: 10,
  },
  spotlightName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1C1C1E',
    marginBottom: 2,
  },
  spotlightCategory: {
    fontSize: 10,
    color: '#8E8E93',
    marginBottom: 6,
  },
  spotlightPrice: {
    fontSize: 14,
    fontWeight: '800',
  },
  perHourText: {
    fontSize: 9,
    color: '#8E8E93',
    fontWeight: '400',
  },
  card: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    borderRadius: 16,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderLeftWidth: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  cardInfo: {
    flex: 1,
    paddingRight: 10,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  cardDesc: {
    fontSize: 13,
    color: '#8E8E93',
    lineHeight: 18,
  },
  chevron: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#F2F2F7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  chevronText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#8E8E93',
  },
  footerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
    marginBottom: 16,
  },
  footerText: {
    fontSize: 11,
    color: '#AEAEB2',
    textAlign: 'center',
  },
});
