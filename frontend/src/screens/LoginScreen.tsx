import React, { useState, useContext, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, Animated, Platform,
} from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from '../utils/storage';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import apiClient from '../api/client';
import { AuthContext } from '../context/AuthContext';
import { SettingsContext } from '../context/SettingsContext';

// Required for Google OAuth to work on mobile
WebBrowser.maybeCompleteAuthSession();

const BIOMETRIC_TOKEN_KEY = 'biometric_auth_token';
const BIOMETRIC_ENABLED_KEY = 'biometric_enabled';

export default function LoginScreen({ route, navigation }: any) {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEnabled, setBiometricEnabled]     = useState(false);
  const [googleLoading, setGoogleLoading]           = useState(false);

  const { login } = useContext(AuthContext);
  const { theme } = useContext(SettingsContext);

  const redirectTo: string | undefined     = route?.params?.redirectTo;
  const redirectParams: any                = route?.params?.redirectParams;
  const TAB_SCREENS = ['HomeTab', 'CartTab', 'NotificationsTab', 'ProfileTab'];

  // ── Google Auth ──────────────────────────────────────────────────────────
  // Only enable Google Sign-In when at least one client ID is configured.
  // If none are set the hook would throw — guard it with undefined fallbacks.
  const ANDROID_ID = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || undefined;
  const IOS_ID     = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID     || undefined;
  const WEB_ID     = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID      || undefined;
  const googleConfigured = !!(ANDROID_ID || IOS_ID || WEB_ID);

  const [request, response, promptAsync] = Google.useAuthRequest(
    googleConfigured
      ? { androidClientId: ANDROID_ID, iosClientId: IOS_ID, webClientId: WEB_ID }
      : ({ androidClientId: 'placeholder', iosClientId: 'placeholder', webClientId: 'placeholder' } as any),
  );

  // ── Biometric Setup ───────────────────────────────────────────────────────
  useEffect(() => {
    checkBiometricSupport();
  }, []);

  // Handle Google OAuth callback
  useEffect(() => {
    if (response?.type === 'success') {
      const { authentication } = response;
      if (authentication?.idToken) {
        handleGoogleAuth(authentication.idToken);
      } else if (authentication?.accessToken) {
        // Fallback: fetch the ID token using the access token
        fetchGoogleUserInfo(authentication.accessToken);
      }
    }
  }, [response]);

  const checkBiometricSupport = async () => {
    const hasHardware     = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled      = await LocalAuthentication.isEnrolledAsync();
    const available       = hasHardware && isEnrolled;
    setBiometricAvailable(available);

    if (available) {
      const enabled = await SecureStore.getItemAsync(BIOMETRIC_ENABLED_KEY);
      if (enabled === 'true') {
        setBiometricEnabled(true);
        // Auto-trigger biometric login on startup
        triggerBiometricLogin();
      }
    }
  };

  const triggerBiometricLogin = async () => {
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Authenticate to log in',
        cancelLabel: 'Use Password',
        fallbackLabel: 'Use Password',
        disableDeviceFallback: false,
      });

      if (result.success) {
        const token = await SecureStore.getItemAsync(BIOMETRIC_TOKEN_KEY);
        if (token) {
          // Re-validate token with backend
          const userRes = await apiClient.get('/auth/me', {
            headers: { Authorization: `Bearer ${token}` }
          });
          await login(token, userRes.data);
          navigateAfterLogin(userRes.data);
        } else {
          Alert.alert('Session Expired', 'Please log in with your password to re-enable biometrics.');
        }
      }
    } catch (err) {
      // Silently fail — user can still log in with password
      console.log('Biometric auth skipped');
    }
  };

  const promptEnableBiometrics = async (token: string) => {
    if (!biometricAvailable) return;
    Alert.alert(
      '🔐 Enable Biometric Login',
      'Would you like to use Face ID / Fingerprint for faster sign-ins?',
      [
        { text: 'Not Now', style: 'cancel' },
        {
          text: 'Enable',
          onPress: async () => {
            await SecureStore.setItemAsync(BIOMETRIC_TOKEN_KEY, token);
            await SecureStore.setItemAsync(BIOMETRIC_ENABLED_KEY, 'true');
            setBiometricEnabled(true);
            Alert.alert('✅ Biometric Login Enabled', 'You can now sign in with Face ID or Fingerprint.');
          }
        }
      ]
    );
  };

  // ── Navigation helper ─────────────────────────────────────────────────────
  const navigateAfterLogin = (user: any) => {
    if (user.requiresKYC) {
      navigation.replace('KYCVerification', {
        redirectTo:     redirectTo || 'Main',
        redirectParams: redirectParams,
      });
    } else if (redirectTo) {
      if (TAB_SCREENS.includes(redirectTo)) {
        navigation.navigate('Main', { screen: redirectTo });
      } else {
        navigation.navigate(redirectTo, redirectParams || {});
      }
    } else {
      // No redirect target — go to main app
      navigation.replace('Main');
    }
  };

  // ── Password Login ────────────────────────────────────────────────────────
  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Missing Fields', 'Please fill in all inputs.');
      return;
    }
    setLoading(true);
    try {
      const res = await apiClient.post('/auth/login', { email, password });
      await login(res.data.token, res.data.user);

      // Offer biometric setup after first manual login
      const alreadyEnabled = await SecureStore.getItemAsync(BIOMETRIC_ENABLED_KEY);
      if (alreadyEnabled !== 'true') {
        await promptEnableBiometrics(res.data.token);
      }

      navigateAfterLogin(res.data.user);
    } catch (error: any) {
      Alert.alert('Authentication Failed', error.response?.data?.error || 'Invalid credentials.');
    } finally {
      setLoading(false);
    }
  };

  // ── Google Login ──────────────────────────────────────────────────────────
  const fetchGoogleUserInfo = async (accessToken: string) => {
    setGoogleLoading(true);
    try {
      const userInfoRes = await fetch('https://www.googleapis.com/userinfo/v2/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const userInfo = await userInfoRes.json();
      // Exchange with our backend
      const res = await apiClient.post('/auth/google', {
        idToken: accessToken, // backend will use access token flow
        googleSub: userInfo.id,
        email: userInfo.email,
        name: userInfo.name,
        picture: userInfo.picture,
      });
      await login(res.data.token, res.data.user);
      navigateAfterLogin(res.data.user);
    } catch (err: any) {
      Alert.alert('Google Sign-In Failed', err.response?.data?.error || 'Could not complete Google sign-in.');
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleGoogleAuth = async (idToken: string) => {
    setGoogleLoading(true);
    try {
      const res = await apiClient.post('/auth/google', { idToken });
      await login(res.data.token, res.data.user);
      navigateAfterLogin(res.data.user);
    } catch (err: any) {
      Alert.alert('Google Sign-In Failed', err.response?.data?.error || 'Could not complete Google sign-in.');
    } finally {
      setGoogleLoading(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.card, { borderColor: theme.border }]}>
        <Text style={styles.logoText}>🛠️ FixMart</Text>
        <Text style={styles.title}>Welcome Back</Text>
        <Text style={styles.subtitle}>
          {redirectTo
            ? 'Sign in to continue where you left off.'
            : 'Log in to request services or manage your account.'}
        </Text>

        {/* ── Biometric Quick Login ── */}
        {biometricEnabled && (
          <TouchableOpacity
            style={[styles.biometricBtn, { borderColor: theme.primary }]}
            onPress={triggerBiometricLogin}
          >
            <Text style={styles.biometricIcon}>{Platform.OS === 'ios' ? '👤' : '🔒'}</Text>
            <Text style={[styles.biometricText, { color: theme.primary }]}>
              Sign in with {Platform.OS === 'ios' ? 'Face ID / Touch ID' : 'Fingerprint'}
            </Text>
          </TouchableOpacity>
        )}

        {/* ── Divider ── */}
        {biometricEnabled && (
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or continue with</Text>
            <View style={styles.dividerLine} />
          </View>
        )}

        <TextInput
          style={[styles.input, { backgroundColor: theme.background, borderColor: theme.border }]}
          placeholder="Email address"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholderTextColor="#8E8E93"
        />
        <TextInput
          style={[styles.input, { backgroundColor: theme.background, borderColor: theme.border }]}
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholderTextColor="#8E8E93"
        />

        {/* ── Login Button ── */}
        <TouchableOpacity
          style={[styles.button, { backgroundColor: theme.primary, shadowColor: theme.primary }]}
          onPress={handleLogin}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.buttonText}>Log In</Text>}
        </TouchableOpacity>

        {/* ── Google Sign-In (only shown when client IDs are configured) ── */}
        {googleConfigured && (
          <TouchableOpacity
            style={styles.googleBtn}
            onPress={() => promptAsync()}
            disabled={googleLoading || !request}
          >
            {googleLoading
              ? <ActivityIndicator color="#1C1C1E" />
              : (
                <View style={styles.googleBtnInner}>
                  <Text style={styles.googleIcon}>G</Text>
                  <Text style={styles.googleBtnText}>Continue with Google</Text>
                </View>
              )}
          </TouchableOpacity>
        )}

        <TouchableOpacity
          onPress={() => navigation.navigate('Signup', { redirectTo, redirectParams })}
          style={styles.linkContainer}
        >
          <Text style={styles.linkText}>
            Don't have an account?{' '}
            <Text style={[styles.linkHighlight, { color: theme.primary }]}>Sign Up</Text>
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: 'center' },
  card: {
    backgroundColor: '#FFFFFF',
    padding: 32,
    borderRadius: 20,
    shadowColor: '#1C1C1E',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.06,
    shadowRadius: 24,
    elevation: 4,
    borderWidth: 1,
  },
  logoText: { fontSize: 24, textAlign: 'center', marginBottom: 8 },
  title: { fontSize: 26, fontWeight: '800', marginBottom: 8, textAlign: 'center', color: '#1C1C1E' },
  subtitle: { fontSize: 14, color: '#8E8E93', textAlign: 'center', marginBottom: 24, lineHeight: 20 },

  // Biometric
  biometricBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderRadius: 14,
    paddingVertical: 14,
    marginBottom: 16,
    gap: 10,
  },
  biometricIcon: { fontSize: 22 },
  biometricText: { fontSize: 15, fontWeight: '700' },

  // Divider
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#E5E5EA' },
  dividerText: { marginHorizontal: 12, color: '#8E8E93', fontSize: 12, fontWeight: '600' },

  // Inputs
  input: {
    height: 52, borderWidth: 1, borderRadius: 12,
    paddingHorizontal: 16, marginBottom: 14,
    fontSize: 15, color: '#1C1C1E',
  },

  // Login button
  button: {
    height: 52, borderRadius: 12, justifyContent: 'center',
    alignItems: 'center', marginTop: 4, marginBottom: 14,
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15,
    shadowRadius: 8, elevation: 3,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  // Google
  googleBtn: {
    height: 52, borderRadius: 12, justifyContent: 'center',
    alignItems: 'center', marginBottom: 20,
    borderWidth: 1.5, borderColor: '#E5E5EA', backgroundColor: '#FAFAFA',
  },
  googleBtnInner: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  googleIcon: {
    fontSize: 18, fontWeight: '900', color: '#4285F4',
    fontStyle: 'italic',
  },
  googleBtnText: { fontSize: 15, fontWeight: '700', color: '#1C1C1E' },

  // Link
  linkContainer: { alignItems: 'center' },
  linkText: { color: '#8E8E93', fontSize: 14 },
  linkHighlight: { fontWeight: '700' },
});
