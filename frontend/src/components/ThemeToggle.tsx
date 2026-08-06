import React, { useContext, useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  TouchableOpacity,
  View,
  Text,
} from 'react-native';
import { SettingsContext } from '../context/SettingsContext';

interface ThemeToggleProps {
  /** If true renders a compact icon-only pill (for nav bars). Default: false (labelled row). */
  compact?: boolean;
}

export default function ThemeToggle({ compact = false }: ThemeToggleProps) {
  const { colorMode, toggleColorMode, theme } = useContext(SettingsContext);
  const isDark = colorMode === 'dark';

  // Animated thumb position: 0 = light (left), 1 = dark (right)
  const anim = useRef(new Animated.Value(isDark ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: isDark ? 1 : 0,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [isDark]);

  const thumbLeft = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [2, 22],
  });

  const trackColor = anim.interpolate({
    inputRange: [0, 1],
    outputRange: ['#D1D1D6', '#3A3A4C'],
  });

  if (compact) {
    // Small pill for nav bar — just the track + thumb + emoji
    return (
      <TouchableOpacity
        onPress={toggleColorMode}
        activeOpacity={0.8}
        style={styles.compactWrapper}
        accessibilityRole="switch"
        accessibilityLabel={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        accessibilityState={{ checked: isDark }}
      >
        <Animated.View style={[styles.track, { backgroundColor: trackColor }]}>
          <Animated.View style={[styles.thumb, { left: thumbLeft }]}>
            <Text style={styles.thumbEmoji}>{isDark ? '🌙' : '☀️'}</Text>
          </Animated.View>
        </Animated.View>
      </TouchableOpacity>
    );
  }

  // Full labelled row — for Profile / Settings page
  return (
    <View style={[styles.rowWrapper, { borderColor: theme.border }]}>
      <View style={styles.rowLeft}>
        <Text style={styles.rowIcon}>{isDark ? '🌙' : '☀️'}</Text>
        <View>
          <Text style={[styles.rowTitle, { color: theme.text }]}>
            {isDark ? 'Dark Mode' : 'Light Mode'}
          </Text>
          <Text style={[styles.rowSub, { color: theme.lightText }]}>
            {isDark
              ? 'Easy on the eyes at night'
              : 'Bright & clear for daytime'}
          </Text>
        </View>
      </View>

      <TouchableOpacity
        onPress={toggleColorMode}
        activeOpacity={0.85}
        accessibilityRole="switch"
        accessibilityLabel={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        accessibilityState={{ checked: isDark }}
      >
        <Animated.View style={[styles.track, { backgroundColor: trackColor }]}>
          <Animated.View style={[styles.thumb, { left: thumbLeft }]}>
            <Text style={styles.thumbEmoji}>{isDark ? '🌙' : '☀️'}</Text>
          </Animated.View>
        </Animated.View>
      </TouchableOpacity>
    </View>
  );
}

const TRACK_W = 46;
const TRACK_H = 26;
const THUMB_SIZE = 22;

const styles = StyleSheet.create({
  compactWrapper: {
    padding: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  track: {
    width: TRACK_W,
    height: TRACK_H,
    borderRadius: TRACK_H / 2,
    justifyContent: 'center',
  },
  thumb: {
    position: 'absolute',
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    // Subtle shadow so thumb is visible on any background
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.18,
    shadowRadius: 2,
    elevation: 2,
  },
  thumbEmoji: {
    fontSize: 12,
    lineHeight: 14,
  },
  // Full row styles
  rowWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderRadius: 14,
    marginVertical: 6,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    marginRight: 12,
  },
  rowIcon: {
    fontSize: 24,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  rowSub: {
    fontSize: 12,
    marginTop: 1,
  },
});
