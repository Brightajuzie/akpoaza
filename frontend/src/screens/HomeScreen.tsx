import React, { useContext, useEffect, useState, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  ScrollView,
  Image,
  ActivityIndicator,
  TextInput,
  useWindowDimensions,
  Platform,
  Linking,
  Alert,
  Animated,
  Modal,
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
import UserGuideModal from '../components/UserGuideModal';

// ─── Constants ────────────────────────────────────────────────────────────────
const DEFAULT_SLIDES = [
  {
    id: 'slide-1',
    title: '🔥 Mega Tool Sale',
    subtitle: 'Up to 40% off power tools, building supplies & hardware!',
    cta: 'Shop Now',
    gradient: ['#0F2C18', '#1A5C32'] as const,
    accent: '#4ADE80',
    icon: '🛒',
    action: 'Products',
  },
  {
    id: 'slide-2',
    title: '⚡ Verified Handymen on Demand',
    subtitle: 'Expert plumbers, electricians & technicians at your doorstep.',
    cta: 'Book Now',
    gradient: ['#0A1628', '#0D3A6E'] as const,
    accent: '#60A5FA',
    icon: '🔧',
    action: 'Services',
  },
  {
    id: 'slide-3',
    title: '🛵 Express Dispatch Delivery',
    subtitle: 'Fast, secure parcel sending with real-time GPS tracking.',
    cta: 'Send Parcel',
    gradient: ['#1C1917', '#382F2D'] as const,
    accent: '#F97316',
    icon: '📦',
    action: 'BookParcel',
  },
];

const QUICK_ACTIONS = [
  {
    id: 'shop',
    icon: '🛍️',
    title: 'Shop Store',
    subtitle: 'Tools & Hardware',
    screen: 'Products',
    color: '#22A45D',
    bgLight: '#E8F5E9',
    bgDark: '#132E20',
  },
  {
    id: 'workman',
    icon: '⚡',
    title: 'Book Workman',
    subtitle: 'Verified Artisans',
    screen: 'Services',
    color: '#3B82F6',
    bgLight: '#EFF6FF',
    bgDark: '#0D223E',
  },
  {
    id: 'rider',
    icon: '🛵',
    title: 'Send Parcel',
    subtitle: 'Express Delivery',
    screen: 'BookParcel',
    color: '#10B981',
    bgLight: '#ECFDF5',
    bgDark: '#0E2A1E',
  },
  {
    id: 'sell',
    icon: '🏷️',
    title: 'Sell Items',
    subtitle: 'Vendor Portal',
    screen: '__sell__',
    color: '#F59E0B',
    bgLight: '#FFFBEB',
    bgDark: '#352509',
  },
];

const SERVICE_CATEGORY_META: Record<string, { icon: string; color: string; bg: string }> = {
  Plumbing: { icon: '🚿', color: '#3B82F6', bg: '#EFF6FF' },
  Electrical: { icon: '⚡', color: '#F59E0B', bg: '#FFFBEB' },
  General: { icon: '🔧', color: '#10B981', bg: '#F0FDF4' },
  Carpentry: { icon: '🪚', color: '#8B5CF6', bg: '#F5F3FF' },
  Painting: { icon: '🖌️', color: '#EC4899', bg: '#FDF2F8' },
  Cleaning: { icon: '🧹', color: '#06B6D4', bg: '#ECFEFF' },
  HVAC: { icon: '❄️', color: '#0EA5E9', bg: '#F0F9FF' },
  default: { icon: '🛠️', color: '#64748B', bg: '#F8FAFC' },
};

const NAV_LINKS = [
  { label: 'Home', screen: 'HomeTab' },
  { label: 'Products', screen: 'Products' },
  { label: 'Book Workman', screen: 'Services' },
  { label: 'Send Parcel', screen: 'BookParcel' },
  { label: 'My Bookings', screen: 'History' },
];

export default function HomeScreen({ navigation }: any) {
  const { userInfo } = useContext(AuthContext);
  const { theme, logoUrl, footerText, colorMode } = useContext(SettingsContext);
  const { cart, addToCart } = useContext(CartContext);
  const { fmt } = useCurrency();
  const { width, height } = useWindowDimensions();

  // Responsive breakpoints
  const isDesktop = width >= 1024;
  const isTablet = width >= 768 && width < 1024;
  const isMobile = width < 768;
  const isDark = colorMode === 'dark';

  // Total cart count
  const cartItemCount = useMemo(() => {
    return cart?.reduce((acc: number, item: any) => acc + (item.quantity || 1), 0) || 0;
  }, [cart]);

  // Content width inside responsive container
  const contentWidth = Math.min(width, 1200);
  const horizontalPadding = isMobile ? 16 : 24;
  const usableWidth = contentWidth - horizontalPadding * 2;
  const slideWidth = usableWidth;
  const slideHeight = isDesktop ? 260 : isTablet ? 220 : 160;

  // State
  const [promotedProducts, setPromotedProducts] = useState<any[]>([]);
  const [featuredServices, setFeaturedServices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [addedCartFeedback, setAddedCartFeedback] = useState<string | null>(null);

  // Slides
  const [slides, setSlides] = useState<any[]>(DEFAULT_SLIDES);
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const slideScrollViewRef = useRef<ScrollView>(null);

  // Search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{ products: any[]; services: any[] } | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const searchDebounceRef = useRef<any>(null);

  // Modals & Navigation
  const [menuOpen, setMenuOpen] = useState(false);
  const [showUserGuide, setShowUserGuide] = useState(false);
  const [showVendorModal, setShowVendorModal] = useState(false);
  const [vendorModalType, setVendorModalType] = useState<'REGISTER' | 'UPGRADE' | 'KYC'>('REGISTER');

  // Notifications
  const [unreadNotifsCount, setUnreadNotifsCount] = useState(0);
  const [latestUnreadNotif, setLatestUnreadNotif] = useState<any>(null);
  const [dismissedNotifId, setDismissedNotifId] = useState<string | null>(null);

  const heroFadeAnim = useRef(new Animated.Value(0)).current;

  // ── Handlers ─────────────────────────────────────────────────────────────
  const fetchUnreadNotifications = useCallback(async () => {
    if (!userInfo) return;
    try {
      const res = await apiClient.get('/notifications');
      const count = res.data?.unreadCount || 0;
      setUnreadNotifsCount(count);
      const unreadList = (res.data?.notifications || []).filter((n: any) => !n.read);
      setLatestUnreadNotif(unreadList.length > 0 ? unreadList[0] : null);
    } catch {
      // silently ignore
    }
  }, [userInfo]);

  useEffect(() => {
    fetchUnreadNotifications();
    const interval = setInterval(fetchUnreadNotifications, 30000);
    return () => clearInterval(interval);
  }, [fetchUnreadNotifications]);

  useEffect(() => {
    Animated.timing(heroFadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();

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

  // Fetch Slides
  useEffect(() => {
    const fetchSlides = async () => {
      try {
        const res = await apiClient.get('/slides');
        if (Array.isArray(res.data) && res.data.length > 0) {
          setSlides(res.data);
        } else {
          setSlides(DEFAULT_SLIDES);
        }
      } catch {
        setSlides(DEFAULT_SLIDES);
      }
    };
    fetchSlides();
  }, []);

  // Slide Auto-play
  useEffect(() => {
    if (slides.length <= 1) return;
    const interval = setInterval(() => {
      const nextIndex = (activeSlideIndex + 1) % slides.length;
      setActiveSlideIndex(nextIndex);
      slideScrollViewRef.current?.scrollTo({ x: nextIndex * slideWidth, animated: true });
    }, 5000);
    return () => clearInterval(interval);
  }, [slides, activeSlideIndex, slideWidth]);

  const handleSliderScroll = (e: any) => {
    const x = e.nativeEvent.contentOffset.x;
    const i = Math.round(x / slideWidth);
    if (i !== activeSlideIndex && i >= 0 && i < slides.length) {
      setActiveSlideIndex(i);
    }
  };

  // Search logic
  const performSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults(null);
      return;
    }
    setSearchLoading(true);
    try {
      const [pr, sr] = await Promise.all([
        apiClient.get(`/products?search=${encodeURIComponent(query)}`),
        apiClient.get(`/services?search=${encodeURIComponent(query)}`),
      ]);
      setSearchResults({
        products: (Array.isArray(pr.data) ? pr.data : []).slice(0, 5),
        services: (Array.isArray(sr.data) ? sr.data : []).slice(0, 5),
      });
    } catch {
      // silent
    } finally {
      setSearchLoading(false);
    }
  }, []);

  const handleSearchChange = (text: string) => {
    setSearchQuery(text);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => performSearch(text), 150);
  };

  // Load Products & Services
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [pr, sr] = await Promise.allSettled([apiClient.get('/products'), apiClient.get('/services')]);

      if (pr.status === 'fulfilled' && Array.isArray(pr.value.data)) {
        const rawProds = pr.value.data;
        const featured = rawProds.filter((p: any) => p.featured);
        const others = rawProds.filter((p: any) => !p.featured);
        setPromotedProducts(featured.length > 0 ? [...featured, ...others.slice(0, 8 - featured.length)] : rawProds.slice(0, 8));
      }

      if (sr.status === 'fulfilled' && Array.isArray(sr.value.data)) {
        const rawServices = sr.value.data;
        const featured = rawServices.filter((s: any) => s.featured);
        const others = rawServices.filter((s: any) => !s.featured);
        setFeaturedServices(featured.length > 0 ? [...featured, ...others.slice(0, 6 - featured.length)] : rawServices.slice(0, 6));
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData])
  );

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
    setVendorModalType('UPGRADE');
    setShowVendorModal(true);
  };

  const handleActionPress = (screen: string) => {
    if (screen === '__sell__') return handleSellPress();
    navigation.navigate(screen);
  };

  // ── Render Subcomponents ──────────────────────────────────────────────────

  // Top Nav (Desktop)
  const renderDesktopNavbar = () => (
    <View style={[styles.desktopNavbar, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
      <View style={styles.desktopNavInner}>
        <TouchableOpacity
          style={styles.navBrand}
          onPress={() => {
            try {
              navigation.navigate('Main', { screen: 'HomeTab' });
            } catch {
              navigation.navigate('HomeTab');
            }
          }}
        >
          <SafeLogo logoUrl={logoUrl} style={{ width: 34, height: 34 }} resizeMode="contain" />
          <Text style={styles.navBrandText}>
            <Text style={[styles.navBrandFix, { color: isDark ? '#60A5FA' : '#1B3D6E' }]}>Fix</Text>
            <Text style={[styles.navBrandMart, { color: theme.primary }]}>Mart</Text>
          </Text>
        </TouchableOpacity>

        <View style={styles.desktopNavLinks}>
          {NAV_LINKS.map((link) => (
            <TouchableOpacity key={link.screen} onPress={() => navigation.navigate(link.screen)} style={styles.navLinkBtn}>
              <Text style={[styles.navLinkText, { color: link.screen === 'HomeTab' ? theme.primary : theme.text }]}>
                {link.label}
              </Text>
              {link.screen === 'HomeTab' && <View style={[styles.navLinkActive, { backgroundColor: theme.primary }]} />}
            </TouchableOpacity>
          ))}
          {userInfo?.role === 'RIDER' && (
            <TouchableOpacity onPress={() => navigation.navigate('History', { type: 'orders', role: 'RIDER' })} style={styles.navLinkBtn}>
              <Text style={[styles.navLinkText, { color: '#10B981', fontWeight: '800' }]}>🛵 Rider Hub</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.desktopNavRight}>
          <TouchableOpacity
            style={[styles.navIconBtn, { borderColor: theme.border, position: 'relative' }]}
            onPress={() => navigation.navigate('CartTab')}
          >
            <Text style={styles.navIconBtnText}>🛒</Text>
            {cartItemCount > 0 && (
              <View style={[styles.navBadge, { backgroundColor: theme.primary }]}>
                <Text style={styles.navBadgeText}>{cartItemCount > 99 ? '99+' : cartItemCount}</Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.navIconBtn, { borderColor: theme.border, position: 'relative' }]}
            onPress={() => navigation.navigate('NotificationsTab')}
          >
            <Text style={styles.navIconBtnText}>🔔</Text>
            {unreadNotifsCount > 0 && (
              <View style={[styles.navBadge, { backgroundColor: theme.primary }]}>
                <Text style={styles.navBadgeText}>{unreadNotifsCount > 9 ? '9+' : unreadNotifsCount}</Text>
              </View>
            )}
          </TouchableOpacity>

          <ThemeToggle compact />

          <TouchableOpacity
            style={[styles.navAvatar, { borderColor: theme.primary, backgroundColor: theme.primary + '18' }]}
            onPress={() => navigation.navigate('ProfileTab')}
          >
            <Text style={[styles.navAvatarText, { color: theme.primary }]}>
              {userInfo?.name ? userInfo.name.charAt(0).toUpperCase() : '👤'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  // Top Nav (Mobile)
  const renderMobileNavbar = () => (
    <View style={[styles.mobileNavbar, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
      <TouchableOpacity
        style={styles.navBrand}
        onPress={() => {
          try {
            navigation.navigate('Main', { screen: 'HomeTab' });
          } catch {
            navigation.navigate('HomeTab');
          }
        }}
      >
        <SafeLogo logoUrl={logoUrl} style={{ width: 30, height: 30 }} resizeMode="contain" />
        <Text style={styles.navBrandText}>
          <Text style={[styles.navBrandFix, { color: isDark ? '#60A5FA' : '#1B3D6E' }]}>Fix</Text>
          <Text style={[styles.navBrandMart, { color: theme.primary }]}>Mart</Text>
        </Text>
      </TouchableOpacity>

      <View style={styles.mobileNavRight}>
        <TouchableOpacity
          style={[styles.navIconBtn, { borderColor: theme.border, position: 'relative', marginRight: 6 }]}
          onPress={() => navigation.navigate('CartTab')}
        >
          <Text style={styles.navIconBtnText}>🛒</Text>
          {cartItemCount > 0 && (
            <View style={[styles.navBadge, { backgroundColor: theme.primary }]}>
              <Text style={styles.navBadgeText}>{cartItemCount > 99 ? '99+' : cartItemCount}</Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.navIconBtn, { borderColor: theme.border, position: 'relative', marginRight: 6 }]}
          onPress={() => navigation.navigate('NotificationsTab')}
        >
          <Text style={styles.navIconBtnText}>🔔</Text>
          {unreadNotifsCount > 0 && (
            <View style={[styles.navBadge, { backgroundColor: theme.primary }]}>
              <Text style={styles.navBadgeText}>{unreadNotifsCount > 9 ? '9+' : unreadNotifsCount}</Text>
            </View>
          )}
        </TouchableOpacity>

        <ThemeToggle compact />

        <TouchableOpacity
          style={[styles.hamburger, { backgroundColor: theme.primary + '18', marginLeft: 8 }]}
          onPress={() => setMenuOpen(!menuOpen)}
        >
          <Text style={[styles.hamburgerText, { color: theme.primary }]}>{menuOpen ? '✕' : '☰'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  // Mobile Drawer Modal
  const renderMobileDrawer = () => (
    <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
      <TouchableWithoutFeedback onPress={() => setMenuOpen(false)}>
        <View style={styles.modalDrawerOverlay}>
          <TouchableWithoutFeedback onPress={() => {}}>
            <View
              style={[
                styles.mobileDrawerModal,
                {
                  backgroundColor: theme.card,
                  borderColor: theme.border,
                  marginTop: Platform.OS === 'ios' ? 52 : 46,
                  width: Math.min(width * 0.78, 280),
                },
              ]}
            >
              <View style={[styles.drawerTopBar, { borderBottomColor: theme.border }]}>
                <Text style={[styles.drawerTopTitle, { color: isDark ? '#94A3B8' : '#64748B' }]}>NAVIGATION MENU</Text>
                <TouchableOpacity
                  style={[styles.drawerCloseBtn, { backgroundColor: theme.primary + '18' }]}
                  onPress={() => setMenuOpen(false)}
                >
                  <Text style={[styles.drawerCloseText, { color: theme.primary }]}>✕</Text>
                </TouchableOpacity>
              </View>

              <ScrollView style={{ maxHeight: height * 0.75 }} showsVerticalScrollIndicator={false}>
                {[
                  { icon: '🏠', label: 'Home', screen: 'HomeTab' },
                  { icon: '🛍️', label: 'Shop Products', screen: 'Products' },
                  { icon: '⚡', label: 'Book Workman', screen: 'Services' },
                  { icon: '🛵', label: 'Send Parcel', screen: 'BookParcel' },
                  { icon: '🏷️', label: 'Sell on FixMart', screen: '__sell__' },
                  { icon: '📋', label: 'My Bookings & Orders', screen: 'History' },
                  { icon: '🛒', label: 'My Cart', screen: 'CartTab' },
                  { icon: '🔔', label: 'Alerts', screen: 'NotificationsTab' },
                  { icon: '👤', label: 'Profile', screen: 'ProfileTab' },
                  { icon: '📘', label: 'User Guide', screen: '__guide__' },
                ].map((item) => (
                  <TouchableOpacity
                    key={item.screen}
                    style={[
                      styles.drawerItem,
                      { borderBottomColor: theme.border },
                      item.screen === '__sell__' && { backgroundColor: theme.primary + '12' },
                    ]}
                    onPress={() => {
                      setMenuOpen(false);
                      if (item.screen === '__sell__') handleSellPress();
                      else if (item.screen === '__guide__') setShowUserGuide(true);
                      else navigation.navigate(item.screen);
                    }}
                  >
                    <Text style={styles.drawerItemIcon}>{item.icon}</Text>
                    <Text
                      style={[
                        styles.drawerItemLabel,
                        { color: item.screen === '__sell__' ? theme.primary : theme.text },
                        item.screen === '__sell__' && { fontWeight: '800' },
                      ]}
                    >
                      {item.label}
                    </Text>
                    {item.screen === 'CartTab' && cartItemCount > 0 && (
                      <View style={[styles.navBadge, { backgroundColor: theme.primary, position: 'relative', top: 0, right: 0, marginLeft: 6 }]}>
                        <Text style={styles.navBadgeText}>{cartItemCount}</Text>
                      </View>
                    )}
                    <Text style={[styles.drawerChevron, { color: theme.lightText || '#8E8E93' }]}>›</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );

  // Smart Context Greeting Bar
  const renderGreetingBar = () => {
    const firstName = userInfo?.name ? userInfo.name.split(' ')[0] : null;
    return (
      <View style={[styles.greetingRow, { paddingHorizontal: horizontalPadding }]}>
        <View style={{ flex: 1, minWidth: 200 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Text style={[styles.greetingTitle, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>
              {firstName ? `Hello, ${firstName} 👋` : 'Welcome to FixMart 👋'}
            </Text>
            {userInfo?.role && userInfo.role !== 'CUSTOMER' && (
              <View style={[styles.roleBadge, { backgroundColor: theme.primary + '18', borderColor: theme.primary + '40' }]}>
                <Text style={[styles.roleBadgeText, { color: theme.primary }]}>
                  {userInfo.role === 'VENDOR' ? '🏪 Vendor' : userInfo.role === 'RIDER' ? '🛵 Rider' : userInfo.role === 'HANDYMAN' ? '⚡ Artisan' : '👑 Admin'}
                </Text>
              </View>
            )}
          </View>
          <Text style={[styles.greetingSubtitle, { color: isDark ? '#94A3B8' : '#64748B' }]} numberOfLines={1}>
            Repairs, merchandise & express dispatch in one place
          </Text>
        </View>
      </View>
    );
  };

  // Smart Alert Banner
  const renderSmartAlertBanner = () => {
    if (!latestUnreadNotif || latestUnreadNotif.id === dismissedNotifId) return null;
    return (
      <View style={[styles.alertBanner, { backgroundColor: isDark ? '#1E293B' : '#FEF3C7', borderColor: '#F59E0B' }]}>
        <Text style={{ fontSize: 18, marginRight: 10 }}>🔔</Text>
        <View style={{ flex: 1, marginRight: 8 }}>
          <Text style={[styles.alertBannerTitle, { color: isDark ? '#F59E0B' : '#92400E' }]} numberOfLines={1}>
            {latestUnreadNotif.title || 'New Notification'}
          </Text>
          <Text style={[styles.alertBannerBody, { color: isDark ? '#E2E8F0' : '#78350F' }]} numberOfLines={1}>
            {latestUnreadNotif.body}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => navigation.navigate('NotificationsTab')}
          style={[styles.alertBannerBtn, { backgroundColor: '#F59E0B' }]}
        >
          <Text style={styles.alertBannerBtnText}>View</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setDismissedNotifId(latestUnreadNotif.id)}
          style={{ padding: 6, marginLeft: 4 }}
        >
          <Text style={{ color: isDark ? '#94A3B8' : '#78350F', fontWeight: '800', fontSize: 14 }}>✕</Text>
        </TouchableOpacity>
      </View>
    );
  };

  // Search Bar with Dropdown
  const renderSearchBar = () => (
    <View style={[styles.searchContainer, { paddingHorizontal: horizontalPadding }]}>
      <View
        style={[
          styles.searchBox,
          {
            backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
            borderColor: searchFocused ? theme.primary : isDark ? '#334155' : '#E2E8F0',
          },
        ]}
      >
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={[styles.searchInput, { color: isDark ? '#F1F5F9' : '#0F172A' }]}
          placeholder="Search products, services, plumbing, repairs..."
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
          <TouchableOpacity onPress={() => { setSearchQuery(''); setSearchResults(null); }} style={{ padding: 6 }}>
            <Text style={{ color: isDark ? '#64748B' : '#94A3B8', fontWeight: '700' }}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Quick Filter Chips (Responsive Wrapping) */}
      <View style={styles.filterChipsRow}>
        {[
          { label: '⚡ Handymen', action: () => navigation.navigate('Services') },
          { label: '🛍️ Products', action: () => navigation.navigate('Products') },
          { label: '🛵 Send Parcel', action: () => navigation.navigate('BookParcel') },
          { label: '🏷️ Sell on FixMart', action: () => handleSellPress() },
          { label: '📋 My Bookings', action: () => navigation.navigate('History') },
        ].map((chip) => (
          <TouchableOpacity
            key={chip.label}
            style={[
              styles.filterChip,
              {
                backgroundColor: isDark ? '#1E293B' : '#F1F5F9',
                borderColor: isDark ? '#334155' : '#E2E8F0',
              },
            ]}
            onPress={chip.action}
            activeOpacity={0.75}
          >
            <Text style={[styles.filterChipText, { color: isDark ? '#E2E8F0' : '#334155' }]}>{chip.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Live Dropdown Results */}
      {searchQuery.length > 0 && (
        <View style={[styles.searchDropdown, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderColor: isDark ? '#334155' : '#E2E8F0' }]}>
          {searchLoading ? (
            <ActivityIndicator color={theme.primary} style={{ marginVertical: 18 }} />
          ) : searchResults && (searchResults.products.length > 0 || searchResults.services.length > 0) ? (
            <View>
              {searchResults.services.length > 0 && (
                <View>
                  <Text style={[styles.dropdownHeader, { color: isDark ? '#94A3B8' : '#64748B' }]}>⚡ SERVICES</Text>
                  {searchResults.services.map((item) => (
                    <TouchableOpacity
                      key={item.id}
                      style={[styles.dropdownItem, { borderBottomColor: isDark ? '#334155' : '#F1F5F9' }]}
                      onPress={() => {
                        setSearchQuery('');
                        setSearchResults(null);
                        navigation.navigate('Services');
                      }}
                    >
                      <Text style={{ fontSize: 18, marginRight: 10 }}>⚡</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.dropdownItemTitle, { color: isDark ? '#F1F5F9' : '#0F172A' }]} numberOfLines={1}>{item.name}</Text>
                        <Text style={[styles.dropdownItemSubtitle, { color: isDark ? '#64748B' : '#94A3B8' }]}>{item.category || 'Service'}</Text>
                      </View>
                      <Text style={{ color: theme.primary, fontWeight: '700' }}>Book →</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {searchResults.products.length > 0 && (
                <View>
                  <Text style={[styles.dropdownHeader, { color: isDark ? '#94A3B8' : '#64748B' }]}>📦 PRODUCTS</Text>
                  {searchResults.products.map((item) => (
                    <TouchableOpacity
                      key={item.id}
                      style={[styles.dropdownItem, { borderBottomColor: isDark ? '#334155' : '#F1F5F9' }]}
                      onPress={() => {
                        setSearchQuery('');
                        setSearchResults(null);
                        navigation.navigate('ProductDetail', { productId: item.id });
                      }}
                    >
                      <Text style={{ fontSize: 18, marginRight: 10 }}>📦</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.dropdownItemTitle, { color: isDark ? '#F1F5F9' : '#0F172A' }]} numberOfLines={1}>{item.name}</Text>
                        <Text style={[styles.dropdownItemSubtitle, { color: isDark ? '#64748B' : '#94A3B8' }]}>{fmt(item.price)}</Text>
                      </View>
                      <Text style={{ color: '#F59E0B', fontWeight: '700' }}>View →</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          ) : (
            <Text style={[styles.searchEmptyText, { color: isDark ? '#64748B' : '#94A3B8' }]}>No matching items found for "{searchQuery}"</Text>
          )}
        </View>
      )}
    </View>
  );

  // Promo Slider Carousel
  const renderPromoSlider = () => (
    <View style={[styles.sliderContainer, { paddingHorizontal: horizontalPadding }]}>
      <ScrollView
        ref={slideScrollViewRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleSliderScroll}
        scrollEventThrottle={16}
        style={{ width: slideWidth }}
      >
        {slides.map((slide) => {
          if (slide.imageUrl) {
            const uri = getImageUri(slide.imageUrl) || slide.imageUrl;
            return (
              <View key={slide.id} style={[styles.slideCard, { width: slideWidth, height: slideHeight }]}>
                <Image source={{ uri }} style={styles.slideImage} resizeMode="cover" />
                <LinearGradient colors={['transparent', 'rgba(0,0,0,0.7)']} style={StyleSheet.absoluteFill} />
                {slide.caption && (
                  <View style={styles.slideCaptionContainer}>
                    <Text style={styles.slideCaptionText}>{slide.caption}</Text>
                  </View>
                )}
              </View>
            );
          }

          const colors = slide.gradient || ['#0F2027', '#203A43'];
          return (
            <TouchableOpacity
              key={slide.id}
              activeOpacity={0.9}
              style={[styles.slideCard, { width: slideWidth, height: slideHeight }]}
              onPress={() => {
                if (!slide.action) return;
                navigation.navigate(slide.action);
              }}
            >
              <LinearGradient colors={colors as any} style={styles.promoSlideGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                <View style={styles.promoSlideInner}>
                  <View style={[styles.promoIconWrap, { backgroundColor: (slide.accent || '#FFF') + '22' }]}>
                    <Text style={styles.promoIconText}>{slide.icon || '🛍️'}</Text>
                  </View>
                  <View style={{ flex: 1, marginLeft: 14 }}>
                    <Text style={styles.promoTitle} numberOfLines={1}>{slide.title}</Text>
                    <Text style={styles.promoSubtitle} numberOfLines={2}>{slide.subtitle}</Text>
                  </View>
                  <View style={[styles.promoCtaBtn, { backgroundColor: slide.accent || '#FFF' }]}>
                    <Text style={styles.promoCtaText}>{slide.cta || 'Explore'}</Text>
                    <Text style={styles.promoCtaArrow}>→</Text>
                  </View>
                </View>
              </LinearGradient>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {slides.length > 1 && (
        <View style={styles.dotRow}>
          {slides.map((_, i) => (
            <TouchableOpacity
              key={i}
              onPress={() => {
                setActiveSlideIndex(i);
                slideScrollViewRef.current?.scrollTo({ x: i * slideWidth, animated: true });
              }}
            >
              <View
                style={[
                  styles.dot,
                  { backgroundColor: i === activeSlideIndex ? theme.primary : isDark ? '#334155' : '#CBD5E1' },
                  i === activeSlideIndex && { width: 18 },
                ]}
              />
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );

  // Core Services Action Hub (Wraps Gracefully on All Devices)
  const renderCoreServicesHub = () => {
    // Dynamic tile dimensions:
    // On mobile: 2 columns, width = (usableWidth - gap) / 2
    // On tablet / desktop: 4 columns in 1 row, width = (usableWidth - gap * 3) / 4
    const numCols = isMobile ? 2 : 4;
    const gap = 12;
    const tileWidth = (usableWidth - gap * (numCols - 1)) / numCols;

    return (
      <View style={[styles.sectionContainer, { paddingHorizontal: horizontalPadding }]}>
        <View style={styles.quickGrid}>
          {QUICK_ACTIONS.map((action) => (
            <TouchableOpacity
              key={action.id}
              style={[
                styles.quickCard,
                {
                  width: tileWidth,
                  backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
                  borderColor: isDark ? '#334155' : '#E2E8F0',
                },
              ]}
              onPress={() => handleActionPress(action.screen)}
              activeOpacity={0.8}
            >
              <View style={[styles.quickCardIconCircle, { backgroundColor: isDark ? action.bgDark : action.bgLight }]}>
                <Text style={styles.quickCardIcon}>{action.icon}</Text>
              </View>
              <View style={{ flex: 1, justifyContent: 'center' }}>
                <Text style={[styles.quickCardTitle, { color: isDark ? '#F1F5F9' : '#0F172A' }]} numberOfLines={1}>
                  {action.title}
                </Text>
                <Text style={[styles.quickCardSubtitle, { color: isDark ? '#94A3B8' : '#64748B' }]} numberOfLines={1}>
                  {action.subtitle}
                </Text>
              </View>
              <View style={[styles.quickCardArrowWrap, { backgroundColor: action.color + '15' }]}>
                <Text style={[styles.quickCardArrow, { color: action.color }]}>→</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  };

  // Promoted / Featured Products (Smart Grid / Scroll)
  const renderFeaturedProducts = () => {
    const cardWidth = isMobile ? Math.min(170, (usableWidth - 12) / 2) : 210;
    const imgHeight = isMobile ? 110 : 130;

    return (
      <View style={[styles.sectionContainer, { paddingHorizontal: horizontalPadding }]}>
        <View style={styles.sectionHeader}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <Text style={[styles.sectionTitle, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>🛍️ Featured Products</Text>
              {promotedProducts.some((p) => p.featured) && (
                <View style={[styles.badgePill, { backgroundColor: '#FEF3C7', borderColor: '#F59E0B' }]}>
                  <Text style={[styles.badgePillText, { color: '#B45309' }]}>⚡ TOP DEALS</Text>
                </View>
              )}
            </View>
            <Text style={[styles.sectionSubtitle, { color: isDark ? '#94A3B8' : '#64748B' }]}>
              Verified tools, equipment & genuine hardware
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.seeAllBtn, { backgroundColor: isDark ? '#334155' : '#F1F5F9' }]}
            onPress={() => navigation.navigate('Products')}
          >
            <Text style={[styles.seeAllText, { color: theme.primary }]}>See All →</Text>
          </TouchableOpacity>
        </View>

        {addedCartFeedback && (
          <View style={[styles.toastBanner, { backgroundColor: theme.primary + '18', borderColor: theme.primary }]}>
            <Text style={[styles.toastBannerText, { color: theme.primary }]}>{addedCartFeedback}</Text>
          </View>
        )}

        {loading ? (
          <ActivityIndicator color={theme.primary} style={{ marginVertical: 24 }} />
        ) : promotedProducts.length === 0 ? (
          <View style={[styles.emptyBox, { borderColor: isDark ? '#334155' : '#E2E8F0', backgroundColor: isDark ? '#1E293B' : '#F8FAFC' }]}>
            <Text style={{ fontSize: 28, marginBottom: 6 }}>🛍️</Text>
            <Text style={{ color: isDark ? '#94A3B8' : '#64748B', fontWeight: '600' }}>No products listed yet</Text>
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 6 }}>
            {promotedProducts.map((product) => {
              const isFeatured = !!product.featured;
              const rawImgUrl = product.images?.[0]?.url || product.imageUrl;
              const imgUri = rawImgUrl ? getImageUri(rawImgUrl) || rawImgUrl : null;

              return (
                <TouchableOpacity
                  key={product.id}
                  style={[
                    styles.productCard,
                    {
                      width: cardWidth,
                      backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
                      borderColor: isFeatured ? '#F59E0B' : isDark ? '#334155' : '#E2E8F0',
                      borderWidth: isFeatured ? 2 : 1,
                    },
                  ]}
                  onPress={() => navigation.navigate('ProductDetail', { productId: product.id })}
                  activeOpacity={0.85}
                >
                  <View style={[styles.productImgContainer, { height: imgHeight, backgroundColor: isDark ? '#0F172A' : '#F1F5F9' }]}>
                    {imgUri ? (
                      <Image source={{ uri: imgUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                    ) : (
                      <Text style={{ fontSize: 32 }}>📦</Text>
                    )}
                    {isFeatured && (
                      <View style={styles.boostedTag}>
                        <Text style={styles.boostedTagText}>🚀 BOOSTED</Text>
                      </View>
                    )}
                    {product.category && (
                      <View style={styles.categoryPill}>
                        <Text style={styles.categoryPillText} numberOfLines={1}>{product.category}</Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.productCardBody}>
                    <Text style={[styles.productName, { color: isDark ? '#F1F5F9' : '#0F172A' }]} numberOfLines={2}>
                      {product.name}
                    </Text>

                    <Text style={[styles.productPrice, { color: theme.primary }]}>
                      {fmt(product.price || 0)}
                    </Text>

                    <View style={styles.productFooter}>
                      <Text style={[styles.stockStatus, { color: (product.stock ?? 0) > 0 ? '#10B981' : '#EF4444' }]}>
                        {(product.stock ?? 0) > 0 ? '✓ In Stock' : 'Out of Stock'}
                      </Text>

                      <TouchableOpacity
                        style={[
                          styles.addCartBtn,
                          { backgroundColor: theme.primary },
                          (product.stock ?? 0) <= 0 && { opacity: 0.5 },
                        ]}
                        onPress={(e) => {
                          e.stopPropagation();
                          addToCart({
                            id: product.id,
                            name: product.name,
                            price: product.price,
                            type: 'product',
                            imageUrl: rawImgUrl,
                            size: product.size || 'M',
                            stock: product.stock,
                          });
                          setAddedCartFeedback(`Added "${product.name}" to cart!`);
                          setTimeout(() => setAddedCartFeedback(null), 2500);
                        }}
                        disabled={(product.stock ?? 0) <= 0}
                      >
                        <Text style={styles.addCartBtnText}>+ 🛒</Text>
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
  };

  // Popular Handyman Services (Core FixMart Super App Feature)
  const renderHandymanServices = () => {
    // 2 columns on mobile, 3 on tablet, 3-4 on desktop
    const numCols = isMobile ? 2 : isTablet ? 3 : 3;
    const gap = 12;
    const cardWidth = (usableWidth - gap * (numCols - 1)) / numCols;

    return (
      <View style={[styles.sectionContainer, { paddingHorizontal: horizontalPadding }]}>
        <View style={styles.sectionHeader}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <Text style={[styles.sectionTitle, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>⚡ Handyman & Repair Services</Text>
              <View style={[styles.badgePill, { backgroundColor: '#EFF6FF', borderColor: '#3B82F6' }]}>
                <Text style={[styles.badgePillText, { color: '#2563EB' }]}>VERIFIED ARTISANS</Text>
              </View>
            </View>
            <Text style={[styles.sectionSubtitle, { color: isDark ? '#94A3B8' : '#64748B' }]}>
              Fast, trusted technicians booked right to your doorstep
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.seeAllBtn, { backgroundColor: isDark ? '#334155' : '#F1F5F9' }]}
            onPress={() => navigation.navigate('Services')}
          >
            <Text style={[styles.seeAllText, { color: theme.primary }]}>See All →</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator color={theme.primary} style={{ marginVertical: 24 }} />
        ) : featuredServices.length === 0 ? (
          <View style={[styles.emptyBox, { borderColor: isDark ? '#334155' : '#E2E8F0', backgroundColor: isDark ? '#1E293B' : '#F8FAFC' }]}>
            <Text style={{ fontSize: 28, marginBottom: 6 }}>⚡</Text>
            <Text style={{ color: isDark ? '#94A3B8' : '#64748B', fontWeight: '600' }}>Services catalog loading...</Text>
          </View>
        ) : (
          <View style={styles.servicesGrid}>
            {featuredServices.map((service) => {
              const meta = SERVICE_CATEGORY_META[service.category] || SERVICE_CATEGORY_META['default'];
              const priceVal = service.basePrice || service.price || 5000;

              return (
                <TouchableOpacity
                  key={service.id}
                  style={[
                    styles.serviceCard,
                    {
                      width: cardWidth,
                      backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
                      borderColor: isDark ? '#334155' : '#E2E8F0',
                    },
                  ]}
                  onPress={() => navigation.navigate('Services')}
                  activeOpacity={0.8}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <View style={[styles.serviceIconWrap, { backgroundColor: meta.bg }]}>
                      <Text style={{ fontSize: 20 }}>{meta.icon}</Text>
                    </View>
                    <Text style={[styles.servicePriceTag, { color: theme.primary }]}>
                      From {fmt(priceVal)}
                    </Text>
                  </View>

                  <Text style={[styles.serviceTitle, { color: isDark ? '#F1F5F9' : '#0F172A' }]} numberOfLines={1}>
                    {service.name}
                  </Text>
                  <Text style={[styles.serviceDesc, { color: isDark ? '#94A3B8' : '#64748B' }]} numberOfLines={2}>
                    {service.description || 'Professional and verified service provider.'}
                  </Text>

                  <View style={[styles.serviceBookBtn, { borderColor: meta.color + '40' }]}>
                    <Text style={[styles.serviceBookText, { color: meta.color }]}>Book Workman →</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>
    );
  };

  // Role Shortcuts (Rider & Admin / Artisan)
  const renderRoleShortcuts = () => {
    if (!userInfo) return null;

    if (userInfo.role === 'RIDER') {
      return (
        <View style={[styles.roleCard, { marginHorizontal: horizontalPadding, backgroundColor: '#0F172A' }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#38BDF8', fontSize: 12, fontWeight: '800', letterSpacing: 0.5 }}>RIDER HUB</Text>
            <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '800', marginTop: 2 }}>Manage Deliveries & Track Earnings</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity
              style={[styles.roleBtn, { backgroundColor: '#10B981' }]}
              onPress={() => navigation.navigate('History', { type: 'orders', role: 'RIDER' })}
            >
              <Text style={styles.roleBtnText}>📋 Orders</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.roleBtn, { backgroundColor: '#3B82F6' }]}
              onPress={() => navigation.navigate('RiderEarnings')}
            >
              <Text style={styles.roleBtnText}>💰 Payout</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    if (userInfo.role === 'ADMIN' || userInfo.role === 'HANDYMAN') {
      return (
        <TouchableOpacity
          style={[
            styles.adminCard,
            {
              marginHorizontal: horizontalPadding,
              backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
              borderColor: isDark ? '#334155' : '#E2E8F0',
            },
          ]}
          onPress={() => navigation.navigate('History', { type: 'bookings', role: userInfo?.role })}
          activeOpacity={0.85}
        >
          <View style={{ flex: 1 }}>
            <Text style={[styles.adminCardTitle, { color: theme.primary }]}>📋 Manage Assigned Bookings</Text>
            <Text style={[styles.adminCardSubtitle, { color: isDark ? '#94A3B8' : '#64748B' }]}>
              {userInfo.role === 'ADMIN' ? 'Review platform-wide jobs and schedules' : 'Check assigned jobs, customer locations & statuses'}
            </Text>
          </View>
          <Text style={{ fontSize: 18, color: theme.primary, fontWeight: '800' }}>→</Text>
        </TouchableOpacity>
      );
    }

    return null;
  };

  // Proof Bar (Simple, elegant, wrapping)
  const renderTrustPill = () => (
    <View style={[styles.trustPillRow, { marginHorizontal: horizontalPadding, borderColor: isDark ? '#334155' : '#E2E8F0' }]}>
      {[
        { icon: '✓', text: '100% Verified Artisans' },
        { icon: '⚡', text: 'Fast Express Delivery' },
        { icon: '🔒', text: 'Secure Escrow Payments' },
      ].map((item, i) => (
        <View key={i} style={styles.trustItem}>
          <Text style={[styles.trustItemIcon, { color: theme.primary }]}>{item.icon}</Text>
          <Text style={[styles.trustItemText, { color: isDark ? '#94A3B8' : '#64748B' }]}>{item.text}</Text>
        </View>
      ))}
    </View>
  );

  // Minimal Footer
  const renderFooter = () => (
    <View style={[styles.footer, { borderTopColor: isDark ? '#334155' : '#E2E8F0', marginHorizontal: horizontalPadding }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <SafeLogo logoUrl={logoUrl} style={{ width: 26, height: 26 }} resizeMode="contain" />
        <Text style={styles.footerBrand}>
          <Text style={{ color: isDark ? '#60A5FA' : '#1B3D6E', fontWeight: '900' }}>Fix</Text>
          <Text style={{ color: theme.primary, fontWeight: '900' }}>Mart</Text>
        </Text>
      </View>
      <Text style={[styles.footerCopyright, { color: isDark ? '#64748B' : '#94A3B8' }]}>
        {footerText || '© 2026 FixMart Super App. All rights reserved.'}
      </Text>
    </View>
  );

  // Vendor Onboarding / Upgrade Modal
  const renderVendorModal = () => (
    <Modal visible={showVendorModal} transparent animationType="fade" onRequestClose={() => setShowVendorModal(false)}>
      <View style={styles.vendorModalOverlay}>
        <View style={[styles.vendorModalCard, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderColor: isDark ? '#334155' : '#E2E8F0' }]}>
          <View style={[styles.vendorModalIconCircle, { backgroundColor: theme.primary + '18' }]}>
            <Text style={{ fontSize: 30 }}>{vendorModalType === 'KYC' ? '⏳' : '🏪'}</Text>
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
              ? 'List and sell your tools, equipment, materials & hardware to buyers across Nigeria.'
              : vendorModalType === 'UPGRADE'
              ? 'Activate your seller privileges to list products, manage orders and receive payments directly in your wallet.'
              : 'Your vendor account requires identity verification before your product listings go live.'}
          </Text>

          <View style={{ width: '100%', gap: 10 }}>
            {vendorModalType === 'REGISTER' && (
              <>
                <TouchableOpacity
                  style={[styles.vendorPrimaryBtn, { backgroundColor: theme.primary }]}
                  onPress={() => {
                    setShowVendorModal(false);
                    navigation.navigate('Signup', { role: 'VENDOR', initialRole: 'VENDOR' });
                  }}
                >
                  <Text style={styles.vendorPrimaryBtnText}>🚀 Register as Vendor</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.vendorSecondaryBtn, { borderColor: isDark ? '#334155' : '#E2E8F0' }]}
                  onPress={() => {
                    setShowVendorModal(false);
                    navigation.navigate('Login');
                  }}
                >
                  <Text style={[styles.vendorSecondaryBtnText, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>
                    🔐 Log In to Existing Account
                  </Text>
                </TouchableOpacity>
              </>
            )}

            {vendorModalType === 'UPGRADE' && (
              <TouchableOpacity
                style={[styles.vendorPrimaryBtn, { backgroundColor: theme.primary }]}
                onPress={() => {
                  setShowVendorModal(false);
                  navigation.navigate('KYCVerification', { role: 'VENDOR' });
                }}
              >
                <Text style={styles.vendorPrimaryBtnText}>⚡ Complete Seller Setup</Text>
              </TouchableOpacity>
            )}

            {vendorModalType === 'KYC' && (
              <TouchableOpacity
                style={[styles.vendorPrimaryBtn, { backgroundColor: theme.primary }]}
                onPress={() => {
                  setShowVendorModal(false);
                  navigation.navigate('KYCStatus');
                }}
              >
                <Text style={styles.vendorPrimaryBtnText}>📊 Check KYC Status</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={{ paddingVertical: 10, alignItems: 'center' }} onPress={() => setShowVendorModal(false)}>
              <Text style={{ color: isDark ? '#94A3B8' : '#64748B', fontWeight: '600' }}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  // ── Main Screen View ──────────────────────────────────────────────────────
  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      {renderVendorModal()}

      {/* Sticky Header */}
      {Platform.OS === 'web' ? (
        <View style={styles.stickyNav}>
          {isDesktop || isTablet ? renderDesktopNavbar() : renderMobileNavbar()}
        </View>
      ) : (
        renderMobileNavbar()
      )}

      {/* Scrollable Content */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <ResponsiveContainer maxWidth={1200}>
          <Animated.View style={{ opacity: heroFadeAnim }}>
            {/* Smart Greeting Bar */}
            {renderGreetingBar()}

            {/* Smart Notification Banner */}
            {renderSmartAlertBanner()}

            {/* Search Bar & Filter Chips */}
            {renderSearchBar()}

            {/* Promo Carousel */}
            {renderPromoSlider()}

            {/* 4 Core Super-App Pillars (Wrap on All Devices) */}
            {renderCoreServicesHub()}

            {/* Role Shortcuts (Rider / Handyman / Admin) */}
            {renderRoleShortcuts()}

            {/* Boosted Products */}
            {renderFeaturedProducts()}

            {/* Popular Handyman Services */}
            {renderHandymanServices()}

            {/* Quality & Trust Proof Pill */}
            {renderTrustPill()}

            {/* Footer */}
            {renderFooter()}
          </Animated.View>
        </ResponsiveContainer>
      </ScrollView>

      {/* Mobile Drawer */}
      {renderMobileDrawer()}

      {/* User Guide */}
      <UserGuideModal
        visible={showUserGuide}
        onClose={() => setShowUserGuide(false)}
        theme={theme}
        colorMode={colorMode}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1 },
  stickyNav: { zIndex: 1000, ...Platform.select({ web: { position: 'sticky' as any, top: 0 } }) },
  scrollContent: { paddingBottom: 40 },

  // Top Nav (Desktop)
  desktopNavbar: {
    borderBottomWidth: 1,
    paddingHorizontal: 24,
    height: 60,
    justifyContent: 'center',
  },
  desktopNavInner: {
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: 1200,
    width: '100%',
    alignSelf: 'center',
  },
  navBrand: { flexDirection: 'row', alignItems: 'center' },
  navBrandText: { fontSize: 20, fontWeight: '900', marginLeft: 8, letterSpacing: -0.5 },
  navBrandFix: { color: '#1B3D6E' },
  navBrandMart: { color: '#22A45D' },
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
  desktopNavRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  navIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navIconBtnText: { fontSize: 16 },
  navBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
  },
  navBadgeText: { color: '#FFF', fontSize: 9, fontWeight: '800' },
  navAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navAvatarText: { fontSize: 14, fontWeight: '800' },

  // Top Nav (Mobile)
  mobileNavbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    zIndex: 100,
  },
  mobileNavRight: { flexDirection: 'row', alignItems: 'center' },
  hamburger: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hamburgerText: { fontSize: 18, fontWeight: '700' },

  // Drawer Modal
  modalDrawerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
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
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  drawerTopTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6 },
  drawerCloseBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  drawerCloseText: { fontSize: 12, fontWeight: '800' },
  drawerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: 1,
  },
  drawerItemIcon: { fontSize: 16, marginRight: 10, width: 22, textAlign: 'center' },
  drawerItemLabel: { flex: 1, fontSize: 14, fontWeight: '600' },
  drawerChevron: { fontSize: 16 },

  // Greeting Row
  greetingRow: {
    paddingTop: 16,
    paddingBottom: 8,
  },
  greetingTitle: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  greetingSubtitle: {
    fontSize: 13,
    marginTop: 2,
    fontWeight: '500',
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  roleBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
  },

  // Alert Banner
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  alertBannerTitle: { fontSize: 13, fontWeight: '800' },
  alertBannerBody: { fontSize: 12, marginTop: 1 },
  alertBannerBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  alertBannerBtnText: { color: '#FFF', fontSize: 11, fontWeight: '700' },

  // Search Section
  searchContainer: {
    marginTop: 10,
    marginBottom: 14,
    zIndex: 50,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 10 : 4,
  },
  searchIcon: { fontSize: 16, marginRight: 8 },
  searchInput: { flex: 1, fontSize: 14, fontWeight: '500', paddingVertical: 8 },
  filterChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterChipText: { fontSize: 12, fontWeight: '600' },
  searchDropdown: {
    marginTop: 6,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  dropdownHeader: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 4,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  dropdownItemTitle: { fontSize: 14, fontWeight: '600' },
  dropdownItemSubtitle: { fontSize: 12 },
  searchEmptyText: { textAlign: 'center', fontSize: 13, paddingVertical: 16 },

  // Slider
  sliderContainer: {
    marginBottom: 16,
  },
  slideCard: {
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
  },
  slideImage: { width: '100%', height: '100%' },
  slideCaptionContainer: { position: 'absolute', bottom: 16, left: 16, right: 16 },
  slideCaptionText: { color: '#FFF', fontSize: 16, fontWeight: '800' },
  promoSlideGradient: { flex: 1, justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 16 },
  promoSlideInner: { flexDirection: 'row', alignItems: 'center' },
  promoIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  promoIconText: { fontSize: 24 },
  promoTitle: { fontSize: 18, fontWeight: '900', color: '#FFFFFF', marginBottom: 2 },
  promoSubtitle: { fontSize: 12.5, color: 'rgba(255,255,255,0.88)', lineHeight: 17 },
  promoCtaBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    marginLeft: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  promoCtaText: { fontSize: 12, fontWeight: '800', color: '#0F2027' },
  promoCtaArrow: { fontSize: 14, fontWeight: '900', color: '#0F2027' },
  dotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 8,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },

  // Core Services Quick Grid (Wrapping)
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  quickCard: {
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  quickCardIconCircle: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickCardIcon: { fontSize: 20 },
  quickCardTitle: { fontSize: 13.5, fontWeight: '800' },
  quickCardSubtitle: { fontSize: 11, marginTop: 1 },
  quickCardArrowWrap: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickCardArrow: { fontSize: 13, fontWeight: '900' },

  // Section Blocks
  sectionContainer: {
    marginTop: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 18, fontWeight: '900', letterSpacing: -0.3 },
  sectionSubtitle: { fontSize: 12, marginTop: 2, fontWeight: '500' },
  badgePill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  badgePillText: { fontSize: 9, fontWeight: '800' },
  seeAllBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
  },
  seeAllText: { fontSize: 12, fontWeight: '700' },
  emptyBox: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 14,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toastBanner: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 7,
    paddingHorizontal: 12,
    marginBottom: 10,
    alignItems: 'center',
  },
  toastBannerText: { fontSize: 12, fontWeight: '700' },

  // Product Cards
  productCard: {
    borderRadius: 14,
    marginRight: 12,
    overflow: 'hidden',
  },
  productImgContainer: {
    position: 'relative',
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  boostedTag: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: '#F59E0B',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    zIndex: 2,
  },
  boostedTagText: { color: '#FFF', fontSize: 8.5, fontWeight: '900' },
  categoryPill: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  categoryPillText: { color: '#FFF', fontSize: 9, fontWeight: '600' },
  productCardBody: { padding: 10 },
  productName: { fontSize: 13, fontWeight: '700', lineHeight: 17, minHeight: 34 },
  productPrice: { fontSize: 15, fontWeight: '900', marginTop: 4, marginBottom: 6 },
  productFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(150,150,150,0.15)',
  },
  stockStatus: { fontSize: 10, fontWeight: '700' },
  addCartBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  addCartBtnText: { color: '#FFF', fontSize: 10, fontWeight: '800' },

  // Services Grid
  servicesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  serviceCard: {
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 2,
  },
  serviceIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  servicePriceTag: { fontSize: 12, fontWeight: '800' },
  serviceTitle: { fontSize: 13.5, fontWeight: '800', marginBottom: 2 },
  serviceDesc: { fontSize: 11.5, lineHeight: 15, marginBottom: 10 },
  serviceBookBtn: {
    borderTopWidth: 1,
    paddingTop: 8,
    alignItems: 'center',
  },
  serviceBookText: { fontSize: 12, fontWeight: '800' },

  // Role Card
  roleCard: {
    marginTop: 18,
    padding: 16,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  roleBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  roleBtnText: { color: '#FFF', fontSize: 12, fontWeight: '800' },
  adminCard: {
    marginTop: 18,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  adminCardTitle: { fontSize: 14, fontWeight: '800' },
  adminCardSubtitle: { fontSize: 12, marginTop: 2 },

  // Trust Pill
  trustPillRow: {
    marginTop: 24,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-around',
    gap: 10,
  },
  trustItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  trustItemIcon: { fontSize: 14, fontWeight: '900' },
  trustItemText: { fontSize: 11.5, fontWeight: '600' },

  // Footer
  footer: {
    marginTop: 28,
    paddingTop: 16,
    borderTopWidth: 1,
    alignItems: 'center',
    gap: 8,
  },
  footerBrand: { fontSize: 16, fontWeight: '900' },
  footerCopyright: { fontSize: 11.5, textAlign: 'center' },

  // Vendor Modal
  vendorModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    zIndex: 9999,
  },
  vendorModalCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
  },
  vendorModalIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  vendorModalTitle: { fontSize: 19, fontWeight: '900', textAlign: 'center', marginBottom: 6 },
  vendorModalSubtitle: { fontSize: 13, lineHeight: 19, textAlign: 'center', marginBottom: 20 },
  vendorPrimaryBtn: {
    width: '100%',
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vendorPrimaryBtnText: { color: '#FFF', fontSize: 14, fontWeight: '800' },
  vendorSecondaryBtn: {
    width: '100%',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vendorSecondaryBtnText: { fontSize: 13, fontWeight: '700' },
});
