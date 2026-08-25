import React from 'react';
import {
  Modal,
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { getImageUri } from '../api/client';

interface ImageViewerModalProps {
  visible: boolean;
  imageUrl?: string | null;
  title?: string;
  subtitle?: string;
  price?: string;
  onClose: () => void;
}

export default function ImageViewerModal({
  visible,
  imageUrl,
  title,
  subtitle,
  price,
  onClose,
}: ImageViewerModalProps) {
  const { width, height } = useWindowDimensions();
  if (!imageUrl) return null;

  const resolvedUri = getImageUri(imageUrl) || imageUrl;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        <StatusBar barStyle="light-content" backgroundColor="#000" />
        <SafeAreaView style={styles.safeArea}>
          {/* Header Bar */}
          <View style={styles.headerBar}>
            <View style={styles.headerLeft}>
              {title && (
                <Text style={styles.headerTitle} numberOfLines={1}>
                  {title}
                </Text>
              )}
              {subtitle && (
                <Text style={styles.headerSubtitle} numberOfLines={1}>
                  {subtitle}
                </Text>
              )}
            </View>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              activeOpacity={0.8}
            >
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Main Image Stage */}
          <TouchableOpacity
            style={styles.imageContainer}
            activeOpacity={1}
            onPress={onClose}
          >
            <Image
              source={{ uri: resolvedUri }}
              style={[styles.fullImage, { width: Math.min(width - 24, 700), height: height * 0.7 }]}
              resizeMode="contain"
            />
          </TouchableOpacity>

          {/* Footer Caption */}
          {(title || price) && (
            <View style={styles.footerBar}>
              <View style={{ flex: 1 }}>
                {title && (
                  <Text style={styles.footerTitle} numberOfLines={2}>
                    {title}
                  </Text>
                )}
                {subtitle && (
                  <Text style={styles.footerSubtitle} numberOfLines={1}>
                    {subtitle}
                  </Text>
                )}
              </View>
              {price && (
                <View style={styles.priceBadge}>
                  <Text style={styles.priceText}>{price}</Text>
                </View>
              )}
            </View>
          )}
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.94)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  safeArea: {
    flex: 1,
    width: '100%',
    justifyContent: 'space-between',
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    zIndex: 10,
  },
  headerLeft: {
    flex: 1,
    marginRight: 16,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  headerSubtitle: {
    color: '#94A3B8',
    fontSize: 13,
    marginTop: 2,
  },
  closeButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 20,
  },
  imageContainer: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  fullImage: {
    maxWidth: 700,
    maxHeight: '80%',
  },
  footerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  footerTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  footerSubtitle: {
    color: '#94A3B8',
    fontSize: 13,
    marginTop: 2,
  },
  priceBadge: {
    backgroundColor: '#22C55E',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    marginLeft: 12,
  },
  priceText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
});
