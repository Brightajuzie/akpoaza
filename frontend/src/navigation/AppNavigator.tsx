import React, { useEffect, useState, useContext } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Text, Image, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
import { useNavigation } from '@react-navigation/native';

// ── Branded Home Header ────────────────────────────────────────────────────────
function FixMartHeader() {
  const navigation = useNavigation<any>();
  const { logoUrl, theme } = useContext(SettingsContext);

  const handleGoHome = () => {
    try {
      navigation.navigate('Main', { screen: 'HomeTab' });
    } catch {
      navigation.navigate('HomeTab');
    }
  };

  return (
    <TouchableOpacity
      style={headerStyles.container}
      onPress={handleGoHome}
      activeOpacity={0.8}
    >
      <Image
        source={logoUrl ? { uri: logoUrl } : require('../../assets/logo_transparent.png')}
        style={headerStyles.logo}
        resizeMode="contain"
      />
      <View style={headerStyles.textBlock}>
        <Text style={headerStyles.title}>
          <Text style={headerStyles.fix}>Fix</Text>
          <Text style={[headerStyles.mart, { color: theme?.primary || '#22A45D' }]}>Mart</Text>
        </Text>
        <Text style={headerStyles.tagline} numberOfLines={1} ellipsizeMode="tail">
          The smart way to shop, send items & fix everyday household problems
        </Text>
      </View>
    </TouchableOpacity>
  );
}



const headerStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexShrink: 1,
  },
  logo: {
    width: 38,
    height: 38,
  },
  textBlock: {
    flexDirection: 'column',
    justifyContent: 'center',
    flexShrink: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 22,
  },
  fix: {
    color: '#1B3D6E',
  },
  mart: {
    color: '#22A45D',
  },
  tagline: {
    fontSize: 9.5,
    color: '#8E8E93',
    fontWeight: '500',
    letterSpacing: 0.1,
  },
});

import HomeScreen from '../screens/HomeScreen';
import ProductsScreen from '../screens/ProductsScreen';
import ServicesScreen from '../screens/ServicesScreen';
import LoginScreen from '../screens/LoginScreen';
import SignupScreen from '../screens/SignupScreen';
import CartScreen from '../screens/CartScreen';
import ProfileScreen from '../screens/ProfileScreen';
import HistoryScreen from '../screens/HistoryScreen';
import CheckoutScreen from '../screens/CheckoutScreen';
import AdminScreen from '../screens/AdminScreen';
import ProductDetailScreen from '../screens/ProductDetailScreen';
import BookingSetupScreen from '../screens/BookingSetupScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import KYCVerificationScreen from '../screens/KYCVerificationScreen';
import KYCStatusScreen from '../screens/KYCStatusScreen';
import LiveTrackingScreen from '../screens/LiveTrackingScreen';
import VideoCallScreen from '../screens/VideoCallScreen';
import WalletScreen from '../screens/WalletScreen';
import BookParcelScreen from '../screens/BookParcelScreen';
import OnboardingScreen from '../screens/OnboardingScreen';
import RiderEarningsScreen from '../screens/RiderEarningsScreen';
import { AuthContext } from '../context/AuthContext';
import { SettingsContext } from '../context/SettingsContext';
import apiClient from '../api/client';
import CartBadge from '../components/CartBadge';
import * as SecureStore from '../utils/storage';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function MainTabs() {
  const { theme } = useContext(SettingsContext);
  const { userToken } = useContext(AuthContext);
  const [unreadCount, setUnreadCount] = useState(0);
  const { width } = useWindowDimensions();
  const isLargeScreen = width >= 768;

  useEffect(() => {
    const fetchUnread = async () => {
      if (!userToken) return;
      try {
        const response = await apiClient.get('/notifications');
        const count = response.data.unreadCount ?? 0;
        setUnreadCount(count);
      } catch (e) {
        // silently fail
      }
    };
    // Delay initial fetch by 3s to avoid competing with screen mount requests
    const initDelay = setTimeout(fetchUnread, 3000);
    const interval = setInterval(fetchUnread, 30000);
    return () => { clearTimeout(initDelay); clearInterval(interval); };
  }, [userToken]);

  return (
    <Tab.Navigator 
      screenOptions={{ 
        headerTitleAlign: 'center', 
        tabBarActiveTintColor: theme.primary,
        headerShown: !isLargeScreen,
        tabBarStyle: { 
          borderTopColor: '#E5E5EA',
          maxWidth: 600,
          alignSelf: 'center',
          width: '100%',
          display: isLargeScreen ? 'none' : 'flex',
        },
      }}
    >
      <Tab.Screen 
        name="HomeTab" 
        component={HomeScreen} 
        options={{ 
          tabBarLabel: 'Home',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 18 }}>🏠</Text>,
          headerTitle: () => <FixMartHeader />,
          headerTitleAlign: 'left',
          headerStyle: { backgroundColor: '#FFFFFF' },
          headerShadowVisible: true,
        }} 
      />
      <Tab.Screen 
        name="CartTab" 
        component={CartScreen} 
        options={{ 
          title: 'Cart', 
          tabBarLabel: 'Cart',
          tabBarIcon: () => <CartBadge />,
        }} 
      />
      <Tab.Screen 
        name="NotificationsTab" 
        component={NotificationsScreen} 
        options={{ 
          title: 'Alerts',
          tabBarLabel: 'Alerts',
          tabBarIcon: ({ color }) => (
            <View>
              <Text style={{ fontSize: 18 }}>🔔</Text>
              {unreadCount > 0 && (
                <View style={[navStyles.badge, { backgroundColor: theme.primary }]}>
                  <Text style={navStyles.badgeText}>
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </Text>
                </View>
              )}
            </View>
          ),
        }} 
      />
      <Tab.Screen 
        name="ProfileTab" 
        component={ProfileScreen} 
        options={{ 
          title: 'Profile', 
          tabBarLabel: 'Profile',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 18 }}>👤</Text>,
        }} 
      />
    </Tab.Navigator>
  );
}

