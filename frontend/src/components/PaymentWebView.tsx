import React from 'react';
import { StyleSheet, ActivityIndicator, View } from 'react-native';
import { WebView } from 'react-native-webview';

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
