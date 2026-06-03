import React, { useContext, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NetworkContext } from '../context/NetworkContext';

/**
 * NetworkBanner
 * ─────────────
 * Slides down from the very top of the screen whenever connectivity changes.
 *
 *  • Offline  → red bar, stays visible until the connection is restored.
 *  • Online   → green bar, auto-dismisses after 3 seconds.
 *
 * Mount this component once, inside <SafeAreaProvider>, as a sibling to the
 * main navigator so it appears above all screen content.
 */
export default function NetworkBanner() {
  const { isConnected } = useContext(NetworkContext);
  const insets = useSafeAreaInsets();

  // True while the banner DOM node is mounted (we unmount it when fully hidden
  // so it doesn't capture touches on an invisible area).
  const [mounted, setMounted] = useState(false);

  // Whether the current visible banner is the "back online" variant.
  const [isOnlineBanner, setIsOnlineBanner] = useState(false);

  // Starts off-screen above the status bar.
  const translateY = useRef(new Animated.Value(-120)).current;

  // Tracks whether this is the very first connectivity reading so we don't
  // flash a "Back online" banner the moment the app launches.
  const isFirstRead = useRef(true);

  // Keeps a handle to the auto-dismiss timer so we can clear it on unmount.
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const slideIn = () => {
    Animated.spring(translateY, {
      toValue: 0,
      useNativeDriver: true,
      tension: 70,
      friction: 11,
    }).start();
  };

  const slideOut = (onDone?: () => void) => {
    Animated.timing(translateY, {
      toValue: -120,
      duration: 280,
      useNativeDriver: true,
    }).start(() => onDone?.());
  };

  useEffect(() => {
    if (dismissTimer.current) clearTimeout(dismissTimer.current);

    if (isFirstRead.current) {
      isFirstRead.current = false;

      if (!isConnected) {
        // Offline at launch — show the red banner immediately.
        setIsOnlineBanner(false);
        setMounted(true);
        // Reset position first so spring starts from the top.
        translateY.setValue(-120);
        slideIn();
      }
      // If we're online at launch, stay quiet.
      return;
    }

    if (!isConnected) {
      // Connection lost.
      setIsOnlineBanner(false);
      setMounted(true);
      translateY.setValue(-120);
      slideIn();
    } else {
      // Connection restored.
      setIsOnlineBanner(true);
      setMounted(true);
      translateY.setValue(-120);
      slideIn();

      dismissTimer.current = setTimeout(() => {
        slideOut(() => setMounted(false));
      }, 3000);
    }

    return () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, [isConnected]);

  if (!mounted) return null;

  const BANNER_HEIGHT = 64 + insets.top;
  const bgColor = isOnlineBanner ? '#16A34A' : '#DC2626';

  return (
    <Animated.View
      style={[
        styles.banner,
        {
          backgroundColor: bgColor,
          height: BANNER_HEIGHT,
          paddingTop: insets.top,
          transform: [{ translateY }],
          shadowColor: bgColor,
        },
      ]}
      pointerEvents="none"   // never block touches on the content below
    >
      {/* Subtle glow strip at the top edge */}
      <View style={[styles.glowStrip, { backgroundColor: isOnlineBanner ? '#4ADE80' : '#F87171' }]} />

      <View style={styles.row}>
        {/* Pulsing dot */}
        <View style={[styles.dot, { backgroundColor: isOnlineBanner ? '#BBF7D0' : '#FECACA' }]} />

        <View style={styles.textBlock}>
          <Text style={styles.title}>
            {isOnlineBanner ? 'Back online' : 'No internet connection'}
          </Text>
          <Text style={styles.subtitle}>
            {isOnlineBanner
              ? 'Your connection has been restored.'
              : 'Check your Wi-Fi or mobile data.'}
          </Text>
        </View>

        <Text style={styles.emoji}>
          {isOnlineBanner ? '✅' : '📡'}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    elevation: 20,          // Android: float above everything
    justifyContent: 'flex-end',
    ...Platform.select({
      ios: {
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.35,
        shadowRadius: 12,
      },
    }),
  },
  glowStrip: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    opacity: 0.6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingBottom: 12,
    gap: 12,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  textBlock: {
    flex: 1,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.80)',
    fontSize: 12,
    marginTop: 1,
  },
  emoji: {
    fontSize: 20,
  },
});
