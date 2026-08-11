import React, { useContext, useEffect, useState, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image, ActivityIndicator, TextInput, useWindowDimensions, Platform, Linking, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { AuthContext } from '../context/AuthContext';
import { SettingsContext } from '../context/SettingsContext';
import apiClient from '../api/client';
import ResponsiveContainer from '../components/ResponsiveContainer';
import SafeLogo from '../components/SafeLogo';
import ThemeToggle from '../components/ThemeToggle';

const PROMO_SLIDES = [
  {
    id: 1,
    title: '🔥 Mega Tool Sale',
    subtitle: 'Up to 40% off on power tools, drills & more!',
    cta: 'Shop Now',
    gradient: ['#1a472a', '#2d6a4f'],
    accent: '#52b788',
    icon: '🛒',
    action: 'Products',
  },
  {
    id: 2,
    title: '⚡ Book a Handyman',
    subtitle: 'Verified professionals at your doorstep. Fast & reliable.',
    cta: 'Book Now',
    gradient: ['#0d1b2a', '#1b4f72'],
    accent: '#3498db',
    icon: '🔧',
    action: 'Services',
  },
  {
    id: 3,
    title: '🎁 Refer & Earn',
    subtitle: 'Invite friends & earn wallet credits on every signup!',
    cta: 'Learn More',
    gradient: ['#4a1942', '#7b2d8b'],
    accent: '#e040fb',
    icon: '💜',
    action: 'ProfileTab',
  },
];

export default function HomeScreen({ navigation }: any) {
  const { userInfo } = useContext(AuthContext);
  const { theme, logoUrl, heroTitle, heroSubtitle, footerText, apkUrl, aabUrl } = useContext(SettingsContext);
  const { width } = useWindowDimensions();
  const isLargeScreen = width >= 768;

  const handleSellPress = () => {
    if (userInfo?.role === 'VENDOR') {
      navigation.navigate('Products');
    } else {
      Alert.alert(
        '🏪 Register as a Vendor',
        'To sell items on FixMart, you need to register as a Vendor.\n\nWould you like to register now?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Register as Vendor',
            onPress: () => {
              if (userInfo) {
                navigation.navigate('KYCVerification', { role: 'VENDOR' });
              } else {
                navigation.navigate('Signup', { role: 'VENDOR', initialRole: 'VENDOR' });
              }
            },
          },
        ]
      );
    }
  };

  const handleEscrowPress = () => {
    if (userInfo) {
      Alert.alert(
        '🛡️ FixMart Escrow Protection',
        'All purchases & service bookings are 100% protected by FixMart Escrow.\n\nFunds are released to vendors/providers only when you verify delivery.\n\nWould you like to view your Escrow & Wallet balance?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'View Wallet & Escrow',
            onPress: () => navigation.navigate('Wallet'),
          },
        ]
      );
    } else {
      Alert.alert(
        '🛡️ FixMart Escrow Protection',
        'FixMart Escrow protects 100% of your payments until delivery is verified.\n\nSign in to view your Escrow Wallet.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Sign In',
            onPress: () => navigation.navigate('Login'),
          },
        ]
      );
    }
  };

  const [promotedListings, setPromotedListings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);

  // Slides State
  const [slides, setSlides] = useState<any[]>([]);
  const [slidesLoading, setSlidesLoading] = useState(true);
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const slideScrollViewRef = useRef<ScrollView>(null);

  // Fetch Slides (with fallback to rich PROMO_SLIDES if empty)
  useEffect(() => {
    const fetchSlides = async () => {
      try {
        setSlidesLoading(true);
        const res = await apiClient.get('/slides');
        if (res.data && Array.isArray(res.data) && res.data.length > 0) {
          setSlides(res.data);
        } else {
          setSlides(PROMO_SLIDES);
        }
      } catch (e) {
        console.error('Failed to load slides', e);
        setSlides(PROMO_SLIDES);
      } finally {
        setSlidesLoading(false);
      }
    };
    fetchSlides();
  }, []);

  // Auto-scroll logic for slides
  useEffect(() => {
    if (slides.length <= 1) return;
    const interval = setInterval(() => {
      const nextIndex = (activeSlideIndex + 1) % slides.length;
      setActiveSlideIndex(nextIndex);
      const containerWidth = Math.min(width, 1200) - 40;
      slideScrollViewRef.current?.scrollTo({
        x: nextIndex * containerWidth,
        animated: true,
      });
    }, 4000);
    return () => clearInterval(interval);
  }, [slides, activeSlideIndex, width]);

  const handleScroll = (event: any) => {
    const contentOffsetX = event.nativeEvent.contentOffset.x;
    const containerWidth = Math.min(width, 1200) - 40;
    const currentIndex = Math.round(contentOffsetX / containerWidth);
    if (currentIndex !== activeSlideIndex && currentIndex >= 0 && currentIndex < slides.length) {
      setActiveSlideIndex(currentIndex);
    }
  };

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



  const renderHeader = () => (
    <View style={[
      styles.navHeader, 
      { borderBottomColor: theme.border }, 
      Platform.OS === 'web' && { marginBottom: 0, borderBottomWidth: 0 }
    ]}>
      <View style={styles.navHeaderContainer}>
        {/* Logo / Brand Name */}
        <TouchableOpacity 
          onPress={() => {
            try {
              navigation.navigate('Main', { screen: 'HomeTab' });
            } catch {
              navigation.navigate('HomeTab');
            }
          }} 
          style={styles.logoContainer}
        >
          <SafeLogo
            logoUrl={logoUrl}
            style={{ width: 34, height: 34 }}
            resizeMode="contain"
          />
          <Text style={{ fontSize: 18, fontWeight: '800', marginLeft: 6 }}>
            <Text style={{ color: '#1B3D6E' }}>Fix</Text>
            <Text style={{ color: theme?.primary || '#22A45D' }}>Mart</Text>
          </Text>
        </TouchableOpacity>

        {width >= 768 ? (
          /* 🖥️ DESKTOP/WEB FULL SCREEN NAVIGATION BAR */
          <View style={styles.desktopNav}>
            <TouchableOpacity onPress={() => navigation.navigate('HomeTab')} style={styles.navLink}>
              <Text style={[styles.navLinkLabel, styles.activeNavLink, { color: theme.primary }]}>Home</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => navigation.navigate('Products')} style={styles.navLink}>
              <Text style={styles.navLinkLabel}>Products</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => navigation.navigate('Services')} style={styles.navLink}>
              <Text style={styles.navLinkLabel}>Services</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => navigation.navigate('BookParcel')} style={styles.navLink}>
              <Text style={styles.navLinkLabel}>Book Rider</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => navigation.navigate('Wallet')} style={styles.navLink}>
              <Text style={styles.navLinkLabel}>Wallet</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => navigation.navigate('CartTab')} style={styles.navLink}>
              <Text style={styles.navLinkLabel}>Cart 🛒</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => navigation.navigate('NotificationsTab')} style={styles.navLink}>
              <Text style={styles.navLinkLabel}>Alerts 🔔</Text>
            </TouchableOpacity>
            {userInfo?.role === 'RIDER' && (
              <TouchableOpacity onPress={() => navigation.navigate('History', { type: 'orders', role: 'RIDER' })} style={styles.navLink}>
                <Text style={[styles.navLinkLabel, { color: '#34C759', fontWeight: '800' }]}>🚚 Rider Hub</Text>
              </TouchableOpacity>
            )}
            {/* Theme Toggle */}
            <View style={{ marginLeft: 12 }}>
              <ThemeToggle compact />
            </View>
            {/* User Avatar */}
            <TouchableOpacity 
              style={[styles.profileIndicator, { borderColor: theme.primary, marginLeft: 12 }]}
              onPress={() => navigation.navigate('ProfileTab')}
            >
              <Text style={styles.profileIndicatorText}>
                {userInfo?.name ? userInfo.name.charAt(0).toUpperCase() : 'G'}
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          /* 📱 MOBILE HAMBURGER BUTTON */
          <View style={styles.mobileNavHeaderRight}>
            <TouchableOpacity 
              style={[styles.profileIndicator, { borderColor: theme.primary, marginRight: 12 }]}
              onPress={() => navigation.navigate('ProfileTab')}
            >
              <Text style={styles.profileIndicatorText}>
                {userInfo?.name ? userInfo.name.charAt(0).toUpperCase() : 'G'}
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.hamburgerButton, { backgroundColor: theme.primary + '15' }]} 
              onPress={() => setMenuOpen(!menuOpen)}
            >
              <Text style={[styles.hamburgerIcon, { color: theme.primary }]}>
                {menuOpen ? '✕' : '☰'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* 📱 MOBILE DROP-DOWN DRAWER MENU */}
      {width < 768 && menuOpen && (
        <View style={[styles.mobileMenuDropdown, { borderColor: theme.border }]}>
          <TouchableOpacity 
            style={styles.mobileMenuItem} 
            onPress={() => { setMenuOpen(false); navigation.navigate('HomeTab'); }}
          >
            <Text style={[styles.mobileMenuText, { color: theme.primary, fontWeight: '700' }]}>🏠 Home</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.mobileMenuItem} 
            onPress={() => { setMenuOpen(false); navigation.navigate('Products'); }}
          >
            <Text style={[styles.mobileMenuText]}>📦 Products</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.mobileMenuItem} 
            onPress={() => { setMenuOpen(false); navigation.navigate('Services'); }}
          >
            <Text style={styles.mobileMenuText}>⚡ Services</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.mobileMenuItem} 
            onPress={() => { setMenuOpen(false); navigation.navigate('BookParcel'); }}
          >
            <Text style={styles.mobileMenuText}>🚚 Book Rider</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.mobileMenuItem} 
            onPress={() => { setMenuOpen(false); navigation.navigate('Wallet'); }}
          >
            <Text style={styles.mobileMenuText}>💳 Wallet</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.mobileMenuItem} 
            onPress={() => { setMenuOpen(false); navigation.navigate('CartTab'); }}
          >
            <Text style={styles.mobileMenuText}>🛒 Cart</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.mobileMenuItem} 
            onPress={() => { setMenuOpen(false); navigation.navigate('NotificationsTab'); }}
          >
            <Text style={styles.mobileMenuText}>🔔 Alerts</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.mobileMenuItem} 
            onPress={() => { setMenuOpen(false); navigation.navigate('ProfileTab'); }}
          >
            <Text style={styles.mobileMenuText}>👤 Profile</Text>
          </TouchableOpacity>
          {userInfo?.role === 'RIDER' && (
            <TouchableOpacity 
              style={[styles.mobileMenuItem, { backgroundColor: '#34C75915' }]} 
              onPress={() => { setMenuOpen(false); navigation.navigate('History', { type: 'orders', role: 'RIDER' }); }}
            >
              <Text style={[styles.mobileMenuText, { color: '#34C759', fontWeight: '800' }]}>🚚 Rider Dashboard</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      {Platform.OS === 'web' && (
        <View style={[styles.webHeaderWrapper, { backgroundColor: theme.card || '#FFFFFF', borderBottomColor: theme.border }]}>
          <ResponsiveContainer>
            {renderHeader()}
          </ResponsiveContainer>
        </View>
      )}
      <ScrollView 
        style={[styles.container, { backgroundColor: theme.background }]} 
        contentContainerStyle={[
          styles.contentContainer, 
          Platform.OS === 'web' && { paddingTop: 20 }
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <ResponsiveContainer>
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

          {/* ─── HERO: Logo + Action Grid + Tagline ─── */}
          <View style={styles.heroSection}>
            {/* FIXMART Logo */}
            <View style={styles.heroLogoRow}>
              <SafeLogo
                logoUrl={logoUrl}
                style={styles.heroLogoImg}
                resizeMode="contain"
              />
              <Text style={styles.heroLogoText}>
                <Text style={styles.heroLogoFix}>FIX</Text>
                <Text style={styles.heroLogoMart}>MART</Text>
              </Text>
            </View>

            {/* Action Grid (Smaller & Horizontally aligned on large screen) */}
            <View style={[styles.actionGrid, isLargeScreen && styles.actionGridHorizontal]}>
              {/* Buy */}
              <TouchableOpacity
                style={[styles.actionTile, isLargeScreen && styles.actionTileHorizontal]}
                onPress={() => navigation.navigate('Products')}
                activeOpacity={0.82}
              >
                <View style={[styles.actionIconCircle, { backgroundColor: '#E8F5E9' }]}>
                  <Text style={styles.actionEmoji}>🛍️</Text>
                </View>
                <Text style={styles.actionLabel}>Buy</Text>
              </TouchableOpacity>

              {/* Sell */}
              <TouchableOpacity
                style={[styles.actionTile, isLargeScreen && styles.actionTileHorizontal]}
                onPress={handleSellPress}
                activeOpacity={0.82}
              >
                <View style={[styles.actionIconCircle, { backgroundColor: '#FFFDE7' }]}>
                  <Text style={styles.actionEmoji}>🏷️</Text>
                </View>
                <Text style={styles.actionLabel}>Sell</Text>
              </TouchableOpacity>

              {/* Escrow Pay */}
              <TouchableOpacity
                style={[styles.actionTile, isLargeScreen && styles.actionTileHorizontal]}
                onPress={handleEscrowPress}
                activeOpacity={0.82}
              >
                <View style={[styles.actionIconCircle, { backgroundColor: '#F3E5F5' }]}>
                  <Text style={styles.actionEmoji}>🛡️</Text>
                </View>
                <Text style={styles.actionLabel}>Escrow</Text>
              </TouchableOpacity>

              {/* Request a Service */}
              <TouchableOpacity
                style={[styles.actionTile, isLargeScreen && styles.actionTileHorizontal]}
                onPress={() => navigation.navigate('Services')}
                activeOpacity={0.82}
              >
                <View style={[styles.actionIconCircle, { backgroundColor: '#E3F2FD' }]}>
                  <Text style={styles.actionEmoji}>⚙️</Text>
                </View>
                <Text style={styles.actionLabel}>{'Request\na Service'}</Text>
              </TouchableOpacity>

              {/* Request a Rider */}
              <TouchableOpacity
                style={[styles.actionTile, isLargeScreen && styles.actionTileHorizontal]}
                onPress={() => navigation.navigate('BookParcel')}
                activeOpacity={0.82}
              >
                <View style={[styles.actionIconCircle, { backgroundColor: '#E8F5E9' }]}>
                  <Text style={styles.actionEmoji}>🛵</Text>
                </View>
                <Text style={styles.actionLabel}>{'Request\na Rider'}</Text>
              </TouchableOpacity>
            </View>

            {/* Tagline */}
            <View style={styles.taglineBlock}>
              <Text style={styles.taglinePrimary}>Everything you need.</Text>
              <Text style={styles.taglineGreen}>One platform.</Text>
            </View>
          </View>

          {/* 🚚 Dedicated Rider Control Banner (When Logged in as RIDER) */}
          {userInfo?.role === 'RIDER' && (
            <View style={styles.riderHeroBanner}>
              <View style={styles.riderHeroHeader}>
                <Text style={styles.riderHeroIcon}>🛵</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.riderHeroTitle}>Rider Control Center</Text>
                  <Text style={styles.riderHeroSub}>Deliver parcels & order dispatches in real-time</Text>
                </View>
              </View>
              <View style={styles.riderHeroBtnRow}>
                <TouchableOpacity
                  style={[styles.riderHeroBtn, { backgroundColor: '#34C759' }]}
                  onPress={() => navigation.navigate('History', { type: 'orders', role: 'RIDER' })}
                  activeOpacity={0.85}
                >
                  <Text style={styles.riderHeroBtnText}>📋 Available Jobs</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.riderHeroBtn, { backgroundColor: theme.primary }]}
                  onPress={() => navigation.navigate('RiderEarnings')}
                  activeOpacity={0.85}
                >
                  <Text style={styles.riderHeroBtnText}>💰 Earnings & Wallet</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}



      {/* 🚀 Dynamic Slides Carousel */}
      {(!slidesLoading || slides.length > 0) && (
        <View style={styles.sliderWrapper}>
          <ScrollView
            ref={slideScrollViewRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScroll={handleScroll}
            scrollEventThrottle={16}
            style={[styles.sliderScroll, { width: Math.min(width, 1200) - 40 }]}
          >
            {(slides.length > 0 ? slides : PROMO_SLIDES).map((slide: any) => {
              const slideWidth = Math.min(width, 1200) - 40;

              // If slide has an image URL (admin uploaded slide)
              if (slide.imageUrl) {
                return (
                  <View key={slide.id} style={[styles.slideCard, { width: slideWidth }]}>
                    <Image source={{ uri: slide.imageUrl }} style={styles.slideImage} resizeMode="cover" />
                    <View style={styles.slideOverlay} />
                    {slide.caption && (
                      <View style={styles.slideCaptionContainer}>
                        <Text style={styles.slideCaptionText}>{slide.caption}</Text>
                      </View>
                    )}
                  </View>
                );
              }

              // Built-in promo card (gradient + icon + CTA)
              const colors = slide.gradient || ['#0f2027', '#203a43'];
              return (
                <TouchableOpacity
                  key={slide.id}
                  activeOpacity={0.9}
                  style={[styles.slideCard, { width: slideWidth }]}
                  onPress={() => {
                    if (slide.action) {
                      if (slide.action === 'Products') navigation.navigate('Products');
                      else if (slide.action === 'Services') navigation.navigate('Services');
                      else navigation.navigate(slide.action);
                    }
                  }}
                >
                  <LinearGradient colors={colors} style={styles.promoSlideGradient}>
                    <View style={styles.promoSlideContent}>
                      <Text style={styles.promoSlideIcon}>{slide.icon || '🛍️'}</Text>
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={styles.promoSlideTitle}>{slide.title}</Text>
                        <Text style={styles.promoSlideSub}>{slide.subtitle}</Text>
                      </View>
                      <View style={[styles.promoSlideCtaBtn, { backgroundColor: slide.accent || '#FFF' }]}>
                        <Text style={styles.promoSlideCtaText}>{slide.cta || 'Explore'} →</Text>
                      </View>
                    </View>
                  </LinearGradient>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Dots Indicator */}
          {(slides.length > 1 || PROMO_SLIDES.length > 1) && (
            <View style={styles.indicatorContainer}>
              {(slides.length > 0 ? slides : PROMO_SLIDES).map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.indicatorDot,
                    { backgroundColor: activeSlideIndex === i ? theme.primary : '#FFFFFF99' }
                  ]}
                />
              ))}
            </View>
          )}
        </View>
      )}

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
                <Image source={{ uri: item.imageUrl }} style={styles.spotlightImage} resizeMode="cover" />
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
        {Platform.OS === 'web' && (
          <View style={[styles.downloadAppCard, { backgroundColor: theme.card || '#FFFFFF', borderColor: theme.border, width: '100%' }]}>
            <View style={styles.downloadAppContent}>
              <Text style={[styles.downloadAppTitle, { color: theme.text }]}>🌐 More Ways to Get the App</Text>
              <Text style={styles.downloadAppDesc}>
                Shop, book & track anywhere. Available on Android.
              </Text>
              <View style={styles.downloadBtnRow}>
                {/* Direct Android APK Download */}
                <TouchableOpacity
                  style={[styles.storeBadgeBtn, styles.apkDownloadBtn]}
                  onPress={() => {
                    const directApkUrl = apkUrl || 'https://akpoaza-3.onrender.com/uploads/fixmart-latest.apk';
                    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
                      const link = document.createElement('a');
                      link.href = directApkUrl;
                      link.target = '_blank';
                      link.download = 'fixmart-latest.apk';
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                    } else {
                      Linking.openURL(directApkUrl);
                    }
                  }}
                  activeOpacity={0.85}
                  accessibilityLabel="Download Android APK File"
                >
                  <Text style={styles.storeIcon}>📥</Text>
                  <View style={styles.storeTextCol}>
                    <Text style={styles.storeSubtext}>DIRECT FILE</Text>
                    <Text style={styles.storeTitle}>Android APK</Text>
                  </View>
                </TouchableOpacity>

                {/* Google Play */}
                <TouchableOpacity
                  style={styles.storeBadgeBtn}
                  onPress={() => {
                    const directApkUrl = apkUrl || 'https://akpoaza-3.onrender.com/uploads/fixmart-latest.apk';
                    if (typeof window !== 'undefined') window.open(directApkUrl, '_blank');
                    else Linking.openURL(directApkUrl);
                  }}
                  activeOpacity={0.85}
                  accessibilityLabel="Download on Google Play"
                >
                  <Text style={styles.storeIcon}>🤖</Text>
                  <View style={styles.storeTextCol}>
                    <Text style={styles.storeSubtext}>GET IT ON</Text>
                    <Text style={styles.storeTitle}>Google Play</Text>
                  </View>
                </TouchableOpacity>

                {/* App Store */}
                <TouchableOpacity
                  style={[styles.storeBadgeBtn, styles.appStoreBtn]}
                  onPress={() => {
                    Alert.alert(
                      '📱 FixMart Mobile App',
                      'Direct Android APK download will start. iOS App Store coming soon!',
                      [
                        { text: 'Download APK', onPress: () => Linking.openURL(apkUrl || 'https://akpoaza-3.onrender.com/uploads/fixmart-latest.apk') },
                        { text: 'Cancel', style: 'cancel' }
                      ]
                    );
                  }}
                  activeOpacity={0.85}
                  accessibilityLabel="Download on App Store"
                >
                  <Text style={styles.storeIcon}>🍏</Text>
                  <View style={styles.storeTextCol}>
                    <Text style={styles.storeSubtext}>DOWNLOAD ON THE</Text>
                    <Text style={styles.storeTitle}>App Store</Text>
                  </View>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
        <Text style={styles.footerText}>{footerText}</Text>
      </View>

      </ResponsiveContainer>
    </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  // ── Hero Grid Section ────────────────────────────────────────────────────
  heroSection: {
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: 8,
    backgroundColor: '#FFFFFF',
  },
  heroLogoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    gap: 8,
  },
  heroLogoImg: {
    width: 44,
    height: 44,
  },
  heroLogoText: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  heroLogoFix: {
    color: '#1B3D6E',
  },
  heroLogoMart: {
    color: '#22A45D',
  },
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
    width: '100%',
    paddingHorizontal: 4,
    marginBottom: 20,
  },
  actionGridHorizontal: {
    flexWrap: 'nowrap',
    maxWidth: 580,
    alignSelf: 'center',
  },
  actionTile: {
    width: '44%',
    maxWidth: 125,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E8E8E8',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  actionTileHorizontal: {
    flex: 1,
    width: 'auto',
  },
  actionIconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  actionEmoji: {
    fontSize: 20,
  },
  actionLabel: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#1C1C1E',
    textAlign: 'center',
    lineHeight: 14,
  },
  taglineBlock: {
    alignItems: 'center',
    marginTop: 4,
  },
  taglinePrimary: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1C1C1E',
    textAlign: 'center',
  },
  taglineGreen: {
    fontSize: 20,
    fontWeight: '700',
    color: '#22A45D',
    textAlign: 'center',
  },
  // ── Search ───────────────────────────────────────────────────────────────
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
    height: 140,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
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
  sliderWrapper: {
    marginBottom: 20,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#FFF',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    position: 'relative',
  },
  sliderScroll: {
    height: 180,
  },
  slideCard: {
    height: 180,
    position: 'relative',
    overflow: 'hidden',
  },
  promoSlideGradient: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  promoSlideContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  promoSlideIcon: {
    fontSize: 42,
  },
  promoSlideTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  promoSlideSub: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.9)',
    fontWeight: '500',
    lineHeight: 18,
  },
  promoSlideCtaBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
    marginLeft: 12,
  },
  promoSlideCtaText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F2027',
  },
  slideImage: {
    width: '100%',
    height: '100%',
  },
  slidePlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#E5E5EA',
  },
  slideOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  slideCaptionContainer: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
  },
  slideCaptionText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '800',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  indicatorContainer: {
    position: 'absolute',
    bottom: 8,
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 6,
    zIndex: 10,
  },
  indicatorDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  navHeader: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    paddingVertical: 12,
    marginBottom: 16,
    zIndex: 100,
  },
  navHeaderContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
  },
  headerLogoImage: {
    width: 36,
    height: 36,
    marginRight: 8,
  },
  headerTitleBlock: {
    flexDirection: 'column',
    justifyContent: 'center',
    flexShrink: 1,
  },
  headerBrandTitle: {
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 22,
  },
  headerTagline: {
    fontSize: 9.5,
    color: '#8E8E93',
    fontWeight: '500',
    letterSpacing: 0.1,
  },
  desktopNav: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  navLink: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  navLinkLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3A3A3C',
  },
  activeNavLink: {
    fontWeight: '700',
  },
  mobileNavHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  hamburgerButton: {
    width: 38,
    height: 38,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  hamburgerIcon: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  mobileMenuDropdown: {
    position: 'absolute',
    top: 50,
    right: 0,
    width: 200,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
    zIndex: 999,
  },
  mobileMenuItem: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  mobileMenuText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1C1C1E',
  },
  webHeaderWrapper: {
    width: '100%',
    zIndex: 1000,
    borderBottomWidth: 1,
    paddingHorizontal: 20,
  },

  // ── Download App Card Styles ─────────────────────────────────────────────
  downloadAppCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
    marginTop: 24,
    marginBottom: 24,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
  },
  downloadAppContent: {
    alignItems: 'center',
  },
  downloadAppTitle: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 8,
    textAlign: 'center',
  },
  downloadAppDesc: {
    fontSize: 14,
    color: '#8E8E93',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
    maxWidth: 480,
  },
  downloadBtnRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
    width: '100%',
  },
  storeBadgeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#000000',
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 10,
    minWidth: 160,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  appStoreBtn: {
    backgroundColor: '#1C1C1E',
  },
  apkDownloadBtn: {
    backgroundColor: '#2E7D32',
  },
  storeIcon: {
    fontSize: 24,
    marginRight: 10,
  },
  storeTextCol: {
    flexDirection: 'column',
  },
  storeSubtext: {
    fontSize: 9,
    fontWeight: '700',
    color: '#A1A1A6',
    letterSpacing: 0.5,
  },
  storeTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // ── Rider Hero Banner Styles ─────────────────────────────────────────────
  riderHeroBanner: {
    backgroundColor: '#0F172A',
    borderRadius: 16,
    padding: 18,
    marginBottom: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 5,
  },
  riderHeroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    gap: 12,
  },
  riderHeroIcon: {
    fontSize: 36,
  },
  riderHeroTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  riderHeroSub: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '500',
  },
  riderHeroBtnRow: {
    flexDirection: 'row',
    gap: 10,
  },
  riderHeroBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  riderHeroBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
  },

  // ── Mobile/Universal Download Banner ─────────────────────────────────────
  mobileDownloadBanner: {
    borderRadius: 20,
    padding: 20,
    marginVertical: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
  mobileDownloadLeft: {
    flex: 1,
  },
  appVersionBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#22D3EE33',
    borderColor: '#22D3EE66',
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginBottom: 8,
  },
  appVersionText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#22D3EE',
    letterSpacing: 0.5,
  },
  mobileDownloadTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  mobileDownloadDesc: {
    fontSize: 12,
    color: '#94A3B8',
    lineHeight: 17,
  },
  apkMainBtn: {
    backgroundColor: '#22C55E',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 110,
    shadowColor: '#22C55E',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  apkMainBtnIcon: {
    fontSize: 22,
    marginBottom: 4,
  },
  apkMainBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
  },
});
