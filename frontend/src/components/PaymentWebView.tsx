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
  provider?: 'PAYSTACK' | 'FLUTTERWAVE' | 'OPAY' | null;
  onPaymentSuccess: (reference: string) => void;
  onPaymentCancel: () => void;
}

/**
 * Extracts the payment reference from a callback URL.
 * Each gateway uses different query-string keys.
 */
function extractReference(url: string, provider?: string | null): string {
  try {
    const parsed = new URL(url);
    if (provider === 'PAYSTACK') {
      // Paystack: ?reference=xxx or ?trxref=xxx
      return (
        parsed.searchParams.get('reference') ||
        parsed.searchParams.get('trxref') ||
        'PAYSTACK_REF'
      );
    } else if (provider === 'FLUTTERWAVE') {
      // Flutterwave: ?transaction_id=xxx or ?tx_ref=xxx
      return (
        parsed.searchParams.get('transaction_id') ||
        parsed.searchParams.get('tx_ref') ||
        'FLW_REF'
      );
    } else if (provider === 'OPAY') {
      // OPay: ?reference=xxx or ?orderNo=xxx
      return (
        parsed.searchParams.get('reference') ||
        parsed.searchParams.get('orderNo') ||
        'OPAY_REF'
      );
    }
  } catch {
    // URL parsing failed — fall through to default
  }
  return 'PAYMENT_REF';
}

/**
 * Detects whether a navigation URL signals a successful payment.
 * Matches `/payment/callback`, `/payment/success`, or gateway-specific redirects.
 */
function isSuccessUrl(url: string): boolean {
  return (
    url.includes('payment/callback') ||
    url.includes('payment/success') ||
    url.includes('/checkout/success') ||
    // Paystack status=success
    (url.includes('paystack') && url.includes('status=success')) ||
    // Flutterwave status=successful
    (url.includes('flutterwave') && url.includes('status=successful')) ||
    // OPay success indicator
    (url.includes('opay') && url.includes('status=SUCCESS'))
  );
}

function isCancelUrl(url: string): boolean {
  return (
    url.includes('payment/cancel') ||
    url.includes('payment/failed') ||
    url.includes('/checkout/cancel') ||
    (url.includes('paystack') && url.includes('status=cancel')) ||
    (url.includes('flutterwave') && url.includes('status=cancelled'))
  );
}

export default function PaymentWebView({
  url,
  provider,
  onPaymentSuccess,
  onPaymentCancel,
}: PaymentWebViewProps) {
  const handleNavigationStateChange = (state: any) => {
    const navUrl: string = state.url || '';
    if (isSuccessUrl(navUrl)) {
      const ref = extractReference(navUrl, provider);
      onPaymentSuccess(ref);
    } else if (isCancelUrl(navUrl)) {
      onPaymentCancel();
    }
  };

  // For web: redirect the whole page — gateways block iframes via X-Frame-Options
  React.useEffect(() => {
    if (Platform.OS === 'web') {
      window.location.href = url;
    }
  }, [url]);

  if (Platform.OS === 'web') {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color="#007AFF" size="large" />
        <Text style={{ marginTop: 15, color: '#6C757D' }}>
          Redirecting to payment gateway...
        </Text>
      </View>
    );
  }

  if (!WebView) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color="#007AFF" size="large" />
        <Text style={{ marginTop: 15, color: '#6C757D' }}>Loading payment gateway…</Text>
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
        javaScriptEnabled={true}
        domStorageEnabled={true}
        // Allow gateway-originated redirects back to deep-link callbacks
        originWhitelist={['*']}
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
