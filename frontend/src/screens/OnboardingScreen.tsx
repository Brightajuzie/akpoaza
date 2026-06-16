import React, { useContext } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
<<<<<<< HEAD
import * as SecureStore from '../utils/storage';
=======
import * as SecureStore from 'expo-secure-store';
>>>>>>> d74cc15965da6815edf7abdf37c172020b892227
import { SettingsContext } from '../context/SettingsContext';

const { width, height } = Dimensions.get('window');

export default function OnboardingScreen({ navigation }: any) {
  const { theme } = useContext(SettingsContext);

  const handleGetStarted = async () => {
    try {
      await SecureStore.setItemAsync('hasSeenOnboarding', 'true');
      navigation.replace('Main');
    } catch (error) {
      console.error('Error saving onboarding state:', error);
      navigation.replace('Main');
    }
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[theme.primary, theme.secondary || '#203a43', '#0f2027']}
        style={styles.gradient}
      >
        <View style={styles.content}>
          <View style={styles.logoContainer}>
            <Image 
              source={require('../../assets/logo_transparent.png')} 
              style={styles.logoImage} 
              resizeMode="contain"
            />
          </View>
          
          <View style={styles.textContainer}>
            <Text style={styles.welcomeText}>Welcome to FixMart</Text>
            <Text style={styles.subtitleText}>Buy, sell and book a service</Text>
          </View>

          <TouchableOpacity style={styles.button} onPress={handleGetStarted} activeOpacity={0.8}>
            <Text style={[styles.buttonText, { color: theme.primary }]}>Get Started</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    width: '100%',
    padding: 24,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: height * 0.15,
    paddingBottom: height * 0.08,
  },
  logoContainer: {
    alignItems: 'center',
  },
  logoImage: {
    width: 220,
    height: 220,
  },
  textContainer: {
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  welcomeText: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitleText: {
    fontSize: 18,
    color: '#E5E5EA',
    textAlign: 'center',
    lineHeight: 26,
    fontWeight: '500',
  },
  button: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 18,
    paddingHorizontal: width * 0.25,
    borderRadius: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  buttonText: {
    fontSize: 18,
    fontWeight: '800',
  },
});
