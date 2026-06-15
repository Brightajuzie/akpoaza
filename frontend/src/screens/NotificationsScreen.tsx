import React, { useState, useEffect, useContext, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import apiClient from '../api/client';
import { SettingsContext } from '../context/SettingsContext';
import { AuthContext } from '../context/AuthContext';

interface Notification {
  id: string;
  title: string;
  body: string;
  type: string;
  read: boolean;
  referenceId?: string;
  createdAt: string;
}

export default function NotificationsScreen({ navigation }: any) {
  const { theme } = useContext(SettingsContext);
  const { userToken } = useContext(AuthContext);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchNotifications = useCallback(async () => {
    try {
      const response = await apiClient.get('/notifications');
      setNotifications(response.data.notifications || []);
    } catch (error) {
      console.error('Failed to fetch notifications', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (userToken) {
      fetchNotifications();
    } else {
      setLoading(false);
    }
    // Poll every 30 seconds
    const interval = setInterval(() => {
      if (userToken) fetchNotifications();
    }, 30000);
    return () => clearInterval(interval);
  }, [userToken, fetchNotifications]);

  const handleMarkRead = async (id: string) => {
    try {
      await apiClient.patch(`/notifications/${id}/read`);
      setNotifications(prev =>
        prev.map(n => (n.id === id ? { ...n, read: true } : n))
      );
    } catch (error) {
      console.error('Failed to mark notification as read', error);
    }
  };

  const handleMarkAllRead = async () => {
    const unread = notifications.filter(n => !n.read);
    await Promise.all(unread.map(n => apiClient.patch(`/notifications/${n.id}/read`).catch(() => {})));
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const handleNotificationPress = (notification: Notification) => {
    handleMarkRead(notification.id);
    if (notification.referenceId) {
      if (notification.type === 'BOOKING') {
        navigation.navigate('History', { type: 'bookings', role: 'CUSTOMER' });
      } else if (notification.type === 'ORDER') {
        navigation.navigate('History', { type: 'orders', role: 'CUSTOMER' });
      } else if (notification.type === 'CALL') {
        navigation.navigate('VideoCall', { roomName: notification.referenceId });
      }
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'BOOKING': return '📅';
      case 'ORDER': return '📦';
      case 'JOB': return '💼';
      case 'CALL': return '📹';
      default: return '🔔';
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'BOOKING': return theme.primary;
      case 'ORDER': return '#FF9500';
      case 'JOB': return '#34C759';
      case 'CALL': return '#5856D6';
      default: return '#8E8E93';
    }
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  const renderNotification = ({ item }: { item: Notification }) => (
    <TouchableOpacity
      style={[
        styles.card,
        { borderColor: item.read ? '#E5E5EA' : getTypeColor(item.type) + '40' },
        !item.read && styles.unreadCard,
      ]}
      onPress={() => handleNotificationPress(item)}
      activeOpacity={0.8}
    >
      {/* Unread dot */}
      {!item.read && (
        <View style={[styles.unreadDot, { backgroundColor: getTypeColor(item.type) }]} />
      )}

      <View style={[styles.iconCircle, { backgroundColor: getTypeColor(item.type) + '15' }]}>
        <Text style={styles.iconText}>{getTypeIcon(item.type)}</Text>
      </View>

      <View style={styles.cardContent}>
        <View style={styles.cardTop}>
          <Text style={[styles.notifTitle, !item.read && styles.unreadTitle]} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={styles.timeText}>{formatTime(item.createdAt)}</Text>
        </View>
        <Text style={styles.notifBody} numberOfLines={2}>
          {item.body}
        </Text>
        <View style={[styles.typePill, { backgroundColor: getTypeColor(item.type) + '15' }]}>
          <Text style={[styles.typeText, { color: getTypeColor(item.type) }]}>
            {item.type}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  if (!userToken) {
    return (
      <View style={[styles.guestContainer, { backgroundColor: theme.background }]}>
        <View style={[styles.guestCard, { borderColor: theme.border }]}>
          <Text style={{ fontSize: 48, marginBottom: 16 }}>🔔</Text>
          <Text style={styles.guestCardTitle}>Real-Time Alerts</Text>
          <Text style={styles.guestSubLabel}>
            Log in or sign up to receive direct matched technician notifications, live booking updates, order invoices, and exclusive service spotlights!
          </Text>
          <TouchableOpacity 
            style={[styles.primaryBtn, { backgroundColor: theme.primary, width: '100%', borderRadius: 12, paddingVertical: 14 }]} 
            onPress={() => navigation.navigate('Login')}
          >
            <Text style={styles.primaryBtnText}>Log In</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.logoutButton, { width: '100%', marginTop: 12, borderRadius: 12, paddingVertical: 14, borderColor: theme.primary }]} 
            onPress={() => navigation.navigate('Signup')}
          >
            <Text style={[styles.logoutButtonText, { color: theme.primary }]}>Create Account</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Notifications</Text>
          {unreadCount > 0 && (
            <Text style={[styles.headerSubtitle, { color: theme.primary }]}>
              {unreadCount} unread message{unreadCount !== 1 ? 's' : ''}
            </Text>
          )}
        </View>
        {unreadCount > 0 && (
          <TouchableOpacity
            style={[styles.markAllBtn, { borderColor: theme.primary }]}
            onPress={handleMarkAllRead}
          >
            <Text style={[styles.markAllText, { color: theme.primary }]}>Mark all read</Text>
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={notifications}
        keyExtractor={item => item.id}
        renderItem={renderNotification}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              fetchNotifications();
            }}
            tintColor={theme.primary}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>🔔</Text>
            <Text style={styles.emptyTitle}>All caught up!</Text>
            <Text style={styles.emptySubtitle}>
              You have no notifications yet. Booking updates, job assignments, and order alerts will appear here.
            </Text>
          </View>
        }
        ListHeaderComponent={
          notifications.length > 0 ? (
            <Text style={styles.listHeader}>
              {notifications.length} notification{notifications.length !== 1 ? 's' : ''}
            </Text>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  guestContainer: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },
  guestCard: {
    backgroundColor: '#FFFFFF',
    padding: 32,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    shadowColor: '#1C1C1E',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.04,
    shadowRadius: 24,
    elevation: 4,
  },
  guestCardTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1C1C1E',
    marginBottom: 12,
  },
  guestSubLabel: {
    fontSize: 14,
    color: '#8E8E93',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  primaryBtn: {
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  logoutButton: {
    backgroundColor: '#FFF',
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
  },
  logoutButtonText: {
    fontSize: 16,
    fontWeight: '700',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1C1C1E',
  },
  headerSubtitle: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
  },
  markAllBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  markAllText: {
    fontSize: 12,
    fontWeight: '700',
  },
  listHeader: {
    fontSize: 12,
    color: '#8E8E93',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  listContent: {
    padding: 16,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
    position: 'relative',
  },
  unreadCard: {
    backgroundColor: '#FAFBFF',
    shadowOpacity: 0.07,
  },
  unreadDot: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    flexShrink: 0,
  },
  iconText: {
    fontSize: 20,
  },
  cardContent: {
    flex: 1,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  notifTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3A3A3C',
    flex: 1,
    marginRight: 8,
  },
  unreadTitle: {
    fontWeight: '800',
    color: '#1C1C1E',
  },
  timeText: {
    fontSize: 11,
    color: '#AEAEB2',
    flexShrink: 0,
  },
  notifBody: {
    fontSize: 13,
    color: '#8E8E93',
    lineHeight: 18,
    marginBottom: 8,
  },
  typePill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  typeText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 32,
  },
  emptyIcon: {
    fontSize: 56,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1C1C1E',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#8E8E93',
    textAlign: 'center',
    lineHeight: 20,
  },
});
