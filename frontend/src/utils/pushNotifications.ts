import { Platform } from 'react-native';
import apiClient from '../api/client';

// On Web, expo-notifications native functions are not supported
let Notifications: any = null;
if (Platform.OS !== 'web') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    Notifications = require('expo-notifications');
  } catch (e) {
    console.warn('[pushNotifications] Failed to load expo-notifications:', e);
  }
}

// Configure foreground notification behavior on native
if (Notifications && Platform.OS !== 'web') {
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });
  } catch (e) {
    console.warn('[pushNotifications] setNotificationHandler error:', e);
  }
}

/**
 * registerForPushNotificationsAsync
 * Requests permission, obtains Expo Push Token, sets up Android channels,
 * and registers the token with the FixMart backend.
 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (Platform.OS === 'web' || !Notifications) {
    return null;
  }

  try {
    // Android requires a Notification Channel for Android 8.0+
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'FixMart Notifications',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#007AFF',
        sound: 'default',
        enableVibrate: true,
        showBadge: true,
      });
    }

    // Check existing permission
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('[pushNotifications] Push notification permission not granted:', finalStatus);
      return null;
    }

    // Obtain Expo Push Token using project EAS ID
    const tokenResponse = await Notifications.getExpoPushTokenAsync({
      projectId: '8d4405de-245d-4c45-b0c0-5331aeb2e9fe',
    });

    const token = tokenResponse?.data;
    if (token) {
      // Sync token to backend
      await apiClient.patch('/auth/push-token', { pushToken: token }).catch((err) => {
        console.warn('[pushNotifications] Failed to sync push token with backend:', err?.message);
      });
      return token;
    }
    return null;
  } catch (error: any) {
    console.warn('[pushNotifications] Error registering for push notifications:', error?.message);
    return null;
  }
}

/**
 * unregisterPushTokenAsync
 * Clears the push token from backend when user logs out.
 */
export async function unregisterPushTokenAsync(): Promise<void> {
  try {
    await apiClient.delete('/auth/push-token');
  } catch {
    // Ignore error on logout
  }
}

/**
 * setupNotificationListeners
 * Sets up foreground and tap listeners. Calls onNotificationTap callback with notification data.
 */
export function setupNotificationListeners(onNotificationTap?: (data: any) => void) {
  if (Platform.OS === 'web' || !Notifications) return () => {};

  try {
    // Listener for when user taps on a notification
    const responseListener = Notifications.addNotificationResponseReceivedListener((response: any) => {
      const data = response?.notification?.request?.content?.data;
      if (data && onNotificationTap) {
        onNotificationTap(data);
      }
    });

    return () => {
      if (responseListener && Notifications.removeNotificationSubscription) {
        Notifications.removeNotificationSubscription(responseListener);
      }
    };
  } catch (e) {
    console.warn('[pushNotifications] setupNotificationListeners error:', e);
    return () => {};
  }
}
