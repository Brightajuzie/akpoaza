import React from 'react';
import { StyleSheet, ActivityIndicator, View, Platform, Text, TouchableOpacity } from 'react-native';

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
  provider?: 'STRIPE' | 'PAYSTACK' | 'FLUTTERWAVE' | 'OPAY' | null;
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
    if (provider === 'STRIPE') {
      return (
        parsed.searchParams.get('reference') ||
        parsed.searchParams.get('payment_intent') ||
        parsed.searchParams.get('session_id') ||
        'STRIPE_REF'
      );
    } else if (provider === 'PAYSTACK') {
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
        parsed.searchParams.get('reference') ||
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
 *
 * This used to match any URL that merely *looked like* a gateway callback
 * (e.g. any navigation to `/api/payments/paystack/callback`, regardless of
 * outcome) — but the backend serves that exact same path whether or not it
 * actually verified the payment (see renderSuccessHtml/renderFailureHtml in
 * payments.ts), and `onNavigationStateChange` fires the instant that URL is
 * requested, before the page's own postMessage/redirect JS has run. So the
 * app could show "Payment Successful!" purely because the WebView navigated
 * to a callback-shaped URL, even for a payment the backend had just refused
 * to verify. Every one of those pages' own JS goes on to redirect the
 * WebView to `${frontendUrl}/?payment_status=success|failed|cancelled&ref=…`
 * once the real, verified outcome is known — checking that param is what's
 * actually authoritative.
 */
function isSuccessUrl(url: string): boolean {
  try {
    return new URL(url).searchParams.get('payment_status') === 'success';
  } catch {
    return url.includes('payment_status=success');
  }
}

function isCancelUrl(url: string): boolean {
  try {
    const status = new URL(url).searchParams.get('payment_status');
    return status === 'cancelled' || status === 'failed';
  } catch {
    return url.includes('payment_status=cancelled') || url.includes('payment_status=failed');
  }
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
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', padding: 24 }]}>
        <ActivityIndicator color="#22A45D" size="large" />
        <Text style={{ marginTop: 16, color: '#64748B', fontWeight: '600', fontSize: 16 }}>
          Redirecting to {provider || 'payment'} gateway...
        </Text>
        <TouchableOpacity
          style={{ marginTop: 24, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, backgroundColor: '#22A45D' }}
          onPress={() => { window.location.href = url; }}
        >
          <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Click here if not redirected automatically</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={{ marginTop: 12, paddingVertical: 8 }}
          onPress={onPaymentCancel}
        >
          <Text style={{ color: '#EF4444', fontWeight: '600' }}>Cancel Payment</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!WebView) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color="#22A45D" size="large" />
        <Text style={{ marginTop: 15, color: '#6C757D' }}>Loading payment gateway…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <WebView
        source={{ uri: url }}
        onNavigationStateChange={handleNavigationStateChange}
        onMessage={(event: any) => {
          try {
            const data = JSON.parse(event.nativeEvent.data);
            if (data && data.status === 'success') {
              onPaymentSuccess(data.reference || extractReference(url, provider));
            } else if (data && data.status === 'failed') {
              onPaymentCancel();
            }
          } catch (e) {
            // Ignore non-JSON messages
          }
        }}
        startInLoadingState={true}
        renderLoading={() => (
          <ActivityIndicator color="#22A45D" size="large" style={styles.loader} />
        )}
        javaScriptEnabled={true}
        domStorageEnabled={true}
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
