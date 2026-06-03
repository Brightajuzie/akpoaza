import React, { useEffect, useState, useContext } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Text, StyleSheet } from 'react-native';

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
import { AuthContext } from '../context/AuthContext';
import { SettingsContext } from '../context/SettingsContext';
import apiClient from '../api/client';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function MainTabs() {
  const { theme } = useContext(SettingsContext);
  const { userToken } = useContext(AuthContext);
  const [unreadCount, setUnreadCount] = useState(0);

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
    fetchUnread();
    const interval = setInterval(fetchUnread, 30000);
    return () => clearInterval(interval);
  }, [userToken]);

  return (
    <Tab.Navigator 
      screenOptions={{ 
        headerTitleAlign: 'center', 
        tabBarActiveTintColor: theme.primary,
        tabBarStyle: { borderTopColor: '#E5E5EA' },
      }}
    >
      <Tab.Screen 
        name="HomeTab" 
        component={HomeScreen} 
        options={{ 
          title: 'Home', 
          tabBarLabel: 'Home',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 18 }}>🏠</Text>,
        }} 
      />
      <Tab.Screen 
        name="CartTab" 
        component={CartScreen} 
        options={{ 
          title: 'Cart', 
          tabBarLabel: 'Cart',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 18 }}>🛒</Text>,
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
  const { isLoading } = React.useContext(AuthContext);

  if (isLoading) {
    return null; // Or a loading spinner
  }

  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Main">
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
        <Stack.Screen 
          name="Admin" 
          component={AdminScreen} 
          options={{ title: 'Admin Panel' }}
        />
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
      </Stack.Navigator>
    </NavigationContainer>
  );
}
