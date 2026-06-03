import React, { useState, useContext } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import apiClient from '../api/client';
import { AuthContext } from '../context/AuthContext';
import { SettingsContext } from '../context/SettingsContext';

export default function LoginScreen({ route, navigation }: any) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useContext(AuthContext);
  const { theme } = useContext(SettingsContext);

  // Optional redirect after auth (e.g. from guest checkout/booking interception)
  const redirectTo: string | undefined = route?.params?.redirectTo;
  const redirectParams: any = route?.params?.redirectParams;

  const TAB_SCREENS = ['HomeTab', 'CartTab', 'NotificationsTab', 'ProfileTab'];

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Missing Fields', 'Please fill in all inputs.');
      return;
    }

    setLoading(true);
    try {
      const response = await apiClient.post('/auth/login', { email, password });
      await login(response.data.token, response.data.user);

      // Redirect back to intended destination after login, or to KYC if required
      if (response.data.user.requiresKYC) {
        navigation.replace('KYCVerification', {
          redirectTo: redirectTo || 'Main',
          redirectParams: redirectParams,
        });
      } else if (redirectTo) {
        if (TAB_SCREENS.includes(redirectTo)) {
          // Navigate into the bottom tab navigator (nested screen)
          navigation.navigate('Main', { screen: redirectTo });
        } else {
          navigation.navigate(redirectTo, redirectParams || {});
        }
      }
    } catch (error: any) {
      console.error(error);
      Alert.alert('Authentication Failed', error.response?.data?.error || 'Invalid credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.card, { borderColor: theme.border }]}>
        <Text style={styles.logoText}>🛠️Akpoaza</Text>
        <Text style={styles.title}>Welcome Back</Text>
        <Text style={styles.subtitle}>
          {redirectTo
            ? 'Sign in to continue where you left off.'
            : 'Log in to request services or manage products.'}
        </Text>
        
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
        
        <TouchableOpacity 
          style={[styles.button, { backgroundColor: theme.primary, shadowColor: theme.primary }]} 
          onPress={handleLogin} 
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Log In</Text>
          )}
        </TouchableOpacity>
        
        <TouchableOpacity
          onPress={() => navigation.navigate('Signup', { redirectTo, redirectParams })}
          style={styles.linkContainer}
        >
          <Text style={styles.linkText}>
            Don't have an account? <Text style={[styles.linkHighlight, { color: theme.primary }]}>Sign Up</Text>
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },
  card: {
    backgroundColor: '#FFFFFF',
    padding: 32,
    borderRadius: 20,
    shadowColor: '#1C1C1E',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.04,
    shadowRadius: 24,
    elevation: 4,
    borderWidth: 1,
  },
  logoText: {
    fontSize: 24,
    textAlign: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    marginBottom: 8,
    textAlign: 'center',
    color: '#1C1C1E',
  },
  subtitle: {
    fontSize: 14,
    color: '#8E8E93',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 20,
  },
  input: {
    height: 52,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    marginBottom: 16,
    fontSize: 15,
    color: '#1C1C1E',
  },
  button: {
    height: 52,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 20,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 3,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  linkContainer: {
    alignItems: 'center',
  },
  linkText: {
    color: '#8E8E93',
    fontSize: 14,
  },
  linkHighlight: {
    fontWeight: '700',
  },
});
