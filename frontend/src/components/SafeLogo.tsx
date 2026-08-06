import React, { useState, useEffect } from 'react';
import { View, Image, ImageStyle, StyleSheet, LayoutChangeEvent } from 'react-native';

const LOCAL_LOGO = require('../../assets/logo_transparent.png');

interface SafeLogoProps {
  logoUrl?: string | null;
  style?: ImageStyle | ImageStyle[] | any;
  resizeMode?: 'contain' | 'cover' | 'stretch' | 'repeat' | 'center';
}

/** Format relative or absolute URLs into valid remote URIs */
function formatLogoUri(url?: string | null): string | null {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('file:')
  ) {
    return trimmed;
  }
  if (trimmed.startsWith('/')) {
    const apiBase = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:5000/api';
    const origin = apiBase.replace(/\/api\/?$/, '');
    return `${origin}${trimmed}`;
  }
  return null;
}

/**
 * SafeLogo — Bulletproof logo renderer that never flashes, disappears, or shows blank space.
 * 
 * Strategy:
 * 1. Always renders the local bundled logo as a solid background layer.
 * 2. If a remote logo URL is provided, loads it asynchronously on top.
 * 3. Only makes the remote logo visible once it successfully loads (onLoad).
 * 4. If remote loading fails (onError), local logo remains seamlessly displayed.
 */
export default function SafeLogo({
  logoUrl,
  style,
  resizeMode = 'contain',
}: SafeLogoProps) {
  const [remoteLoaded, setRemoteLoaded] = useState(false);
  const [remoteError, setRemoteError] = useState(false);

  const resolvedUri = formatLogoUri(logoUrl);

  // Reset loading states when logoUrl prop changes
  useEffect(() => {
    setRemoteLoaded(false);
    setRemoteError(false);
  }, [logoUrl]);

  // Extract dimensions from style or fallback to default
  const flattenedStyle = StyleSheet.flatten(style) || {};
  const containerWidth = flattenedStyle.width ?? 38;
  const containerHeight = flattenedStyle.height ?? 38;

  const showRemote = Boolean(resolvedUri && !remoteError);

  return (
    <View
      style={[
        style,
        {
          width: containerWidth,
          height: containerHeight,
          position: 'relative',
          justifyContent: 'center',
          alignItems: 'center',
        },
      ]}
    >
      {/* Base Layer: Local bundled logo — ALWAYS visible as fallback */}
      <Image
        source={LOCAL_LOGO}
        style={[
          StyleSheet.absoluteFillObject,
          { width: '100%', height: '100%' },
        ]}
        resizeMode={resizeMode}
      />

      {/* Top Layer: Remote logo — rendered over base layer, shown only when loaded */}
      {showRemote && (
        <Image
          source={{ uri: resolvedUri! }}
          style={[
            StyleSheet.absoluteFillObject,
            {
              width: '100%',
              height: '100%',
              opacity: remoteLoaded ? 1 : 0,
            },
          ]}
          resizeMode={resizeMode}
          onLoad={() => setRemoteLoaded(true)}
          onError={() => setRemoteError(true)}
        />
      )}
    </View>
  );
}
