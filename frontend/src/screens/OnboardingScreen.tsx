import React, { useContext } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as SecureStore from '../utils/storage';
import { SettingsContext } from '../context/SettingsContext';

import SafeLogo from '../components/SafeLogo';

export default function OnboardingScreen({ navigation }: any) {
  const { theme, logoUrl } = useContext(SettingsContext);
  const { width, height } = useWindowDimensions();

  const isSmallHeight = height < 750;
  const isCompactPhone = width < 380 || height < 700;
  const logoSize = isCompactPhone ? 140 : isSmallHeight ? 170 : Math.min(width * 0.5, 210);

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
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingTop: isSmallHeight ? 32 : 54,
              paddingBottom: isSmallHeight ? 28 : 44,
            },
          ]}
          bounces={false}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.logoContainer}>
            <SafeLogo 
              logoUrl={logoUrl} 
              style={{ width: logoSize, height: logoSize }} 
              resizeMode="contain"
            />
          </View>
          
          <View style={styles.textContainer}>
            <Text style={[styles.welcomeText, isCompactPhone && { fontSize: 24, marginBottom: 8 }]}>
              Welcome to FixMart
            </Text>
            <Text style={[styles.subtitleText, isCompactPhone && { fontSize: 16, lineHeight: 22 }]}>
              Buy, sell and book a service
            </Text>
          </View>

          <TouchableOpacity
            style={[
              styles.button,
              { width: Math.min(width * 0.85, 340), paddingVertical: isSmallHeight ? 15 : 18 },
            ]}
            onPress={handleGetStarted}
            activeOpacity={0.8}
          >
            <Text style={[styles.buttonText, { color: theme.primary }]}>Get Started</Text>
          </TouchableOpacity>
        </ScrollView>
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
  },
  scrollContent: {
    flexGrow: 1,
    width: '100%',
    paddingHorizontal: 24,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  logoContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 12,
  },
  textContainer: {
    alignItems: 'center',
    paddingHorizontal: 20,
    marginVertical: 16,
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
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
    marginTop: 12,
  },
  buttonText: {
    fontSize: 18,
    fontWeight: '800',
  },
});

