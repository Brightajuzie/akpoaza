import React from 'react';
import { StyleSheet, ActivityIndicator, View, Platform, Text } from 'react-native';

let WebView: any = null;
if (Platform.OS !== 'web') {
  try {
    WebView = require('react-native-webview').WebView;
  } catch (e) {
    console.warn('WebView could not be loaded on this platform.', e);
  }
}

interface PaymentWebViewProps {
  url: string;
  onPaymentSuccess: (reference: string) => void;
  onPaymentCancel: () => void;
}

export default function PaymentWebView({ url, onPaymentSuccess, onPaymentCancel }: PaymentWebViewProps) {
  const handleNavigationStateChange = (state: any) => {
    // The URLs below are examples. In production, these should match your redirect URLs.
    if (state.url.includes('payment/callback')) {
      // Very basic extraction of reference (in reality, you parse the query string)
      onPaymentSuccess('PAYMENT_REF_EXTRACTED');
    } else if (state.url.includes('payment/cancel')) {
      onPaymentCancel();
    }
  };

  // Hooks must be called unconditionally at the top level (Rules of Hooks).
  // The platform check is inside the effect callback instead.
  React.useEffect(() => {
    if (Platform.OS === 'web') {
      // For web, redirect the window to the payment gateway URL directly,
      // as payment gateways generally block iframe rendering (X-Frame-Options).
      window.location.href = url;
    }
  }, [url]);

  if (Platform.OS === 'web') {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color="#007AFF" size="large" />
        <Text style={{ marginTop: 15, color: '#6C757D' }}>Redirecting to payment gateway...</Text>
      </View>
    );
  }

  if (!WebView) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color="#007AFF" size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <WebView
        source={{ uri: url }}
        onNavigationStateChange={handleNavigationStateChange}
        startInLoadingState={true}
        renderLoading={() => (
          <ActivityIndicator color="#007AFF" size="large" style={styles.loader} />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loader: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -20,
    marginTop: -20,
  },
});
