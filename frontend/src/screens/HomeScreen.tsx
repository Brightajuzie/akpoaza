import React, { useContext, useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TouchableWithoutFeedback, ScrollView, Image,
  ActivityIndicator, TextInput, useWindowDimensions, Platform, Linking, Alert, Animated, Modal
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { AuthContext } from '../context/AuthContext';
import { SettingsContext } from '../context/SettingsContext';
import { useCurrency } from '../context/CurrencyContext';
import { CartContext } from '../context/CartContext';
import apiClient, { getImageUri } from '../api/client';
import ResponsiveContainer from '../components/ResponsiveContainer';
import SafeLogo from '../components/SafeLogo';
import ThemeToggle from '../components/ThemeToggle';

// ─── Constants ────────────────────────────────────────────────────────────────
const PROMO_SLIDES = [
  {
    id: 1,
    title: '🔥 Mega Tool Sale',
    subtitle: 'Up to 40% off on power tools, drills & more!',
    cta: 'Shop Now',
    gradient: ['#0F2C18', '#1A5C32'] as const,
    accent: '#4ADE80',
    icon: '🛒',
    action: 'Products',
  },
  {
    id: 2,
    title: '⚡ Book a Handyman',
    subtitle: 'Verified professionals at your doorstep. Fast & reliable.',
    cta: 'Book Now',
    gradient: ['#0A1628', '#0D3A6E'] as const,
    accent: '#60A5FA',
    icon: '🔧',
    action: 'Services',
  },
  {
    id: 3,
    title: '🎁 Refer & Earn',
    subtitle: 'Invite friends & earn wallet credits on every signup!',
    cta: 'Learn More',
    gradient: ['#2D0F3A', '#5B1F87'] as const,
    accent: '#C084FC',
    icon: '💜',
    action: 'ProfileTab',
  },
];

const QUICK_ACTIONS = [
  { icon: '🛍️', label: 'Buy', screen: 'Products', bgLight: '#E8F5E9', bgDark: '#1B3E2B', accent: '#22A45D' },
  { icon: '🏷️', label: 'Sell', screen: '__sell__', bgLight: '#FFF8E1', bgDark: '#3D3010', accent: '#F59E0B' },
  { icon: '🛠️', label: 'Services', screen: 'Services', bgLight: '#E3F2FD', bgDark: '#0D2540', accent: '#3B82F6' },
  { icon: '🛵', label: 'Book Rider', screen: 'BookParcel', bgLight: '#F0FFF4', bgDark: '#0F2820', accent: '#10B981' },
];

const NAV_LINKS = [
  { label: 'Home', screen: 'HomeTab' },
  { label: 'Products', screen: 'Products' },
  { label: 'Services', screen: 'Services' },
  { label: 'Book Rider', screen: 'BookParcel' },
  { label: 'My Bookings', screen: 'History' },
];

// ─── Component ────────────────────────────────────────────────────────────────
export default function HomeScreen({ navigation }: any) {
  const { userInfo } = useContext(AuthContext);
  const { theme, logoUrl, footerText, apkUrl, playstoreUrl, colorMode } = useContext(SettingsContext);
  const { addToCart } = useContext(CartContext);
  const { fmt } = useCurrency();
  const { width, height } = useWindowDimensions();

  const isDesktop = width >= 1024;
  const isTablet = width >= 768 && width < 1024;
  const isMobile = width < 768;
  const isCompactHeight = height < 760;  // Devices with <= 5.6" screen height
  const isVeryCompact  = height < 700;  // Devices with ~5.3" screen height or smaller
  const isDark = colorMode === 'dark';

  // ── State ────────────────────────────────────────────────────────────────
  const [promotedListings, setPromotedListings] = useState<any[]>([]);
  const [promotedProducts, setPromotedProducts] = useState<any[]>([]);
  const [productsLoading, setProductsLoading]   = useState(true);
  const [addedCartFeedback, setAddedCartFeedback] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [slides, setSlides] = useState<any[]>([]);
  const [slidesLoading, setSlidesLoading] = useState(true);
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const slideScrollViewRef = useRef<ScrollView>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{ products: any[]; services: any[] } | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchDebounceRef = useRef<any>(null);
  const [searchFocused, setSearchFocused] = useState(false);
  const [showVendorModal, setShowVendorModal] = useState(false);
  const [vendorModalType, setVendorModalType] = useState<'REGISTER' | 'UPGRADE' | 'KYC'>('REGISTER');

  const heroFadeAnim = useRef(new Animated.Value(0)).current;
  const heroSlideAnim = useRef(new Animated.Value(24)).current;

  // ── Helpers ─────────────────────────────────────────────────────────────
  const resolveUrl = (url: string) => {
    if (url.startsWith('/')) {
      const apiBase = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:5000/api';
      return `${apiBase.replace(/\/api\/?$/, '')}${url}`;
    }
    return url;
  };

  const triggerDownload = (targetUrl: string | null | undefined, filename: string) => {
    const url = resolveUrl(targetUrl || `https://akpoaza-3.onrender.com/uploads/${filename}`);
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      const link = document.createElement('a');
      link.href = url; link.target = '_blank'; link.download = filename;
      document.body.appendChild(link); link.click(); document.body.removeChild(link);
    } else { Linking.openURL(url); }
  };

  const handleSellPress = () => {
    if (!userInfo) {
      setVendorModalType('REGISTER');
      setShowVendorModal(true);
      return;
    }
    if (userInfo.role === 'VENDOR') {
      if (userInfo.kycStatus && !['VERIFIED', 'APPROVED'].includes(userInfo.kycStatus)) {
        setVendorModalType('KYC');
        setShowVendorModal(true);
        return;
      }
      navigation.navigate('Admin', { activeTab: 'products', action: 'add' });
      return;
    }
    if (userInfo.role === 'ADMIN') {
      navigation.navigate('Admin', { activeTab: 'products', action: 'add' });
      return;
    }
    // For CUSTOMER, HANDYMAN, RIDER wishing to list items for sale
    setVendorModalType('UPGRADE');
    setShowVendorModal(true);
  };

  const handleActionPress = (screen: string) => {
    if (screen === '__sell__') return handleSellPress();
    navigation.navigate(screen);
  };

  // ── Effects ──────────────────────────────────────────────────────────────
  useEffect(() => {
    Animated.parallel([
      Animated.timing(heroFadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(heroSlideAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start();

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const paymentStatus = urlParams.get('payment_status');
        const ref = urlParams.get('ref');
        if (paymentStatus === 'success') {
          Alert.alert('✅ Payment Confirmed', `Your payment was completed and verified!\nReference: ${ref || 'Successful'}`);
          window.history.replaceState({}, document.title, window.location.pathname);
          navigation.navigate('History', { type: 'orders', tab: 'orders', role: 'CUSTOMER' });
        } else if (paymentStatus === 'cancelled') {
          Alert.alert('Payment Cancelled', 'Your transaction was cancelled. Feel free to try again.');
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      } catch (e) {}
    }
  }, []);

  useEffect(() => {
    const fetchSlides = async () => {
      try {
        setSlidesLoading(true);
        const res = await apiClient.get('/slides');
        setSlides(res.data?.length > 0 ? res.data : PROMO_SLIDES);
      } catch { setSlides(PROMO_SLIDES); }
      finally { setSlidesLoading(false); }
    };
    fetchSlides();
  }, []);

  useEffect(() => {
    if (slides.length <= 1) return;
    const interval = setInterval(() => {
      const nextIndex = (activeSlideIndex + 1) % slides.length;
      setActiveSlideIndex(nextIndex);
      slideScrollViewRef.current?.scrollTo({ x: nextIndex * (Math.min(width, 1200) - 40), animated: true });
    }, 4500);
    return () => clearInterval(interval);
  }, [slides, activeSlideIndex, width]);

  const handleSliderScroll = (e: any) => {
    const x = e.nativeEvent.contentOffset.x;
    const w = Math.min(width, 1200) - 40;
    const i = Math.round(x / w);
    if (i !== activeSlideIndex && i >= 0 && i < slides.length) setActiveSlideIndex(i);
  };

  const performSearch = useCallback(async (query: string) => {
    if (!query.trim()) { setSearchResults(null); return; }
    setSearchLoading(true);
    try {
      const [pr, sr] = await Promise.all([
        apiClient.get(`/products?search=${encodeURIComponent(query)}`),
        apiClient.get(`/services?search=${encodeURIComponent(query)}`),
      ]);
      setSearchResults({ products: pr.data.slice(0, 5), services: sr.data.slice(0, 5) });
    } catch { /* silent */ }
    finally { setSearchLoading(false); }
  }, []);

  const handleSearchChange = (text: string) => {
    setSearchQuery(text);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => performSearch(text), 120);
  };

  const fetchPromoted = useCallback(async () => {
    try {
      setLoading(true);
      setProductsLoading(true);
      const [pr, sr] = await Promise.all([apiClient.get('/products'), apiClient.get('/services')]);
      
      const rawProducts: any[] = Array.isArray(pr.data) ? pr.data : [];
      const featuredProds = rawProducts.filter((p: any) => p.featured);
      const otherProds    = rawProducts.filter((p: any) => !p.featured);

      // Prioritize boosted/featured products at the front
      const displayProducts = featuredProds.length > 0
        ? [...featuredProds, ...otherProds.slice(0, Math.max(0, 8 - featuredProds.length))]
        : rawProducts.slice(0, 8);

      setPromotedProducts(displayProducts);

      const fp = featuredProds.map((p: any) => ({ ...p, itemType: 'product' }));
      const fs = (Array.isArray(sr.data) ? sr.data : []).filter((s: any) => s.featured).map((s: any) => ({ ...s, itemType: 'service' }));
      setPromotedListings([...fp, ...fs]);
    } catch { /* silent */ }
    finally {
      setLoading(false);
      setProductsLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchPromoted();
    }, [fetchPromoted])
  );

  // ── Sub-renders ──────────────────────────────────────────────────────────
  const slideW = Math.min(width, 1200) - (isMobile ? 24 : 40);
  const slideH = isDesktop ? 400 : isTablet ? 280 : isVeryCompact ? 120 : isCompactHeight ? 145 : (width < 380 ? 175 : 190);

  const renderSlide = (slide: any) => {
    if (slide.imageUrl) {
      const uri = getImageUri(slide.imageUrl) || slide.imageUrl;
      return (
        <View key={slide.id} style={[styles.slideCard, { width: slideW, height: slideH }]}>
          <Image source={{ uri }} style={styles.slideImage} resizeMode="cover" />
          <LinearGradient colors={['transparent', 'rgba(0,0,0,0.75)']} style={StyleSheet.absoluteFill} />
          {slide.caption && (
            <View style={styles.slideCaptionContainer}>
              <Text style={styles.slideCaptionText}>{slide.caption}</Text>
            </View>
          )}
        </View>
      );
    }
    const colors = slide.gradient || ['#0f2027', '#203a43'];
    return (
      <TouchableOpacity
        key={slide.id}
        activeOpacity={0.92}
        style={[styles.slideCard, { width: slideW, height: slideH }]}
        onPress={() => {
          if (!slide.action) return;
          if (slide.action === 'Products') navigation.navigate('Products');
          else if (slide.action === 'Services') navigation.navigate('Services');
          else navigation.navigate(slide.action);
        }}
      >
        <LinearGradient colors={colors as any} style={styles.promoSlideGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
          {/* decorative circles */}
          <View style={[styles.slideDecor1, { backgroundColor: (slide.accent || '#FFF') + '18', width: isDesktop ? 300 : 180, height: isDesktop ? 300 : 180, borderRadius: isDesktop ? 150 : 90 }]} />
          <View style={[styles.slideDecor2, { backgroundColor: (slide.accent || '#FFF') + '10', width: isDesktop ? 200 : 120, height: isDesktop ? 200 : 120, borderRadius: isDesktop ? 100 : 60 }]} />
          <View style={styles.promoSlideContent}>
            <View style={[
              styles.promoSlideIconWrap,
              { backgroundColor: (slide.accent || '#FFF') + '22' },
              isCompactHeight && { width: 38, height: 38, borderRadius: 10 },
              isVeryCompact && { width: 30, height: 30, borderRadius: 8 }
            ]}>
              <Text style={[
                styles.promoSlideIcon,
                isCompactHeight && { fontSize: 20 },
                isVeryCompact && { fontSize: 16 }
              ]}>{slide.icon || '🛍️'}</Text>
            </View>
            <View style={{ flex: 1, marginLeft: isVeryCompact ? 8 : (isCompactHeight ? 10 : 16) }}>
              <Text style={[
                styles.promoSlideTitle,
                isCompactHeight && { fontSize: 15, marginBottom: 2 },
                isVeryCompact && { fontSize: 13, marginBottom: 1 }
              ]}>{slide.title}</Text>
              <Text style={[
                styles.promoSlideSub,
                isCompactHeight && { fontSize: 11, lineHeight: 15 },
                isVeryCompact && { fontSize: 10, lineHeight: 13 }
              ]} numberOfLines={2}>{slide.subtitle}</Text>
            </View>
            <View style={[
              styles.promoSlideCtaBtn,
              { backgroundColor: slide.accent || '#FFF' },
              isCompactHeight && { paddingHorizontal: 10, paddingVertical: 6 },
              isVeryCompact && { paddingHorizontal: 7, paddingVertical: 4 }
            ]}>
              <Text style={[
                styles.promoSlideCtaText,
                { color: '#0F2027' },
                isCompactHeight && { fontSize: 11 },
                isVeryCompact && { fontSize: 9.5 }
              ]}>{slide.cta || 'Explore'}</Text>
              <Text style={[
                styles.promoSlideCtaArrow,
                { color: '#0F2027' },
                isCompactHeight && { fontSize: 13 },
                isVeryCompact && { fontSize: 11 }
              ]}>›</Text>
            </View>
          </View>
        </LinearGradient>
      </TouchableOpacity>
    );
  };

  const renderDesktopNavbar = () => (
    <View style={[styles.desktopNavbar, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
      <View style={styles.desktopNavInner}>
        {/* Brand */}
        <TouchableOpacity
          style={styles.navBrand}
          onPress={() => { try { navigation.navigate('Main', { screen: 'HomeTab' }); } catch { navigation.navigate('HomeTab'); } }}
        >
          <SafeLogo logoUrl={logoUrl} style={{ width: 32, height: 32 }} resizeMode="contain" />
          <Text style={styles.navBrandText}>
            <Text style={[styles.navBrandFix, { color: isDark ? '#60A5FA' : '#1B3D6E' }]}>Fix</Text>
            <Text style={[styles.navBrandMart, { color: theme.primary }]}>Mart</Text>
          </Text>
        </TouchableOpacity>

        {/* Nav links */}
        <View style={styles.desktopNavLinks}>
          {NAV_LINKS.map(link => (
            <TouchableOpacity key={link.screen} onPress={() => navigation.navigate(link.screen)} style={styles.navLinkBtn}>
              <Text style={[styles.navLinkText, { color: link.screen === 'HomeTab' ? theme.primary : theme.text }]}>
                {link.label}
              </Text>
              {link.screen === 'HomeTab' && <View style={[styles.navLinkActive, { backgroundColor: theme.primary }]} />}
            </TouchableOpacity>
          ))}
          {userInfo?.role === 'RIDER' && (
            <TouchableOpacity onPress={() => navigation.navigate('History', { type: 'orders', role: 'RIDER' })} style={styles.navLinkBtn}>
              <Text style={[styles.navLinkText, { color: '#34C759', fontWeight: '800' }]}>🚚 Rider Hub</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Right controls */}
        <View style={styles.desktopNavRight}>
          <TouchableOpacity
            style={[styles.navIconBtn, { borderColor: theme.border }]}
            onPress={() => navigation.navigate('CartTab')}
          >
            <Text style={styles.navIconBtnText}>🛒</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.navIconBtn, { borderColor: theme.border }]}
            onPress={() => navigation.navigate('NotificationsTab')}
          >
            <Text style={styles.navIconBtnText}>🔔</Text>
          </TouchableOpacity>
          <ThemeToggle compact />
          <TouchableOpacity
            style={[styles.navAvatar, { borderColor: theme.primary, backgroundColor: theme.primary + '18' }]}
            onPress={() => navigation.navigate('ProfileTab')}
          >
            <Text style={[styles.navAvatarText, { color: theme.primary }]}>
              {userInfo?.name ? userInfo.name.charAt(0).toUpperCase() : 'G'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  const renderMobileNavbar = () => (
    <View style={[styles.mobileNavbar, { backgroundColor: theme.card, borderBottomColor: theme.border }, isCompactHeight && { paddingTop: 8, paddingBottom: 6 }, isVeryCompact && { paddingTop: 5, paddingBottom: 4, paddingHorizontal: 12 }]}>
      <View style={{ flex: 1, marginRight: 8 }}>
        <TouchableOpacity
          style={styles.navBrand}
          onPress={() => { try { navigation.navigate('Main', { screen: 'HomeTab' }); } catch { navigation.navigate('HomeTab'); } }}
        >
          <SafeLogo logoUrl={logoUrl} style={{ width: isVeryCompact ? 24 : 28, height: isVeryCompact ? 24 : 28 }} resizeMode="contain" />
          <Text style={[styles.navBrandText, isVeryCompact && { fontSize: 17, marginLeft: 6 }]}>
            <Text style={[styles.navBrandFix, { color: isDark ? '#60A5FA' : '#1B3D6E' }]}>Fix</Text>
            <Text style={[styles.navBrandMart, { color: theme.primary }]}>Mart</Text>
          </Text>
        </TouchableOpacity>
        {!isVeryCompact && (
          <Text style={[styles.mobileNavTagline, { color: isDark ? '#94A3B8' : '#64748B' }, isCompactHeight && { fontSize: 9 }]} numberOfLines={1}>
            The smart way to shop, send items & fix everyday household problems
          </Text>
        )}
      </View>

      <View style={styles.mobileNavRight}>
        <ThemeToggle compact />
        <TouchableOpacity
          style={[styles.navAvatar, { borderColor: theme.primary, backgroundColor: theme.primary + '18', marginLeft: 6 }, isCompactHeight && { width: 32, height: 32, borderRadius: 16 }, isVeryCompact && { width: 28, height: 28, borderRadius: 14 }]}
          onPress={() => navigation.navigate('ProfileTab')}
        >
          <Text style={[styles.navAvatarText, { color: theme.primary }, isCompactHeight && { fontSize: 13 }, isVeryCompact && { fontSize: 11 }]}>
            {userInfo?.name ? userInfo.name.charAt(0).toUpperCase() : 'G'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.hamburger, { backgroundColor: theme.primary + '15', marginLeft: 6 }, isCompactHeight && { paddingHorizontal: 10, paddingVertical: 6 }, isVeryCompact && { width: 30, height: 30, paddingHorizontal: 8 }]}
          onPress={() => setMenuOpen(!menuOpen)}
        >
          <Text style={[styles.hamburgerText, { color: theme.primary }, isCompactHeight && { fontSize: 16 }, isVeryCompact && { fontSize: 14 }]}>{menuOpen ? '✕' : '☰'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  // ── Mobile Hamburger Modal Drawer (Native Modal overlay to guarantee it NEVER hides behind the home window) ──
  const renderMobileDrawer = () => (
    <Modal
      visible={menuOpen}
      transparent
      animationType="fade"
      onRequestClose={() => setMenuOpen(false)}
    >
      <TouchableWithoutFeedback onPress={() => setMenuOpen(false)}>
        <View style={styles.modalDrawerOverlay}>
          <TouchableWithoutFeedback onPress={() => {}}>
            <View
              style={[
                styles.mobileDrawerModal,
                {
                  backgroundColor: theme.card,
                  borderColor: theme.border,
                  marginTop: isVeryCompact ? (Platform.OS === 'ios' ? 44 : 40) : (isCompactHeight ? (Platform.OS === 'ios' ? 50 : 46) : (Platform.OS === 'ios' ? 58 : 52)),
                  width: isVeryCompact ? 220 : 240,
                },
              ]}
            >
              {/* Drawer Top Header */}
              <View style={[styles.drawerTopBar, { borderBottomColor: theme.border }]}>
                <Text style={[styles.drawerTopTitle, { color: isDark ? '#94A3B8' : '#64748B' }]}>MENU</Text>
                <TouchableOpacity
                  style={[styles.drawerCloseBtn, { backgroundColor: theme.primary + '18' }]}
                  onPress={() => setMenuOpen(false)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={[styles.drawerCloseText, { color: theme.primary }]}>✕</Text>
                </TouchableOpacity>
              </View>

              {/* Scrollable list of menu items with bounded height for compact screens */}
              <ScrollView
                style={{ maxHeight: height * 0.7 }}
                showsVerticalScrollIndicator={false}
                bounces={false}
              >
                {[
                  { icon: '🏠', label: 'Home', screen: 'HomeTab' },
                  { icon: '📋', label: 'My Bookings & Orders', screen: 'History' },
                  { icon: '🏷️', label: 'Sell on FixMart', screen: '__sell__' },
                  { icon: '📦', label: 'Products', screen: 'Products' },
                  { icon: '⚡', label: 'Services', screen: 'Services' },
                  { icon: '🚚', label: 'Book Rider', screen: 'BookParcel' },
                  { icon: '🛒', label: 'Cart', screen: 'CartTab' },
                  { icon: '🔔', label: 'Alerts', screen: 'NotificationsTab' },
                  { icon: '👤', label: 'Profile', screen: 'ProfileTab' },
                ].map(item => (
                  <TouchableOpacity
                    key={item.screen}
                    style={[
                      styles.drawerItem,
                      { borderBottomColor: theme.border },
                      item.screen === '__sell__' && { backgroundColor: theme.primary + '14' },
                      isVeryCompact && { paddingVertical: 8, paddingHorizontal: 12 },
                    ]}
                    onPress={() => {
                      setMenuOpen(false);
                      if (item.screen === '__sell__') handleSellPress();
                      else navigation.navigate(item.screen);
                    }}
                  >
                    <Text style={[styles.drawerItemIcon, isVeryCompact && { fontSize: 14, width: 20 }]}>{item.icon}</Text>
                    <Text
                      style={[
                        styles.drawerItemLabel,
                        { color: item.screen === '__sell__' ? theme.primary : theme.text },
                        item.screen === '__sell__' && { fontWeight: '800' },
                        isVeryCompact && { fontSize: 13 },
                      ]}
                    >
                      {item.label}
                    </Text>
                    <Text style={[styles.drawerChevron, { color: item.screen === '__sell__' ? theme.primary : (theme.lightText || '#8E8E93') }]}>›</Text>
                  </TouchableOpacity>
                ))}
                {userInfo?.role === 'RIDER' && (
                  <TouchableOpacity
                    style={[
                      styles.drawerItem,
                      { backgroundColor: '#34C75912', borderBottomColor: 'transparent' },
                      isVeryCompact && { paddingVertical: 8, paddingHorizontal: 12 }
                    ]}
                    onPress={() => {
                      setMenuOpen(false);
                      navigation.navigate('History', { type: 'orders', role: 'RIDER' });
                    }}
                  >
                    <Text style={[styles.drawerItemIcon, isVeryCompact && { fontSize: 14, width: 20 }]}>🛵</Text>
                    <Text style={[styles.drawerItemLabel, { color: '#34C759', fontWeight: '800' }, isVeryCompact && { fontSize: 13 }]}>Rider Dashboard</Text>
                    <Text style={{ color: '#34C759' }}>›</Text>
                  </TouchableOpacity>
                )}
              </ScrollView>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );


  const renderHero = () => (
    <Animated.View style={{ opacity: heroFadeAnim, transform: [{ translateY: heroSlideAnim }] }}>
      <LinearGradient
        colors={isDark ? ['#0F172A', '#1E293B'] : ['#F0FDF9', '#FFFFFF']}
        style={[
          styles.heroSection,
          isDesktop && styles.heroSectionDesktop,
          isCompactHeight && styles.heroSectionCompact,
          isVeryCompact && styles.heroSectionVeryCompact
        ]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      >
        {/* Decorative background blobs */}
        <View style={[styles.heroBlob1, { backgroundColor: theme.primary + '12' }]} />
        <View style={[styles.heroBlob2, { backgroundColor: (isDark ? '#60A5FA' : '#1B3D6E') + '08' }]} />

        <View style={[styles.heroInner, isDesktop && styles.heroInnerDesktop]}>
          {/* Left: Brand + tagline + CTA buttons */}
          <View style={[styles.heroLeft, isDesktop && styles.heroLeftDesktop]}>
            {isDesktop && (
              <View style={styles.heroBrandRow}>
                <SafeLogo logoUrl={logoUrl} style={{ width: 52, height: 52, marginRight: 12 }} resizeMode="contain" />
                <View>
                  <Text style={styles.heroBrandName}>
                    <Text style={{ color: isDark ? '#60A5FA' : '#1B3D6E' }}>FIX</Text>
                    <Text style={{ color: theme.primary }}>MART</Text>
                  </Text>
                  <View style={[styles.heroBadge, { backgroundColor: theme.primary + '18', borderColor: theme.primary + '30' }]}>
                    <Text style={[styles.heroBadgeText, { color: theme.primary }]}>🌟 Nigeria's #1 Home Services Platform</Text>
                  </View>
                </View>
              </View>
            )}

            <Text style={[
              styles.heroHeadline,
              { color: isDark ? '#F1F5F9' : '#0F172A' },
              isCompactHeight && styles.heroHeadlineCompact,
              isVeryCompact && styles.heroHeadlineVeryCompact
            ]}>
              Everything you need.{'\n'}
              <Text style={{ color: theme.primary }}>One platform.</Text>
            </Text>
            <Text style={[
              styles.heroSubline,
              { color: isDark ? '#94A3B8' : '#64748B' },
              isCompactHeight && styles.heroSublineCompact,
              isVeryCompact && styles.heroSublineVeryCompact
            ]}>
              Shop products, book verified handymen, request delivery riders — all from one trusted marketplace.
            </Text>

            {/* Hero CTA Buttons */}
            <View style={[styles.heroCtaRow, isDesktop && { flexDirection: 'row', flexWrap: 'wrap' }]}>
              <TouchableOpacity
                style={[
                  styles.heroCtaPrimary,
                  { backgroundColor: theme.primary },
                  isCompactHeight && styles.heroCtaCompact,
                  isVeryCompact && styles.heroCtaVeryCompact
                ]}
                onPress={() => navigation.navigate('Products')}
                activeOpacity={0.85}
              >
                <Text style={[
                  styles.heroCtaPrimaryText,
                  isCompactHeight && styles.heroCtaTextCompact,
                  isVeryCompact && styles.heroCtaTextVeryCompact
                ]}>🛍️ Shop Products</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.heroCtaSecondary,
                  { borderColor: theme.primary + '50', backgroundColor: theme.primary + '10' },
                  isCompactHeight && styles.heroCtaCompact,
                  isVeryCompact && styles.heroCtaVeryCompact
                ]}
                onPress={() => navigation.navigate('Services')}
                activeOpacity={0.85}
              >
                <Text style={[
                  styles.heroCtaSecondaryText,
                  { color: theme.primary },
                  isCompactHeight && styles.heroCtaTextCompact,
                  isVeryCompact && styles.heroCtaTextVeryCompact
                ]}>⚡ Book Services</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Right: Quick Action Tiles */}
          <View style={[styles.heroRight, isDesktop && styles.heroRightDesktop, isVeryCompact ? { marginTop: 6 } : (isCompactHeight && { marginTop: 14 })]}>
            <View style={[styles.quickActionsGrid, !isDesktop && styles.quickActionsGridMobile]}>
              {QUICK_ACTIONS.map((action) => (
                <TouchableOpacity
                  key={action.screen}
                  style={[
                    styles.quickTile,
                    { backgroundColor: isDark ? theme.card : '#FFFFFF', borderColor: isDark ? theme.border : '#E2E8F0' },
                    isDesktop && styles.quickTileDesktop,
                    isVeryCompact ? styles.quickTileVeryCompact : (isCompactHeight && styles.quickTileCompact)
                  ]}
                  onPress={() => handleActionPress(action.screen)}
                  activeOpacity={0.82}
                >
                  <View style={[
                    styles.quickTileIcon,
                    { backgroundColor: isDark ? action.bgDark : action.bgLight },
                    isVeryCompact ? styles.quickTileIconVeryCompact : (isCompactHeight && styles.quickTileIconCompact)
                  ]}>
                    <Text style={[
                      styles.quickTileEmoji,
                      isVeryCompact ? styles.quickTileEmojiVeryCompact : (isCompactHeight && styles.quickTileEmojiCompact)
                    ]}>{action.icon}</Text>
                  </View>
                  <Text style={[
                    styles.quickTileLabel,
                    { color: isDark ? '#F1F5F9' : '#1E293B' },
                    isVeryCompact ? styles.quickTileLabelVeryCompact : (isCompactHeight && styles.quickTileLabelCompact)
                  ]}>{action.label}</Text>
                  <View style={[
                    styles.quickTileArrow,
                    { backgroundColor: action.accent + '18' },
                    isVeryCompact ? styles.quickTileArrowVeryCompact : (isCompactHeight && styles.quickTileArrowCompact)
                  ]}>
                    <Text style={[
                      styles.quickTileArrowText,
                      { color: action.accent },
                      isVeryCompact ? styles.quickTileArrowTextVeryCompact : (isCompactHeight && styles.quickTileArrowTextCompact)
                    ]}>→</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </LinearGradient>
    </Animated.View>
  );

  const renderTrustBar = () => (
    <View style={[
      styles.trustBar,
      { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: isDark ? '#334155' : '#E2E8F0' },
      isVeryCompact ? { paddingVertical: 4 } : (isCompactHeight && { paddingVertical: 8 })
    ]}>
      {[
        { icon: '✅', val: '10K+', label: 'Orders Delivered' },
        { icon: '🛠️', val: '500+', label: 'Verified Handymen' },
        { icon: '🚚', val: '200+', label: 'Active Riders' },
        { icon: '⭐', val: '4.9', label: 'Avg Rating' },
      ].map((stat, i, arr) => (
        <React.Fragment key={stat.val}>
          <View style={styles.trustStat}>
            <Text style={[
              styles.trustStatIcon,
              isVeryCompact ? { fontSize: 13, marginBottom: 0 } : (isCompactHeight && { fontSize: 15, marginBottom: 1 })
            ]}>{stat.icon}</Text>
            <Text style={[
              styles.trustStatVal,
              { color: theme.primary },
              isVeryCompact ? { fontSize: 12 } : (isCompactHeight && { fontSize: 14 })
            ]}>{stat.val}</Text>
            <Text style={[
              styles.trustStatLabel,
              { color: isDark ? '#94A3B8' : '#64748B' },
              isVeryCompact ? { fontSize: 8 } : (isCompactHeight && { fontSize: 9 })
            ]}>{stat.label}</Text>
          </View>
          {i < arr.length - 1 && (
            <View style={[
              styles.trustDivider,
              { backgroundColor: isDark ? '#334155' : '#E2E8F0' },
              isVeryCompact ? { height: 18 } : (isCompactHeight && { height: 26 })
            ]} />
          )}
        </React.Fragment>
      ))}
    </View>
  );

  const renderSearch = () => (
    <View style={[
      styles.searchSection,
      isMobile && { paddingHorizontal: 16 },
      isVeryCompact ? { paddingTop: 6 } : (isCompactHeight && { paddingTop: 10 })
    ]}>
      <View style={[
        styles.searchBox,
        { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderColor: searchFocused ? theme.primary : (isDark ? '#334155' : '#E2E8F0') },
        isVeryCompact && { paddingVertical: 2, paddingHorizontal: 10 },
      ]}>
        <Text style={styles.searchBoxIcon}>🔍</Text>
        <TextInput
          style={[styles.searchBoxInput, { color: isDark ? '#F1F5F9' : '#1E293B' }, isVeryCompact && { fontSize: 12, paddingVertical: 4 }]}
          placeholder="Search products, services, categories..."
          placeholderTextColor={isDark ? '#64748B' : '#94A3B8'}
          value={searchQuery}
          onChangeText={handleSearchChange}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
          returnKeyType="search"
          onSubmitEditing={() => {
            if (searchQuery.trim()) {
              navigation.navigate('Products', { search: searchQuery.trim() });
            }
          }}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => { setSearchQuery(''); setSearchResults(null); }} style={styles.searchClear}>
            <Text style={[styles.searchClearText, { color: isDark ? '#64748B' : '#94A3B8' }]}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {searchQuery.length > 0 && (
        <View style={[styles.searchDropdown, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderColor: isDark ? '#334155' : '#E2E8F0' }]}>
          {searchLoading ? (
            <ActivityIndicator color={theme.primary} style={{ marginVertical: 20 }} />
          ) : searchResults && (searchResults.products.length > 0 || searchResults.services.length > 0) ? (
            <>
              {searchResults.services.length > 0 && (
                <View>
                  <Text style={[styles.searchGroupLabel, { color: isDark ? '#64748B' : '#94A3B8' }]}>⚡ SERVICES</Text>
                  {searchResults.services.map(item => (
                    <TouchableOpacity
                      key={item.id}
                      style={[styles.searchResultRow, { borderBottomColor: isDark ? '#1E293B' : '#F8FAFC' }]}
                      onPress={() => { setSearchQuery(''); setSearchResults(null); navigation.navigate('Services'); }}
                    >
                      <View style={[styles.searchResultIcon, { backgroundColor: theme.primary + '15' }]}>
                        <Text>⚡</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.searchResultName, { color: isDark ? '#F1F5F9' : '#1E293B' }]} numberOfLines={1}>{item.name}</Text>
                        <Text style={[styles.searchResultMeta, { color: isDark ? '#64748B' : '#94A3B8' }]}>{item.category}</Text>
                      </View>
                      <Text style={[styles.searchResultArrow, { color: theme.primary }]}>→</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              {searchResults.products.length > 0 && (
                <View>
                  <Text style={[styles.searchGroupLabel, { color: isDark ? '#64748B' : '#94A3B8' }]}>📦 PRODUCTS</Text>
                  {searchResults.products.map(item => (
                    <TouchableOpacity
                      key={item.id}
                      style={[styles.searchResultRow, { borderBottomColor: isDark ? '#1E293B' : '#F8FAFC' }]}
                      onPress={() => { setSearchQuery(''); setSearchResults(null); navigation.navigate('ProductDetail', { productId: item.id }); }}
                    >
                      <View style={[styles.searchResultIcon, { backgroundColor: '#F59E0B15' }]}>
                        <Text>📦</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <Text style={[styles.searchResultName, { color: isDark ? '#F1F5F9' : '#1E293B', flexShrink: 1 }]} numberOfLines={1}>{item.name}</Text>
                          {item.featured && <Text style={{ color: '#F59E0B', fontSize: 10, fontWeight: '800' }}>🚀 BOOSTED</Text>}
                        </View>
                        <Text style={[styles.searchResultMeta, { color: isDark ? '#64748B' : '#94A3B8' }]}>{fmt(item.price)}</Text>
                      </View>
                      <Text style={[styles.searchResultArrow, { color: '#F59E0B' }]}>→</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </>
          ) : (
            <Text style={[styles.searchEmpty, { color: isDark ? '#64748B' : '#94A3B8' }]}>No results for "{searchQuery}"</Text>
          )}
        </View>
      )}
    </View>
  );

  const renderSlider = () => (
    (!slidesLoading || slides.length > 0) && (
      <View style={styles.sliderSection}>
        <ScrollView
          ref={slideScrollViewRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={handleSliderScroll}
          scrollEventThrottle={16}
          style={{ width: slideW }}
        >
          {(slides.length > 0 ? slides : PROMO_SLIDES).map(renderSlide)}
        </ScrollView>
        {slides.length > 1 && (
          <View style={styles.dotRow}>
            {slides.map((_, i) => (
              <TouchableOpacity key={i} onPress={() => {
                setActiveSlideIndex(i);
                slideScrollViewRef.current?.scrollTo({ x: i * slideW, animated: true });
              }}>
                <View style={[
                  styles.dot,
                  { backgroundColor: i === activeSlideIndex ? theme.primary : (isDark ? '#334155' : '#CBD5E1') },
                  i === activeSlideIndex && { width: 20 }
                ]} />
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    )
  );

  const renderPromotedProducts = () => (
    <View style={styles.sectionBlock}>
      <View style={styles.sectionHeader}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Text style={[styles.sectionTitle, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>🚀 Boosted & Promoted Products</Text>
            {promotedProducts.some(p => p.featured) && (
              <View style={[styles.sectionBadge, { backgroundColor: '#FEF3C7', borderColor: '#F59E0B' }]}>
                <Text style={[styles.sectionBadgeText, { color: '#B45309' }]}>⚡ TOP DEALS</Text>
              </View>
            )}
          </View>
          <Text style={[styles.sectionSub, { color: isDark ? '#64748B' : '#94A3B8' }]}>
            Handpicked deals & boosted merchandise from verified vendors
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.seeAllBtn, { backgroundColor: isDark ? '#334155' : '#F1F5F9' }]}
          onPress={() => navigation.navigate('Products')}
          activeOpacity={0.8}
        >
          <Text style={[styles.seeAllBtnText, { color: theme.primary }]}>See All →</Text>
        </TouchableOpacity>
      </View>

      {/* Quick Add Feedback Banner */}
      {addedCartFeedback && (
        <View style={[styles.cartFeedbackBanner, { backgroundColor: theme.primary + '18', borderColor: theme.primary }]}>
          <Text style={[styles.cartFeedbackText, { color: theme.primary }]}>{addedCartFeedback}</Text>
        </View>
      )}

      {productsLoading ? (
        <ActivityIndicator color={theme.primary} style={{ marginVertical: 24 }} />
      ) : promotedProducts.length === 0 ? (
        <View style={[styles.emptyCard, { borderColor: isDark ? '#334155' : '#E2E8F0', backgroundColor: isDark ? '#1E293B' : '#F8FAFC' }]}>
          <Text style={styles.emptyCardIcon}>🛍️</Text>
          <Text style={[styles.emptyCardText, { color: isDark ? '#64748B' : '#94A3B8' }]}>No products listed yet</Text>
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingRight: 8, paddingBottom: 6 }}
        >
          {promotedProducts.map((product) => {
            const isFeatured = !!product.featured;
            const cardWidth = isDesktop ? 220 : isTablet ? 190 : isVeryCompact ? 132 : isCompactHeight ? 148 : 165;
            const imgHeight = isDesktop ? 150 : isTablet ? 135 : isVeryCompact ? 88 : isCompactHeight ? 105 : 120;
            const rawImgUrl = product.images?.[0]?.url || product.imageUrl;
            const imgUri = rawImgUrl ? (getImageUri(rawImgUrl) || rawImgUrl) : null;

            return (
              <TouchableOpacity
                key={product.id}
                style={[
                  styles.productCard,
                  {
                    width: cardWidth,
                    backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
                    borderColor: isFeatured ? '#F59E0B' : (isDark ? '#334155' : '#E2E8F0'),
                    borderWidth: isFeatured ? 2 : 1,
                  },
                  isFeatured && {
                    shadowColor: '#F59E0B',
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.25,
                    shadowRadius: 8,
                    elevation: 4,
                  },
                ]}
                onPress={() => navigation.navigate('ProductDetail', { productId: product.id })}
                activeOpacity={0.88}
              >
                {/* Product Cover Image */}
                <View style={{ position: 'relative', width: '100%', height: imgHeight, borderTopLeftRadius: 16, borderTopRightRadius: 16, overflow: 'hidden', backgroundColor: isDark ? '#0F172A' : '#F1F5F9' }}>
                  {imgUri ? (
                    <Image source={{ uri: imgUri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                  ) : (
                    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 32 }}>📦</Text>
                    </View>
                  )}

                  {/* Boosted Badge */}
                  {isFeatured && (
                    <View style={styles.promotedBadge}>
                      <Text style={styles.promotedBadgeText}>🚀 BOOSTED</Text>
                    </View>
                  )}

                  {/* Category Pill */}
                  {product.category && (
                    <View style={[styles.catPill, isFeatured && { bottom: 6, left: 6 }]}>
                      <Text style={styles.catPillText} numberOfLines={1}>{product.category}</Text>
                    </View>
                  )}
                </View>

                {/* Details */}
                <View style={styles.productCardBody}>
                  <Text style={[styles.productCardName, { color: isDark ? '#F1F5F9' : '#0F172A' }]} numberOfLines={2}>
                    {product.name}
                  </Text>

                  {product.vendor?.name && (
                    <Text style={[styles.productVendorText, { color: isDark ? '#64748B' : '#94A3B8' }]} numberOfLines={1}>
                      🏪 {product.vendor.name}
                    </Text>
                  )}

                  <View style={styles.productPriceRow}>
                    <Text style={[styles.productPriceText, { color: theme.primary }]}>
                      {fmt(product.price || 0)}
                    </Text>
                  </View>

                  {/* Footer with Stock Status and Quick Add */}
                  <View style={styles.productCardFooter}>
                    <Text style={[
                      styles.stockStatusText,
                      { color: (product.stock ?? 0) > 0 ? '#10B981' : '#EF4444' }
                    ]}>
                      {(product.stock ?? 0) > 0 ? '✓ In Stock' : 'Out of stock'}
                    </Text>

                    <TouchableOpacity
                      style={[
                        styles.quickAddBtn,
                        { backgroundColor: theme.primary },
                        (product.stock ?? 0) <= 0 && { opacity: 0.5 }
                      ]}
                      onPress={(e) => {
                        e.stopPropagation();
                        if ((product.stock ?? 0) <= 0) return;
                        addToCart({ id: product.id, name: product.name, price: product.price, type: 'product' });
                        setAddedCartFeedback(`Added "${product.name}" to cart!`);
                        setTimeout(() => setAddedCartFeedback(null), 2500);
                      }}
                      disabled={(product.stock ?? 0) <= 0}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.quickAddBtnText}>+ 🛒</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </View>
  );

  const renderSpotlights = () => (
    <View style={styles.sectionBlock}>
      <View style={styles.sectionHeader}>
        <View>
          <Text style={[styles.sectionTitle, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>🔥 Premium Spotlight</Text>
          <Text style={[styles.sectionSub, { color: isDark ? '#64748B' : '#94A3B8' }]}>Featured & boosted listings</Text>
        </View>
        <View style={[styles.sectionBadge, { backgroundColor: '#FFF3E0', borderColor: '#FFCC02' }]}>
          <Text style={styles.sectionBadgeText}>BOOSTED ADS</Text>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color={theme.primary} style={{ marginVertical: 24 }} />
      ) : promotedListings.length === 0 ? (
        <View style={[styles.emptyCard, { borderColor: isDark ? '#334155' : '#E2E8F0', backgroundColor: isDark ? '#1E293B' : '#F8FAFC' }]}>
          <Text style={styles.emptyCardIcon}>🏷️</Text>
          <Text style={[styles.emptyCardText, { color: isDark ? '#64748B' : '#94A3B8' }]}>No promoted listings yet</Text>
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 4, paddingBottom: 4 }}>
          {promotedListings.map(item => {
            const rawSpotImg = item.images?.[0]?.url || item.imageUrl;
            const spotImgUri = rawSpotImg ? (getImageUri(rawSpotImg) || rawSpotImg) : null;
            return (
              <TouchableOpacity
                key={`${item.itemType}-${item.id}`}
                style={[
                  styles.spotCard,
                  { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderColor: isDark ? '#334155' : '#E2E8F0' },
                  isVeryCompact ? { width: 132 } : (isCompactHeight && { width: 148 })
                ]}
                onPress={() => {
                  if (item.itemType === 'product') navigation.navigate('ProductDetail', { productId: item.id });
                  else navigation.navigate('Services');
                }}
                activeOpacity={0.88}
              >
                {spotImgUri ? (
                  <Image source={{ uri: spotImgUri }} style={[styles.spotImage, isVeryCompact ? { height: 88 } : (isCompactHeight && { height: 105 })]} resizeMode="cover" />
                ) : (
                  <View style={[styles.spotPlaceholder, { backgroundColor: isDark ? '#334155' : '#F1F5F9' }, isVeryCompact ? { height: 88 } : (isCompactHeight && { height: 105 })]}>
                    <Text style={styles.spotPlaceholderIcon}>{item.itemType === 'product' ? '📦' : '⚡'}</Text>
                  </View>
                )}
                <View style={[styles.spotTag, item.itemType === 'product' && { backgroundColor: '#F59E0B' }]}>
                  <Text style={styles.spotTagText}>{item.itemType === 'product' ? '🚀 BOOSTED' : '🔥 HOT'}</Text>
                </View>
                <View style={styles.spotBody}>
                  <Text style={[styles.spotName, { color: isDark ? '#F1F5F9' : '#0F172A' }]} numberOfLines={1}>{item.name}</Text>
                  <Text style={[styles.spotCat, { color: isDark ? '#64748B' : '#94A3B8' }]} numberOfLines={1}>
                    {item.category || (item.itemType === 'product' ? 'Merchandise' : 'Service')}
                  </Text>
                  <View style={styles.spotPriceRow}>
                    <Text style={[styles.spotPrice, { color: theme.primary }]}>
                      {fmt(item.price ?? item.basePrice ?? 0)}
                    </Text>
                    {item.itemType === 'service' && <Text style={[styles.spotPriceSuffix, { color: isDark ? '#64748B' : '#94A3B8' }]}>/hr</Text>}
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </View>
  );

  const renderRiderBanner = () => userInfo?.role === 'RIDER' && (
    <View style={styles.riderBanner}>
      <LinearGradient colors={['#0F172A', '#1E3A5F']} style={styles.riderBannerGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
        <View style={styles.riderBannerDecor} />
        <View style={styles.riderBannerLeft}>
          <Text style={styles.riderBannerIcon}>🛵</Text>
          <View>
            <Text style={styles.riderBannerTitle}>Rider Control Center</Text>
            <Text style={styles.riderBannerSub}>Manage deliveries & track earnings</Text>
          </View>
        </View>
        <View style={styles.riderBannerBtns}>
          <TouchableOpacity
            style={[styles.riderBannerBtn, { backgroundColor: '#22C55E' }]}
            onPress={() => navigation.navigate('History', { type: 'orders', role: 'RIDER' })}
          >
            <Text style={styles.riderBannerBtnText}>📋 Jobs</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.riderBannerBtn, { backgroundColor: '#3B82F6', marginTop: 8 }]}
            onPress={() => navigation.navigate('RiderEarnings')}
          >
            <Text style={styles.riderBannerBtnText}>💰 Earn</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    </View>
  );

  const renderAdminCard = () => (userInfo?.role === 'ADMIN' || userInfo?.role === 'HANDYMAN') && (
    <TouchableOpacity
      style={[styles.adminCard, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderColor: isDark ? '#334155' : '#E2E8F0', borderLeftColor: theme.secondary || theme.primary }]}
      onPress={() => navigation.navigate('History', { type: 'bookings', role: userInfo?.role })}
      activeOpacity={0.85}
    >
      <View style={{ flex: 1 }}>
        <Text style={[styles.adminCardTitle, { color: theme.secondary || theme.primary }]}>📋 Manage Bookings</Text>
        <Text style={[styles.adminCardDesc, { color: isDark ? '#64748B' : '#94A3B8' }]}>
          {userInfo?.role === 'ADMIN'
            ? 'View and manage all platform bookings and job assignments.'
            : 'View your assigned jobs, track locations, and mark completions.'}
        </Text>
      </View>
      <View style={[styles.chevronCircle, { backgroundColor: isDark ? '#334155' : '#F1F5F9' }]}>
        <Text style={[styles.chevronText, { color: isDark ? '#94A3B8' : '#64748B' }]}>→</Text>
      </View>
    </TouchableOpacity>
  );

  const renderDownloadBanner = () => Platform.OS === 'web' && (
    <View style={[styles.downloadBanner, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderColor: isDark ? '#334155' : '#E2E8F0' }]}>
      <View style={styles.downloadBannerLeft}>
        <Text style={styles.downloadBannerIcon}>📱</Text>
        <View>
          <Text style={[styles.downloadBannerTitle, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>Get the FixMart App</Text>
          <Text style={[styles.downloadBannerSub, { color: isDark ? '#64748B' : '#94A3B8' }]}>Available on Google Play Store & Direct Android APK</Text>
        </View>
      </View>
      <View style={styles.downloadBannerBtns}>
        <TouchableOpacity
          style={[styles.playStoreBtn, { backgroundColor: '#0F172A' }]}
          onPress={() => Linking.openURL(playstoreUrl || 'https://play.google.com/store/apps/details?id=com.akpoaza.kachlinks&pcampaignid=web_share&pli=1')}
          activeOpacity={0.85}
        >
          <Text style={styles.playStoreTriangle}>▶</Text>
          <View style={styles.playStoreBtnTextBox}>
            <Text style={styles.playStoreSubText}>GET IT ON</Text>
            <Text style={styles.playStoreMainText}>Google Play</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.downloadBtn, { backgroundColor: '#16A34A' }]}
          onPress={() => triggerDownload(apkUrl, 'fixmart-latest.apk')}
          activeOpacity={0.85}
        >
          <Text style={styles.downloadBtnText}>📥 Direct APK</Text>
          <Text style={[styles.downloadBtnText, { fontSize: 10, fontWeight: '500', opacity: 0.9 }]}>v6.0.3 · Fast Install</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderFooter = () => (
    <View style={[styles.footer, { borderTopColor: isDark ? '#334155' : '#E2E8F0' }]}>
      <View style={styles.footerBrand}>
        <SafeLogo logoUrl={logoUrl} style={{ width: 28, height: 28 }} resizeMode="contain" />
        <Text style={styles.footerBrandText}>
          <Text style={{ color: isDark ? '#60A5FA' : '#1B3D6E', fontWeight: '900' }}>Fix</Text>
          <Text style={{ color: theme.primary, fontWeight: '900' }}>Mart</Text>
        </Text>
      </View>
      <View style={styles.footerAppBadges}>
        <TouchableOpacity
          onPress={() => triggerDownload(apkUrl, 'fixmart-latest.apk')}
          style={[styles.footerAppBadge, { backgroundColor: '#16A34A' }]}
          activeOpacity={0.85}
        >
          <Text style={styles.footerAppBadgeText}>📥 Direct APK (v6.0.3)</Text>
        </TouchableOpacity>
      </View>
      <Text style={[styles.footerText, { color: isDark ? '#475569' : '#94A3B8' }]}>{footerText || '© 2026 FixMart. All rights reserved.'}</Text>
    </View>
  );

  const renderVendorModal = () => (
    <Modal
      visible={showVendorModal}
      transparent
      animationType="fade"
      onRequestClose={() => setShowVendorModal(false)}
    >
      <View style={styles.vendorModalOverlay}>
        <View style={[styles.vendorModalCard, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderColor: isDark ? '#334155' : '#E2E8F0' }]}>
          <View style={[styles.vendorModalIconCircle, { backgroundColor: theme.primary + '18' }]}>
            <Text style={styles.vendorModalEmoji}>
              {vendorModalType === 'KYC' ? '⏳' : '🏪'}
            </Text>
          </View>

          <Text style={[styles.vendorModalTitle, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>
            {vendorModalType === 'REGISTER'
              ? 'Become a Seller on FixMart'
              : vendorModalType === 'UPGRADE'
              ? 'Start Selling on FixMart'
              : 'Vendor Verification Pending'}
          </Text>

          <Text style={[styles.vendorModalSubtitle, { color: isDark ? '#94A3B8' : '#64748B' }]}>
            {vendorModalType === 'REGISTER'
              ? 'List and sell your tools, equipment, materials & hardware to thousands of buyers across Nigeria.'
              : vendorModalType === 'UPGRADE'
              ? 'Activate your seller privileges to list products, manage inventory, and receive customer payments directly in your wallet.'
              : 'Your vendor account requires identity verification before your product listings go live to buyers.'}
          </Text>

          <View style={styles.vendorModalActions}>
            {vendorModalType === 'REGISTER' && (
              <>
                <TouchableOpacity
                  style={[styles.vendorModalBtnPrimary, { backgroundColor: theme.primary }]}
                  onPress={() => {
                    setShowVendorModal(false);
                    navigation.navigate('Signup', { role: 'VENDOR', initialRole: 'VENDOR' });
                  }}
                  activeOpacity={0.85}
                >
                  <Text style={styles.vendorModalBtnPrimaryText}>🚀 Register as Vendor</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.vendorModalBtnSecondary, { borderColor: isDark ? '#334155' : '#E2E8F0', backgroundColor: isDark ? '#0F172A' : '#F8FAFC' }]}
                  onPress={() => {
                    setShowVendorModal(false);
                    navigation.navigate('Login');
                  }}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.vendorModalBtnSecondaryText, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>
                    🔐 Log In to Existing Account
                  </Text>
                </TouchableOpacity>
              </>
            )}

            {vendorModalType === 'UPGRADE' && (
              <>
                <TouchableOpacity
                  style={[styles.vendorModalBtnPrimary, { backgroundColor: theme.primary }]}
                  onPress={() => {
                    setShowVendorModal(false);
                    navigation.navigate('KYCVerification', { role: 'VENDOR' });
                  }}
                  activeOpacity={0.85}
                >
                  <Text style={styles.vendorModalBtnPrimaryText}>🚀 Complete Seller Setup</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.vendorModalBtnSecondary, { borderColor: isDark ? '#334155' : '#E2E8F0', backgroundColor: isDark ? '#0F172A' : '#F8FAFC' }]}
                  onPress={() => {
                    setShowVendorModal(false);
                    navigation.navigate('Login');
                  }}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.vendorModalBtnSecondaryText, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>
                    👤 Switch Account
                  </Text>
                </TouchableOpacity>
              </>
            )}

            {vendorModalType === 'KYC' && (
              <>
                <TouchableOpacity
                  style={[styles.vendorModalBtnPrimary, { backgroundColor: theme.primary }]}
                  onPress={() => {
                    setShowVendorModal(false);
                    navigation.navigate('KYCVerification', { role: 'VENDOR' });
                  }}
                  activeOpacity={0.85}
                >
                  <Text style={styles.vendorModalBtnPrimaryText}>⚡ Complete KYC Verification</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.vendorModalBtnSecondary, { borderColor: isDark ? '#334155' : '#E2E8F0', backgroundColor: isDark ? '#0F172A' : '#F8FAFC' }]}
                  onPress={() => {
                    setShowVendorModal(false);
                    navigation.navigate('KYCStatus');
                  }}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.vendorModalBtnSecondaryText, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>
                    📊 Check Status
                  </Text>
                </TouchableOpacity>
              </>
            )}

            <TouchableOpacity
              style={styles.vendorModalCancelBtn}
              onPress={() => setShowVendorModal(false)}
            >
              <Text style={[styles.vendorModalCancelText, { color: isDark ? '#64748B' : '#94A3B8' }]}>Keep Browsing</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  // ── Main Render ──────────────────────────────────────────────────────────
  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      {renderVendorModal()}
      {/* Sticky Navbar */}
      {Platform.OS === 'web' ? (
        <View style={styles.stickyNav}>
          {isDesktop || isTablet ? renderDesktopNavbar() : renderMobileNavbar()}
        </View>
      ) : renderMobileNavbar()}

      {/* Page Content */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.pageContent, Platform.OS === 'web' && styles.pageContentWeb]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <ResponsiveContainer maxWidth={1280}>
          {/* Hero */}
          {renderHero()}

          {/* Trust Bar */}
          {renderTrustBar()}

          {/* Search */}
          {renderSearch()}

          {/* Rider Banner */}
          {renderRiderBanner()}

          {/* Slider Carousel */}
          {renderSlider()}

          {/* Promoted Products */}
          {renderPromotedProducts()}

          {/* Premium Spotlights */}
          {renderSpotlights()}

          {/* Admin / Handyman Card */}
          {renderAdminCard()}

          {/* Download App Banner */}
          {renderDownloadBanner()}

          {/* Footer */}
          {renderFooter()}
        </ResponsiveContainer>
      </ScrollView>

      {/* Mobile Hamburger Modal Drawer — native overlay that cannot be obscured */}
      {renderMobileDrawer()}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1 },
  stickyNav: { zIndex: 1000, ...Platform.select({ web: { position: 'sticky' as any, top: 0 } }) },

  // ── Desktop Navbar ────────────────────────────────────────────────────────
  desktopNavbar: {
    borderBottomWidth: 1,
    paddingHorizontal: 24,
    height: 60,
    justifyContent: 'center',
  },
  desktopNavInner: {
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: 1280,
    width: '100%',
    alignSelf: 'center',
  },
  desktopNavLinks: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 32,
    gap: 4,
  },
  navLinkBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'center',
  },
  navLinkText: { fontSize: 14, fontWeight: '600' },
  navLinkActive: { height: 2, borderRadius: 2, marginTop: 3, width: '60%' },
  desktopNavRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  navIconBtn: {
    width: 36, height: 36, borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  navIconBtnText: { fontSize: 16 },

  // ── Mobile Navbar ─────────────────────────────────────────────────────────
  mobileNavbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    zIndex: 100,
    position: 'relative',
  },
  mobileNavRight: { flexDirection: 'row', alignItems: 'center' },
  hamburger: {
    width: 36, height: 36, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  hamburgerText: { fontSize: 18, fontWeight: '700' },
  modalDrawerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
  },
  mobileDrawerModal: {
    marginRight: 12,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 25,
  },
  drawerTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  drawerTopTitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  drawerCloseBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  drawerCloseText: {
    fontSize: 11,
    fontWeight: '800',
  },
  drawerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  drawerItemIcon: { fontSize: 15, marginRight: 8, width: 22, textAlign: 'center' },
  drawerItemLabel: { flex: 1, fontSize: 13.5, fontWeight: '600' },
  drawerChevron: { fontSize: 16, fontWeight: '300' },

  // ── Shared Nav ────────────────────────────────────────────────────────────
  navBrand: { flexDirection: 'row', alignItems: 'center' },
  navBrandText: { fontSize: 20, fontWeight: '900', marginLeft: 8, letterSpacing: -0.5 },
  navBrandFix: { color: '#1B3D6E' },
  navBrandMart: { color: '#22A45D' },
  mobileNavTagline: { fontSize: 10, fontWeight: '500', marginTop: 1 },
  navAvatar: {
    width: 36, height: 36, borderRadius: 18,
    borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  navAvatarText: { fontSize: 15, fontWeight: '800' },

  // ── Page Layout ───────────────────────────────────────────────────────────
  pageContent: { paddingBottom: 40 },
  pageContentWeb: { paddingTop: 0 },

  // ── Hero ──────────────────────────────────────────────────────────────────
  heroSection: {
    paddingHorizontal: 20,
    paddingVertical: 36,
    marginBottom: 0,
    position: 'relative',
    overflow: 'hidden',
  },
  heroSectionDesktop: {
    paddingHorizontal: 48,
    paddingVertical: 56,
  },
  heroSectionCompact: {
    paddingHorizontal: 14,
    paddingVertical: 18,
  },
  heroSectionVeryCompact: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  heroBlob1: {
    position: 'absolute',
    width: 300, height: 300,
    borderRadius: 150,
    top: -80, right: -60,
  },
  heroBlob2: {
    position: 'absolute',
    width: 200, height: 200,
    borderRadius: 100,
    bottom: -40, left: -40,
  },
  heroInner: {
    zIndex: 1,
  },
  heroInnerDesktop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 48,
  },
  heroLeft: { flex: 1 },
  heroLeftDesktop: { maxWidth: 520 },
  heroRight: { marginTop: 28 },
  heroRightDesktop: { flex: 1, marginTop: 0 },

  heroBrandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  heroBrandName: {
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: -1,
    marginBottom: 4,
  },
  heroBadge: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
    borderWidth: 1,
  },
  heroBadgeText: { fontSize: 11, fontWeight: '700' },

  heroHeadline: {
    fontSize: 30,
    fontWeight: '900',
    lineHeight: 38,
    marginBottom: 12,
    letterSpacing: -0.5,
  },
  heroHeadlineCompact: {
    fontSize: 22,
    lineHeight: 28,
    marginBottom: 8,
  },
  heroHeadlineVeryCompact: {
    fontSize: 19,
    lineHeight: 23,
    marginBottom: 4,
  },
  heroSubline: {
    fontSize: 14,
    lineHeight: 22,
    fontWeight: '500',
    marginBottom: 24,
    maxWidth: 440,
  },
  heroSublineCompact: {
    fontSize: 12.5,
    lineHeight: 18,
    marginBottom: 14,
  },
  heroSublineVeryCompact: {
    fontSize: 11.5,
    lineHeight: 15,
    marginBottom: 8,
  },

  heroCtaRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  heroCtaPrimary: {
    paddingHorizontal: 20,
    paddingVertical: 13,
    borderRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  heroCtaPrimaryText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  heroCtaSecondary: {
    paddingHorizontal: 20,
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  heroCtaSecondaryText: {
    fontSize: 14,
    fontWeight: '800',
  },
  heroCtaCompact: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
  },
  heroCtaVeryCompact: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 8,
  },
  heroCtaTextCompact: {
    fontSize: 13,
  },
  heroCtaTextVeryCompact: {
    fontSize: 11.5,
  },

  // ── Quick Action Tiles ─────────────────────────────────────────────────────
  quickActionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  quickActionsGridMobile: {
    justifyContent: 'center',
  },
  quickTile: {
    width: 148,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
    flexDirection: 'column',
    gap: 8,
  },
  quickTileCompact: {
    width: 136,
    padding: 10,
    borderRadius: 12,
    gap: 4,
  },
  quickTileVeryCompact: {
    width: 124,
    padding: 6,
    borderRadius: 10,
    gap: 2,
  },
  quickTileDesktop: {
    flex: 1,
    width: 'auto' as any,
    minWidth: 110,
  },
  quickTileIcon: {
    width: 44, height: 44, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  quickTileIconCompact: {
    width: 36,
    height: 36,
    borderRadius: 10,
  },
  quickTileIconVeryCompact: {
    width: 28,
    height: 28,
    borderRadius: 7,
  },
  quickTileEmoji: { fontSize: 22 },
  quickTileEmojiCompact: { fontSize: 18 },
  quickTileEmojiVeryCompact: { fontSize: 14 },
  quickTileLabel: { fontSize: 13, fontWeight: '800' },
  quickTileLabelCompact: { fontSize: 12 },
  quickTileLabelVeryCompact: { fontSize: 10.5 },
  quickTileArrow: {
    alignSelf: 'flex-start',
    width: 28, height: 28, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  quickTileArrowCompact: {
    width: 24,
    height: 24,
    borderRadius: 6,
  },
  quickTileArrowVeryCompact: {
    width: 18,
    height: 18,
    borderRadius: 5,
  },
  quickTileArrowText: { fontSize: 14, fontWeight: '800' },
  quickTileArrowTextCompact: { fontSize: 12 },
  quickTileArrowTextVeryCompact: { fontSize: 9.5 },


  // ── Trust Bar ────────────────────────────────────────────────────────────
  trustBar: {
    flexDirection: 'row',
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  trustStat: { alignItems: 'center', flex: 1 },
  trustStatIcon: { fontSize: 18, marginBottom: 2 },
  trustStatVal: { fontSize: 18, fontWeight: '900' },
  trustStatLabel: { fontSize: 10, fontWeight: '600', textAlign: 'center' },
  trustDivider: { width: 1, height: 36 },

  // ── Search ────────────────────────────────────────────────────────────────
  searchSection: { paddingHorizontal: 40, paddingTop: 20, zIndex: 50 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 10 : 4,
  },
  searchBoxIcon: { fontSize: 16, marginRight: 8 },
  searchBoxInput: { flex: 1, fontSize: 14, fontWeight: '500', paddingVertical: 8 },
  searchClear: { padding: 6 },
  searchClearText: { fontSize: 13, fontWeight: '700' },
  searchDropdown: {
    marginTop: 6,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  searchGroupLabel: {
    fontSize: 10, fontWeight: '800', letterSpacing: 0.6,
    paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4,
  },
  searchResultRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: 1,
  },
  searchResultIcon: {
    width: 34, height: 34, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    marginRight: 10,
  },
  searchResultName: { fontSize: 14, fontWeight: '600', marginBottom: 1 },
  searchResultMeta: { fontSize: 12 },
  searchResultArrow: { fontSize: 16, fontWeight: '700', marginLeft: 6 },
  searchEmpty: { textAlign: 'center', fontSize: 13, paddingVertical: 20 },

  // ── Slider ────────────────────────────────────────────────────────────────
  sliderSection: {
    marginHorizontal: 20,
    marginTop: 20,
    borderRadius: 20,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  slideCard: { position: 'relative', overflow: 'hidden' },
  slideImage: { width: '100%', height: '100%' },
  slideCaptionContainer: { position: 'absolute', bottom: 20, left: 20, right: 20 },
  slideCaptionText: {
    color: '#FFF', fontSize: 18, fontWeight: '800',
    textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
  },
  promoSlideGradient: {
    flex: 1, justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 20,
  },
  slideDecor1: {
    position: 'absolute', width: 180, height: 180, borderRadius: 90,
    top: -60, right: -30,
  },
  slideDecor2: {
    position: 'absolute', width: 120, height: 120, borderRadius: 60,
    bottom: -30, left: -20,
  },
  promoSlideContent: { flexDirection: 'row', alignItems: 'center', zIndex: 1 },
  promoSlideIconWrap: {
    width: 56, height: 56, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  promoSlideIcon: { fontSize: 28 },
  promoSlideTitle: { fontSize: 20, fontWeight: '900', color: '#FFFFFF', marginBottom: 4 },
  promoSlideSub: { fontSize: 12, color: 'rgba(255,255,255,0.85)', fontWeight: '500', lineHeight: 17 },
  promoSlideCtaBtn: {
    paddingHorizontal: 14, paddingVertical: 9,
    borderRadius: 20, marginLeft: 12,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.2, shadowRadius: 5, elevation: 3,
  },
  promoSlideCtaText: { fontSize: 12, fontWeight: '800' },
  promoSlideCtaArrow: { fontSize: 16, fontWeight: '900' },
  dotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
  },
  dot: {
    width: 6, height: 6, borderRadius: 3,
  },

  // ── Section ───────────────────────────────────────────────────────────────
  sectionBlock: {
    marginTop: 28,
    paddingHorizontal: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: { fontSize: 20, fontWeight: '900' },
  sectionSub: { fontSize: 12, marginTop: 2, fontWeight: '500' },
  sectionBadge: {
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 8, borderWidth: 1,
  },
  sectionBadgeText: {
    fontSize: 9, fontWeight: '800', color: '#D97706', letterSpacing: 0.5,
  },

  // ── Spotlight Cards ────────────────────────────────────────────────────────
  emptyCard: {
    borderWidth: 1, borderStyle: 'dashed',
    borderRadius: 16, padding: 32,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 8,
  },
  emptyCardIcon: { fontSize: 32, marginBottom: 8 },
  emptyCardText: { fontSize: 13, fontWeight: '600' },

  spotCard: {
    width: 168,
    borderRadius: 18,
    borderWidth: 1,
    marginRight: 14,
    marginBottom: 4,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },
  spotImage: { width: '100%', height: 130 },
  spotPlaceholder: { width: '100%', height: 100, alignItems: 'center', justifyContent: 'center' },
  spotPlaceholderIcon: { fontSize: 28 },
  spotTag: {
    position: 'absolute', top: 8, left: 8,
    backgroundColor: '#EF4444',
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6,
  },
  spotTagText: { color: '#FFF', fontSize: 9, fontWeight: '800' },
  spotBody: { padding: 12 },
  spotName: { fontSize: 13, fontWeight: '800', marginBottom: 2 },
  spotCat: { fontSize: 11, marginBottom: 8 },
  spotPriceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
  spotPrice: { fontSize: 16, fontWeight: '900' },
  spotPriceSuffix: { fontSize: 10 },

  // ── Rider Banner ──────────────────────────────────────────────────────────
  riderBanner: {
    marginHorizontal: 20,
    marginTop: 20,
    borderRadius: 20,
    overflow: 'hidden',
  },
  riderBannerGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 18,
    gap: 12,
  },
  riderBannerDecor: {
    position: 'absolute',
    width: 150, height: 150, borderRadius: 75,
    backgroundColor: '#FFFFFF08',
    top: -50, right: -20,
  },
  riderBannerLeft: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  riderBannerIcon: { fontSize: 34 },
  riderBannerTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
  riderBannerSub: { color: '#94A3B8', fontSize: 12, marginTop: 2 },
  riderBannerBtns: { gap: 0 },
  riderBannerBtn: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 10, alignItems: 'center', minWidth: 90,
  },
  riderBannerBtnText: { color: '#FFF', fontSize: 12, fontWeight: '800' },

  // ── Admin Card ────────────────────────────────────────────────────────────
  adminCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginTop: 20,
    padding: 18,
    borderRadius: 16,
    borderWidth: 1,
    borderLeftWidth: 5,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  adminCardTitle: { fontSize: 15, fontWeight: '800', marginBottom: 4 },
  adminCardDesc: { fontSize: 13, lineHeight: 18 },
  chevronCircle: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
    marginLeft: 12,
  },
  chevronText: { fontSize: 18, fontWeight: '700' },

  // ── Download Banner ────────────────────────────────────────────────────────
  downloadBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 16,
    marginHorizontal: 20,
    marginTop: 24,
    padding: 20,
    borderRadius: 18,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  downloadBannerLeft: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  downloadBannerIcon: { fontSize: 36 },
  downloadBannerTitle: { fontSize: 17, fontWeight: '900' },
  downloadBannerSub: { fontSize: 12, marginTop: 2 },
  downloadBannerBtns: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  downloadBtn: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  downloadBtnText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  playStoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    gap: 8,
  },
  playStoreTriangle: {
    color: '#38BDF8',
    fontSize: 18,
    fontWeight: '900',
  },
  playStoreBtnTextBox: {
    justifyContent: 'center',
  },
  playStoreSubText: {
    color: '#94A3B8',
    fontSize: 8.5,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  playStoreMainText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 16,
  },
  navPlayStoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#334155',
  },
  navPlayStoreIcon: {
    color: '#38BDF8',
    fontSize: 11,
    marginRight: 6,
    fontWeight: '900',
  },
  navPlayStoreText: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '700',
  },

  // ── Footer ────────────────────────────────────────────────────────────────
  footer: {
    marginTop: 32,
    marginHorizontal: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    alignItems: 'center',
    paddingBottom: 16,
    gap: 10,
  },
  footerBrand: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  footerBrandText: { fontSize: 18, fontWeight: '900', letterSpacing: -0.5 },
  footerAppBadges: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginVertical: 4,
  },
  footerAppBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  footerAppBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  footerText: { fontSize: 12, textAlign: 'center', lineHeight: 18 },

  // ── Vendor Modal ──────────────────────────────────────────────────────────
  vendorModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    zIndex: 9999,
  },
  vendorModalCard: {
    width: '100%',
    maxWidth: 440,
    borderRadius: 24,
    borderWidth: 1,
    padding: 28,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 12,
  },
  vendorModalIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  vendorModalEmoji: { fontSize: 32 },
  vendorModalTitle: {
    fontSize: 20,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: -0.3,
  },
  vendorModalSubtitle: {
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 24,
  },
  vendorModalActions: { width: '100%', gap: 10 },
  vendorModalBtnPrimary: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  vendorModalBtnPrimaryText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  vendorModalBtnSecondary: {
    width: '100%',
    paddingVertical: 13,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vendorModalBtnSecondaryText: {
    fontSize: 13,
    fontWeight: '700',
  },
  vendorModalCancelBtn: {
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 4,
  },
  vendorModalCancelText: {
    fontSize: 13,
    fontWeight: '600',
  },

  // ── Promoted Products Showcase ─────────────────────────────────────────────
  seeAllBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  seeAllBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  cartFeedbackBanner: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginBottom: 12,
    alignItems: 'center',
  },
  cartFeedbackText: {
    fontSize: 12,
    fontWeight: '700',
  },
  productCard: {
    borderRadius: 16,
    marginRight: 14,
    marginBottom: 6,
    overflow: 'hidden',
  },
  promotedBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: '#F59E0B',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    zIndex: 2,
  },
  promotedBadgeText: {
    color: '#FFF',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  catPill: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    maxWidth: '70%',
  },
  catPillText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '600',
  },
  productCardBody: {
    padding: 10,
  },
  productCardName: {
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 17,
    minHeight: 34,
    marginBottom: 4,
  },
  productVendorText: {
    fontSize: 11,
    marginBottom: 6,
  },
  productPriceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 8,
  },
  productPriceText: {
    fontSize: 15,
    fontWeight: '900',
  },
  productCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(150,150,150,0.15)',
  },
  stockStatusText: {
    fontSize: 10,
    fontWeight: '700',
  },
  quickAddBtn: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickAddBtnText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '800',
  },
});