const navStyles = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: -4,
    right: -8,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    color: '#FFF',
    fontSize: 9,
    fontWeight: '800',
  },
});

export default function AppNavigator() {
  const { isLoading, userInfo } = React.useContext(AuthContext);
  const isAdmin = userInfo?.role === 'ADMIN';
  const [isFirstLaunch, setIsFirstLaunch] = useState<boolean | null>(null);

  useEffect(() => {
    async function checkOnboarding() {
      try {
        const hasSeen = await SecureStore.getItemAsync('hasSeenOnboarding');
        if (hasSeen === 'true') {
          setIsFirstLaunch(false);
        } else {
          setIsFirstLaunch(true);
        }
      } catch (error) {
        setIsFirstLaunch(true);
      }
    }
    checkOnboarding();
  }, []);

  if (isLoading || isFirstLaunch === null) {
    return null; // Or a loading spinner
  }

  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName={isFirstLaunch ? 'Onboarding' : 'Main'}>
        <Stack.Screen 
          name="Onboarding" 
          component={OnboardingScreen} 
          options={{ headerShown: false }}
        />
        <Stack.Screen 
          name="Main" 
          component={MainTabs} 
          options={{ headerShown: false }}
        />
        <Stack.Screen 
          name="Products" 
          component={ProductsScreen} 
          options={{ title: 'Products' }}
        />
        <Stack.Screen 
          name="Services" 
          component={ServicesScreen} 
          options={{ title: 'Services' }}
        />
        <Stack.Screen 
          name="BookingSetup" 
          component={BookingSetupScreen} 
          options={{ title: 'Configure Booking' }}
        />
        <Stack.Screen 
          name="History" 
          component={HistoryScreen} 
          options={{ title: 'History' }}
        />
        <Stack.Screen 
          name="Checkout" 
          component={CheckoutScreen} 
          options={{ title: 'Checkout' }}
        />
        {isAdmin && (
          <Stack.Screen 
            name="Admin" 
            component={AdminScreen} 
            options={{ title: 'Admin Panel', headerShown: false }}
          />
        )}
        <Stack.Screen 
          name="ProductDetail" 
          component={ProductDetailScreen} 
          options={{ title: 'Product Details' }}
        />
        <Stack.Screen 
          name="Login" 
          component={LoginScreen} 
          options={{ headerShown: false }} 
        />
        <Stack.Screen 
          name="Signup" 
          component={SignupScreen} 
          options={{ title: 'Sign Up' }} 
        />
        <Stack.Screen 
          name="KYCVerification" 
          component={KYCVerificationScreen} 
          options={{ title: 'Identity Verification', headerShown: false }} 
        />
        <Stack.Screen 
          name="KYCStatus" 
          component={KYCStatusScreen} 
          options={{ title: 'Verification Status' }} 
        />
        <Stack.Screen 
          name="LiveTracking" 
          component={LiveTrackingScreen} 
          options={{ title: 'Live Map' }} 
        />
        <Stack.Screen 
          name="VideoCall" 
          component={VideoCallScreen} 
          options={{ title: 'Video Call' }} 
        />
        <Stack.Screen 
          name="Wallet" 
          component={WalletScreen} 
          options={{ title: 'Virtual Wallet' }} 
        />
        <Stack.Screen 
          name="BookParcel" 
          component={BookParcelScreen} 
          options={{ title: '🚚 Book Delivery Rider', headerBackTitle: 'Home' }} 
        />
        <Stack.Screen 
          name="BookRider" 
          component={BookParcelScreen} 
          options={{ title: '🚚 Book Delivery Rider', headerBackTitle: 'Home' }} 
        />
        <Stack.Screen 
          name="RiderEarnings" 
          component={RiderEarningsScreen} 
          options={{ title: '💰 My Earnings' }} 
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
