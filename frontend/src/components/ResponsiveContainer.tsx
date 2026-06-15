import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';

interface ResponsiveContainerProps {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
  maxWidth?: number;
}

export default function ResponsiveContainer({ children, style, maxWidth = 1200 }: ResponsiveContainerProps) {
  return (
    <View style={[styles.outer, style]}>
      <View style={[styles.inner, { maxWidth }]}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    flex: 1,
    alignItems: 'center',
    width: '100%',
  },
  inner: {
    flex: 1,
    width: '100%',
  },
});
