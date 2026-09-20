import React, { useState, useContext } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  ActivityIndicator,
  useWindowDimensions,
  Modal,
  FlatList,
  Image,
  Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import apiClient, { getImageUri } from '../api/client';
import { AuthContext } from '../context/AuthContext';
import { SettingsContext } from '../context/SettingsContext';
import { useCurrency } from '../context/CurrencyContext';
import AddressInput from '../components/AddressInput';

export default function SignupScreen({ route, navigation }: any) {
  const { width } = useWindowDimensions();
  const isLargeScreen = width >= 768;
  const { login } = useContext(AuthContext);
  const { theme } = useContext(SettingsContext);

  const redirectTo: string | undefined = route?.params?.redirectTo;
  const redirectParams: any = route?.params?.redirectParams;
  const TAB_SCREENS = ['HomeTab', 'CartTab', 'NotificationsTab', 'ProfileTab'];

  // Current Step: 1 = Essentials, 2 = Business / Service Details (Partners only)
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Step 1: Account setup
  const [role, setRole] = useState<'CUSTOMER' | 'HANDYMAN' | 'VENDOR' | 'RIDER'>(
    route?.params?.role || route?.params?.initialRole || 'CUSTOMER'
  );
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Country & Currency
  const { activeCountry, setCountry, countries } = useCurrency();
  const [selectedCountry, setSelectedCountry] = useState(activeCountry);
  const [showCountryPicker, setShowCountryPicker] = useState(false);

  // Step 2: Professional Details (Handyman/Vendor/Rider)
  const [specialty, setSpecialty] = useState('Plumbing');
  const [address, setAddress] = useState('');
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [vehicleType, setVehicleType] = useState('MOTORCYCLE');
  const [licensePlate, setLicensePlate] = useState('');

  // Identity document (BVN or NIN)
  const [identityType, setIdentityType] = useState<'BVN' | 'NIN'>('BVN');
  const [identityNumber, setIdentityNumber] = useState('');

  // Photos for Handyman / Rider / Vendor
  const [passportPhoto, setPassportPhoto] = useState<string | null>(null);
  const [actionPhoto, setActionPhoto] = useState<string | null>(null);
  const [uploadingPassport, setUploadingPassport] = useState(false);
  const [uploadingAction, setUploadingAction] = useState(false);

  const specialties = [
    'Plumbing',
    'Electrical',
    'Carpentry',
    'Painting',
    'Appliance Repair',
    'AC / HVAC',
    'Cleaning',
    'Masonry & Tiling',
    'General Repairs',
  ];

  const vehicleOptions = [
    { type: 'MOTORCYCLE', label: 'Motorcycle', icon: '🏍️' },
    { type: 'BICYCLE', label: 'Bicycle', icon: '🚲' },
    { type: 'CAR', label: 'Car', icon: '🚗' },
    { type: 'VAN', label: 'Van / Truck', icon: '🚚' },
  ];

  const BRAND_GREEN = '#03B576';

  // Navigate user after successful registration and login
  const handlePostAuthNavigation = () => {
    if (redirectTo) {
      if (TAB_SCREENS.includes(redirectTo)) {
        navigation.navigate('Main', { screen: redirectTo, params: redirectParams });
      } else {
        navigation.navigate(redirectTo, redirectParams || {});
      }
    } else {
      navigation.replace('Main');
    }
  };

  // Helper for duplicate user prompt
  const handleExistingAccountPrompt = (emailAddress: string) => {
    Alert.alert(
      'Account Already Exists',
      `An account with "${emailAddress}" is already registered. Would you like to log in instead?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log In',
          onPress: () => navigation.navigate('Login', { initialEmail: emailAddress, redirectTo, redirectParams }),
        },
      ]
    );
  };

  // Upload helper for passport and action photos
  const handleUploadPhoto = async (target: 'passport' | 'action', source: 'camera' | 'gallery' | 'file') => {
    try {
      if (Platform.OS === 'web' && source === 'file') {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = async (e: any) => {
          const file = e.target?.files?.[0];
          if (!file) return;
          if (file.size > 10 * 1024 * 1024) {
            Alert.alert('File too large', 'Please choose an image smaller than 10MB.');
            return;
          }
          await uploadImageFile(target, file);
        };
        input.click();
        return;
      }

      if (source === 'camera') {
        if (Platform.OS !== 'web') {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== 'granted') {
            Alert.alert('Permission Required', 'Please grant camera access to capture a photo.');
            return;
          }
        }
        const result = await ImagePicker.launchCameraAsync({
          allowsEditing: true,
          quality: 0.8,
          aspect: target === 'passport' ? [1, 1] : [4, 3],
        });
        if (!result.canceled && result.assets?.[0]) {
          await uploadAsset(target, result.assets[0]);
        }
      } else {
        if (Platform.OS !== 'web') {
          const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (status !== 'granted') {
            Alert.alert('Permission Required', 'Please grant photo library access.');
            return;
          }
        }
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          quality: 0.8,
          aspect: target === 'passport' ? [1, 1] : [4, 3],
        });
        if (!result.canceled && result.assets?.[0]) {
          await uploadAsset(target, result.assets[0]);
        }
      }
    } catch (err: any) {
      console.error('Photo select error:', err);
      Alert.alert('Error', 'Could not access photo.');
    }
  };

  const uploadAsset = async (target: 'passport' | 'action', asset: ImagePicker.ImagePickerAsset) => {
    if (target === 'passport') setUploadingPassport(true);
    else setUploadingAction(true);

    try {
      const formData = new FormData();
      if (Platform.OS === 'web') {
        const blobResponse = await fetch(asset.uri);
        const blob = await blobResponse.blob();
        const filename = `${target}_${Date.now()}.${blob.type.split('/')[1] || 'jpg'}`;
        formData.append('image', blob, filename);
      } else {
        const filename = asset.uri.split('/').pop() || `${target}.jpg`;
        const ext = filename.split('.').pop()?.toLowerCase() || 'jpg';
        const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';
        formData.append('image', {
          uri: asset.uri,
          name: filename,
          type: mimeType,
        } as any);
      }

      const res = await apiClient.post('/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 30000,
      });

      if (res.data?.success && res.data.imageUrl) {
        if (target === 'passport') {
          setPassportPhoto(res.data.imageUrl);
        } else {
          setActionPhoto(res.data.imageUrl);
        }
        Alert.alert(
          'Photo Uploaded',
          `${target === 'passport' ? 'Passport photograph' : 'Action picture'} uploaded successfully!`
        );
      }
    } catch (uploadErr: any) {
      console.error('Upload failed:', uploadErr);
      Alert.alert('Upload Failed', uploadErr.response?.data?.error || 'Could not upload image. Please try again.');
    } finally {
      if (target === 'passport') setUploadingPassport(false);
      else setUploadingAction(false);
    }
  };

  const uploadImageFile = async (target: 'passport' | 'action', file: File) => {
    if (target === 'passport') setUploadingPassport(true);
    else setUploadingAction(true);

    try {
      const formData = new FormData();
      formData.append('image', file, file.name);
      const res = await apiClient.post('/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 30000,
      });
      if (res.data?.success && res.data.imageUrl) {
        if (target === 'passport') {
          setPassportPhoto(res.data.imageUrl);
        } else {
          setActionPhoto(res.data.imageUrl);
        }
        Alert.alert(
          'Photo Uploaded',
          `${target === 'passport' ? 'Passport photograph' : 'Action picture'} uploaded successfully!`
        );
      }
    } catch (uploadErr: any) {
      console.error('Upload failed:', uploadErr);
      Alert.alert('Upload Failed', uploadErr.response?.data?.error || 'Could not upload image. Please try again.');
    } finally {
      if (target === 'passport') setUploadingPassport(false);
      else setUploadingAction(false);
    }
  };

  const showPhotoOptions = (target: 'passport' | 'action') => {
    const title = target === 'passport' ? 'Passport Photograph' : 'Action Picture';
    if (Platform.OS === 'web') {
      handleUploadPhoto(target, 'file');
      return;
    }
    Alert.alert(
      title,
      target === 'passport'
        ? 'Please provide a clear front-facing portrait photo.'
        : 'Please provide a photo of you performing work or with your vehicle.',
      [
        { text: '📸 Take Photo', onPress: () => handleUploadPhoto(target, 'camera') },
        { text: '🖼️ Choose from Gallery', onPress: () => handleUploadPhoto(target, 'gallery') },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  // Validate Step 1 Inputs
  const validateStep1 = (): boolean => {
    if (!name.trim()) {
      Alert.alert('Name Required', 'Please enter your full name.');
      return false;
    }
    if (!phone.trim() || phone.trim().length < 8) {
      Alert.alert('Phone Required', 'Please enter a valid mobile phone number for order updates and communication.');
      return false;
    }
    const cleanEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!cleanEmail || !emailRegex.test(cleanEmail)) {
      Alert.alert('Valid Email Required', 'Please enter a valid email address.');
      return false;
    }
    if (!password || password.length < 6) {
      Alert.alert('Password Too Short', 'Password must be at least 6 characters long.');
      return false;
    }
    if (password !== confirmPassword) {
      Alert.alert('Passwords Do Not Match', 'Please ensure both password fields match.');
      return false;
    }
    return true;
  };

  // Step 1 Submission: Customers register immediately; Partners advance to Step 2
  const handleStep1Submit = async () => {
    if (!validateStep1()) return;

    if (role === 'CUSTOMER') {
      setLoading(true);
      const cleanEmail = email.trim().toLowerCase();
      try {
        const response = await apiClient.post('/auth/register', {
          name: name.trim(),
          email: cleanEmail,
          phone: phone.trim(),
          password,
          role: 'CUSTOMER',
          country: selectedCountry.country,
          currency: selectedCountry.currency,
        });

        await setCountry(selectedCountry.country);
        await login(response.data.token, response.data.user);
        handlePostAuthNavigation();
      } catch (error: any) {
        const errorMsg = error.response?.data?.error || 'Could not complete registration.';
        if (errorMsg.toLowerCase().includes('already exists')) {
          handleExistingAccountPrompt(cleanEmail);
        } else {
          Alert.alert('Registration Error', errorMsg);
        }
      } finally {
        setLoading(false);
      }
      return;
    }

    // Handyman, Vendor, Rider advance to Step 2 for business details
    setCurrentStep(2);
  };

  // Step 2 Submission: Atomic registration for Partners
  const handlePartnerSubmit = async () => {
    if (!address.trim()) {
      Alert.alert('Address Required', 'Please provide your workshop, store, or base operating address.');
      return;
    }
    if (role === 'RIDER' && !licensePlate.trim()) {
      Alert.alert('License Plate Required', 'Please enter your delivery vehicle license plate number.');
      return;
    }
    if (identityNumber.trim() && identityNumber.trim().length !== 11) {
      Alert.alert('Invalid ID', `${identityType} must be exactly 11 digits.`);
      return;
    }

    setLoading(true);
    const cleanEmail = email.trim().toLowerCase();
    const finalLat = latitude !== null ? latitude : 4.8156 + (Math.random() - 0.5) * 0.02;
    const finalLng = longitude !== null ? longitude : 7.0498 + (Math.random() - 0.5) * 0.02;

    try {
      const response = await apiClient.post('/auth/register', {
        name: name.trim(),
        email: cleanEmail,
        phone: phone.trim(),
        opayPhone: phone.trim(),
        password,
        role,
        country: selectedCountry.country,
        currency: selectedCountry.currency,
        specialty: role === 'HANDYMAN' ? specialty : null,
        address: address.trim(),
        latitude: finalLat,
        longitude: finalLng,
        vehicleType: role === 'RIDER' ? vehicleType : null,
        licensePlate: role === 'RIDER' ? licensePlate.trim() : null,
        passportPhoto: passportPhoto || null,
        actionPhoto: actionPhoto || null,
        identityNumber: identityNumber.trim() || null,
      });

      await setCountry(selectedCountry.country);
      await login(response.data.token, response.data.user);

      const isPending = response.data.user?.verificationStatus === 'PENDING_REVIEW';
      const roleTitle =
        role === 'HANDYMAN' ? 'Services Pro' : role === 'RIDER' ? 'Courier Rider' : 'Store Vendor';

      Alert.alert(
        '🎉 Registration Successful',
        isPending
          ? `Welcome, ${name.trim()}! Your ${roleTitle} account has been created and submitted for Admin verification. You can now explore the app and track your verification status.`
          : `Welcome, ${name.trim()}! Your ${roleTitle} account is active and ready to use.`,
        [
          {
            text: 'Get Started',
            onPress: handlePostAuthNavigation,
          },
        ]
      );
    } catch (error: any) {
      const errorMsg = error.response?.data?.error || 'Could not complete registration.';
      if (errorMsg.toLowerCase().includes('already exists')) {
        handleExistingAccountPrompt(cleanEmail);
      } else {
        Alert.alert('Registration Error', errorMsg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={[styles.contentContainer, isLargeScreen && styles.contentContainerWeb]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <View style={[styles.card, { borderColor: theme.border }, isLargeScreen && styles.cardWeb]}>
        {/* Header Section */}
        <Text style={[styles.title, { color: theme.text }]}>Create Account</Text>
        <Text style={styles.subtitle}>
          {role === 'CUSTOMER'
            ? 'Join FixMart in seconds to order services, buy products & dispatch riders'
            : currentStep === 1
            ? 'Partner Onboarding (Step 1 of 2: Account Details)'
            : 'Partner Onboarding (Step 2 of 2: Service & Work Info)'}
        </Text>

        {/* Progress Bar for Partners */}
        {role !== 'CUSTOMER' && (
          <View style={styles.progressContainer}>
            <View style={styles.stepPillWrapper}>
              <View
                style={[
                  styles.stepBadge,
                  { backgroundColor: BRAND_GREEN, borderColor: BRAND_GREEN },
                ]}
              >
                <Text style={styles.stepBadgeText}>1</Text>
              </View>
              <Text style={[styles.stepBadgeLabel, { color: BRAND_GREEN, fontWeight: '700' }]}>
                Account
              </Text>
            </View>

            <View
              style={[
                styles.stepProgressLine,
                { backgroundColor: currentStep === 2 ? BRAND_GREEN : '#E5E5EA' },
              ]}
            />

            <View style={styles.stepPillWrapper}>
              <View
                style={[
                  styles.stepBadge,
                  {
                    backgroundColor: currentStep === 2 ? BRAND_GREEN : '#F2F2F7',
                    borderColor: currentStep === 2 ? BRAND_GREEN : '#E5E5EA',
                  },
                ]}
              >
                <Text
                  style={[
                    styles.stepBadgeText,
                    { color: currentStep === 2 ? '#FFF' : '#8E8E93' },
                  ]}
                >
                  2
                </Text>
              </View>
              <Text
                style={[
                  styles.stepBadgeLabel,
                  { color: currentStep === 2 ? BRAND_GREEN : '#8E8E93' },
                ]}
              >
                Business
              </Text>
            </View>
          </View>
        )}

        {/* ── STEP 1: Account Essentials (All roles) ── */}
        {currentStep === 1 && (
          <View>
            <Text style={[styles.fieldLabel, { color: theme.text }]}>I want to join as</Text>
            <View style={styles.roleGrid}>
              <TouchableOpacity
                style={[
                  styles.roleCard,
                  role === 'CUSTOMER' && {
                    borderColor: theme.primary,
                    backgroundColor: theme.primary + '10',
                  },
                ]}
                onPress={() => setRole('CUSTOMER')}
                activeOpacity={0.8}
              >
                <Text style={styles.roleCardIcon}>🛒</Text>
                <Text
                  style={[
                    styles.roleCardTitle,
                    role === 'CUSTOMER' && { color: theme.primary, fontWeight: '700' },
                  ]}
                >
                  Customer
                </Text>
                <Text style={styles.roleCardSub}>Shop & Hire</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.roleCard,
                  role === 'HANDYMAN' && {
                    borderColor: BRAND_GREEN,
                    backgroundColor: BRAND_GREEN + '10',
                  },
                ]}
                onPress={() => setRole('HANDYMAN')}
                activeOpacity={0.8}
              >
                <Text style={styles.roleCardIcon}>🔧</Text>
                <Text
                  style={[
                    styles.roleCardTitle,
                    role === 'HANDYMAN' && { color: BRAND_GREEN, fontWeight: '700' },
                  ]}
                >
                  Services
                </Text>
                <Text style={styles.roleCardSub}>Artisan / Tech</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.roleCard,
                  role === 'VENDOR' && {
                    borderColor: BRAND_GREEN,
                    backgroundColor: BRAND_GREEN + '10',
                  },
                ]}
                onPress={() => setRole('VENDOR')}
                activeOpacity={0.8}
              >
                <Text style={styles.roleCardIcon}>🏪</Text>
                <Text
                  style={[
                    styles.roleCardTitle,
                    role === 'VENDOR' && { color: BRAND_GREEN, fontWeight: '700' },
                  ]}
                >
                  Vendor
                </Text>
                <Text style={styles.roleCardSub}>Sell Products</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.roleCard,
                  role === 'RIDER' && {
                    borderColor: BRAND_GREEN,
                    backgroundColor: BRAND_GREEN + '10',
                  },
                ]}
                onPress={() => setRole('RIDER')}
                activeOpacity={0.8}
              >
                <Text style={styles.roleCardIcon}>🏍️</Text>
                <Text
                  style={[
                    styles.roleCardTitle,
                    role === 'RIDER' && { color: BRAND_GREEN, fontWeight: '700' },
                  ]}
                >
                  Rider
                </Text>
                <Text style={styles.roleCardSub}>Courier</Text>
              </TouchableOpacity>
            </View>

            {/* Informative Banner for Partners */}
            {role !== 'CUSTOMER' && (
              <View style={styles.infoBanner}>
                <Text style={styles.infoBannerIcon}>💡</Text>
                <Text style={styles.infoBannerText}>
                  {role === 'HANDYMAN'
                    ? 'FixMart connects you with local service jobs. In Step 2 you will specify your specialty trade and work base.'
                    : role === 'RIDER'
                    ? 'FixMart dispatches package delivery orders to your phone. In Step 2 you will specify your vehicle details.'
                    : 'FixMart allows you to list inventory and reach thousands of buyers. In Step 2 you will set up your store address.'}
                </Text>
              </View>
            )}

            {/* Full Name */}
            <Text style={[styles.fieldLabel, { color: theme.text }]}>Full Name</Text>
            <TextInput
              style={[styles.input, { borderColor: theme.border, color: theme.text }]}
              placeholder="e.g. Johnathan Doe"
              value={name}
              onChangeText={setName}
              placeholderTextColor="#8E8E93"
              autoCapitalize="words"
            />

            {/* Phone Number */}
            <Text style={[styles.fieldLabel, { color: theme.text }]}>
              Phone Number <Text style={styles.fieldNote}>(Calls & WhatsApp)</Text>
            </Text>
            <TextInput
              style={[styles.input, { borderColor: theme.border, color: theme.text }]}
              placeholder="e.g. 08012345678"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              placeholderTextColor="#8E8E93"
            />

            {/* Email Address */}
            <Text style={[styles.fieldLabel, { color: theme.text }]}>Email Address</Text>
            <TextInput
              style={[styles.input, { borderColor: theme.border, color: theme.text }]}
              placeholder="e.g. john@example.com"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholderTextColor="#8E8E93"
            />

            {/* Password */}
            <Text style={[styles.fieldLabel, { color: theme.text }]}>Password</Text>
            <View style={[styles.passwordWrapper, { borderColor: theme.border }]}>
              <TextInput
                style={[styles.passwordInput, { color: theme.text }]}
                placeholder="At least 6 characters"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                placeholderTextColor="#8E8E93"
              />
              <TouchableOpacity
                style={styles.eyeToggleBtn}
                onPress={() => setShowPassword(!showPassword)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.eyeToggleText}>{showPassword ? 'Hide' : 'Show'}</Text>
              </TouchableOpacity>
            </View>

            {/* Confirm Password */}
            <Text style={[styles.fieldLabel, { color: theme.text }]}>Confirm Password</Text>
            <View
              style={[
                styles.passwordWrapper,
                { borderColor: theme.border },
                confirmPassword.length > 0 &&
                  password !== confirmPassword && { borderColor: '#FF3B30' },
              ]}
            >
              <TextInput
                style={[styles.passwordInput, { color: theme.text }]}
                placeholder="Re-enter your password"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showConfirmPassword}
                placeholderTextColor="#8E8E93"
              />
              <TouchableOpacity
                style={styles.eyeToggleBtn}
                onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.eyeToggleText}>{showConfirmPassword ? 'Hide' : 'Show'}</Text>
              </TouchableOpacity>
            </View>
            {confirmPassword.length > 0 && password !== confirmPassword && (
              <Text style={styles.errorHelperText}>Passwords do not match</Text>
            )}

            {/* Country of Residence */}
            <Text style={[styles.fieldLabel, { color: theme.text }]}>Country of Residence</Text>
            <TouchableOpacity
              style={[styles.countryPickerBtn, { borderColor: theme.border }]}
              onPress={() => setShowCountryPicker(true)}
              activeOpacity={0.8}
            >
              <Text style={{ fontSize: 22 }}>{selectedCountry.flag}</Text>
              <Text style={[styles.countryPickerLabel, { color: theme.text }]}>
                {selectedCountry.country}
              </Text>
              <Text style={[styles.countryPickerCurrency, { color: theme.primary }]}>
                {selectedCountry.currency} ({selectedCountry.symbol})
              </Text>
              <Text style={{ color: '#8E8E93', marginLeft: 'auto', fontSize: 18 }}>›</Text>
            </TouchableOpacity>

            {/* Step 1 Action Button */}
            <TouchableOpacity
              style={[
                styles.primaryButton,
                { backgroundColor: role === 'CUSTOMER' ? theme.primary : BRAND_GREEN },
              ]}
              onPress={handleStep1Submit}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryButtonText}>
                  {role === 'CUSTOMER' ? 'Create Customer Account' : 'Continue to Service Details →'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* ── STEP 2: Professional & Business Details (Partners only) ── */}
        {currentStep === 2 && role !== 'CUSTOMER' && (
          <View>
            {/* Back Button to Step 1 */}
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => setCurrentStep(1)}
              activeOpacity={0.7}
            >
              <Text style={[styles.backButtonText, { color: theme.primary }]}>
                ← Back to Account Details
              </Text>
            </TouchableOpacity>

            {/* Handyman Specialty Selector */}
            {role === 'HANDYMAN' && (
              <View style={styles.fieldSection}>
                <Text style={[styles.fieldLabel, { color: theme.text }]}>Primary Trade / Specialty</Text>
                <View style={styles.specialtyWrap}>
                  {specialties.map((spec) => {
                    const isActive = specialty === spec;
                    return (
                      <TouchableOpacity
                        key={spec}
                        style={[
                          styles.specialtyPill,
                          isActive && { backgroundColor: BRAND_GREEN, borderColor: BRAND_GREEN },
                        ]}
                        onPress={() => setSpecialty(spec)}
                        activeOpacity={0.8}
                      >
                        <Text style={[styles.specialtyText, isActive && { color: '#FFF' }]}>
                          {spec}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Rider Vehicle Type & License Plate */}
            {role === 'RIDER' && (
              <View style={styles.fieldSection}>
                <Text style={[styles.fieldLabel, { color: theme.text }]}>Delivery Vehicle</Text>
                <View style={styles.vehicleGrid}>
                  {vehicleOptions.map((v) => {
                    const isActive = vehicleType === v.type;
                    return (
                      <TouchableOpacity
                        key={v.type}
                        style={[
                          styles.vehicleCard,
                          isActive && {
                            borderColor: BRAND_GREEN,
                            backgroundColor: BRAND_GREEN + '12',
                          },
                        ]}
                        onPress={() => setVehicleType(v.type)}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.vehicleIcon}>{v.icon}</Text>
                        <Text
                          style={[
                            styles.vehicleLabel,
                            isActive && { color: BRAND_GREEN, fontWeight: '700' },
                          ]}
                        >
                          {v.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <Text style={[styles.fieldLabel, { color: theme.text, marginTop: 12 }]}>
                  License Plate Number
                </Text>
                <TextInput
                  style={[styles.input, { borderColor: theme.border, color: theme.text }]}
                  placeholder="e.g. ABC-123-XY"
                  value={licensePlate}
                  onChangeText={setLicensePlate}
                  autoCapitalize="characters"
                  placeholderTextColor="#8E8E93"
                />
              </View>
            )}

            {/* Address with Geocoding */}
            <View style={styles.fieldSection}>
              <AddressInput
                label={
                  role === 'VENDOR'
                    ? 'Store / Business Location'
                    : role === 'RIDER'
                    ? 'Operating Station / Base Address'
                    : 'Workshop / Operating Address'
                }
                onAddressChange={(assembledAddress, lat, lng) => {
                  setAddress(assembledAddress);
                  setLatitude(lat);
                  setLongitude(lng);
                }}
                initialValue={address}
                countryCode="ng"
              />
            </View>

            {/* Optional Identity Verification */}
            <View style={styles.fieldSection}>
              <Text style={[styles.fieldLabel, { color: theme.text }]}>
                Identity Verification <Text style={styles.fieldOptional}>(Recommended)</Text>
              </Text>
              <Text style={styles.fieldHint}>
                Providing your BVN or NIN speeds up Admin verification and enables instant payouts.
              </Text>
              <View style={styles.identityToggleRow}>
                <TouchableOpacity
                  style={[
                    styles.idToggleBtn,
                    identityType === 'BVN' && {
                      backgroundColor: BRAND_GREEN,
                      borderColor: BRAND_GREEN,
                    },
                  ]}
                  onPress={() => setIdentityType('BVN')}
                >
                  <Text
                    style={[
                      styles.idToggleBtnText,
                      identityType === 'BVN' && { color: '#FFF' },
                    ]}
                  >
                    BVN (11 digits)
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.idToggleBtn,
                    identityType === 'NIN' && {
                      backgroundColor: BRAND_GREEN,
                      borderColor: BRAND_GREEN,
                    },
                  ]}
                  onPress={() => setIdentityType('NIN')}
                >
                  <Text
                    style={[
                      styles.idToggleBtnText,
                      identityType === 'NIN' && { color: '#FFF' },
                    ]}
                  >
                    NIN (11 digits)
                  </Text>
                </TouchableOpacity>
              </View>

              <TextInput
                style={[styles.input, { borderColor: theme.border, color: theme.text }]}
                placeholder={`Enter 11-digit ${identityType} (Optional)`}
                value={identityNumber}
                onChangeText={setIdentityNumber}
                keyboardType="numeric"
                maxLength={11}
                placeholderTextColor="#8E8E93"
              />
            </View>

            {/* Verification Photos */}
            <View style={styles.fieldSection}>
              <Text style={[styles.fieldLabel, { color: theme.text }]}>
                Profile & Work Photos <Text style={styles.fieldOptional}>(Recommended)</Text>
              </Text>
              <Text style={styles.fieldHint}>
                Upload clear photos to build trust with FixMart clients and pass Admin review.
              </Text>

              {/* Passport Photo */}
              <View style={styles.photoRow}>
                <View style={styles.photoInfo}>
                  <Text style={styles.photoTitle}>1. Portrait / Passport Photo</Text>
                  <Text style={styles.photoSub}>Clear portrait photo of your face</Text>
                </View>

                {passportPhoto ? (
                  <View style={styles.photoThumbContainer}>
                    <Image
                      source={{ uri: getImageUri(passportPhoto) ?? undefined }}
                      style={styles.photoThumb}
                    />
                    <TouchableOpacity
                      style={styles.photoActionBadge}
                      onPress={() => setPassportPhoto(null)}
                    >
                      <Text style={styles.photoActionBadgeText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[styles.photoUploadBtn, { borderColor: BRAND_GREEN }]}
                    onPress={() => showPhotoOptions('passport')}
                    disabled={uploadingPassport}
                  >
                    {uploadingPassport ? (
                      <ActivityIndicator size="small" color={BRAND_GREEN} />
                    ) : (
                      <Text style={[styles.photoUploadBtnText, { color: BRAND_GREEN }]}>
                        📸 Upload
                      </Text>
                    )}
                  </TouchableOpacity>
                )}
              </View>

              {/* Action Picture */}
              <View style={styles.photoRow}>
                <View style={styles.photoInfo}>
                  <Text style={styles.photoTitle}>
                    {role === 'HANDYMAN'
                      ? '2. Action Picture (With Tools)'
                      : role === 'RIDER'
                      ? '2. Vehicle / Delivery Gear'
                      : '2. Store Front / Products'}
                  </Text>
                  <Text style={styles.photoSub}>
                    {role === 'HANDYMAN'
                      ? 'Photo of you on the job or with your equipment'
                      : role === 'RIDER'
                      ? 'Photo of you with your delivery vehicle'
                      : 'Photo of your physical store or stock'}
                  </Text>
                </View>

                {actionPhoto ? (
                  <View style={styles.photoThumbContainer}>
                    <Image
                      source={{ uri: getImageUri(actionPhoto) ?? undefined }}
                      style={styles.photoThumb}
                    />
                    <TouchableOpacity
                      style={styles.photoActionBadge}
                      onPress={() => setActionPhoto(null)}
                    >
                      <Text style={styles.photoActionBadgeText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[styles.photoUploadBtn, { borderColor: BRAND_GREEN }]}
                    onPress={() => showPhotoOptions('action')}
                    disabled={uploadingAction}
                  >
                    {uploadingAction ? (
                      <ActivityIndicator size="small" color={BRAND_GREEN} />
                    ) : (
                      <Text style={[styles.photoUploadBtnText, { color: BRAND_GREEN }]}>
                        📸 Upload
                      </Text>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Step 2 Action Button: Final atomic submit */}
            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: BRAND_GREEN, marginTop: 16 }]}
              onPress={handlePartnerSubmit}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryButtonText}>Complete Registration & Get Started</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Country Picker Modal */}
        <Modal
          visible={showCountryPicker}
          transparent
          animationType="slide"
          onRequestClose={() => setShowCountryPicker(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalSheet, { backgroundColor: theme.card || '#FFF' }]}>
              <View style={styles.modalHeaderRow}>
                <Text style={[styles.modalSheetTitle, { color: theme.text }]}>Select Country</Text>
                <TouchableOpacity onPress={() => setShowCountryPicker(false)}>
                  <Text style={{ color: theme.primary, fontWeight: '700', fontSize: 15 }}>Done</Text>
                </TouchableOpacity>
              </View>
              <FlatList
                data={countries}
                keyExtractor={(c) => c.currency}
                renderItem={({ item }) => {
                  const isActive = item.currency === selectedCountry.currency;
                  return (
                    <TouchableOpacity
                      style={[
                        styles.countryModalRow,
                        { borderBottomColor: theme.border },
                        isActive && { backgroundColor: theme.primary + '12' },
                      ]}
                      onPress={() => {
                        setSelectedCountry(item);
                        setShowCountryPicker(false);
                      }}
                    >
                      <Text style={{ fontSize: 22 }}>{item.flag}</Text>
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={{ fontSize: 14, fontWeight: '600', color: theme.text }}>
                          {item.country}
                        </Text>
                        <Text style={{ fontSize: 12, color: '#8E8E93' }}>
                          {item.currency} · {item.symbol}
                        </Text>
                      </View>
                      {isActive && <Text style={{ color: theme.primary, fontWeight: '800' }}>✓</Text>}
                    </TouchableOpacity>
                  );
                }}
              />
            </View>
          </View>
        </Modal>

        {/* Footer Navigation Links */}
        <TouchableOpacity
          onPress={() =>
            navigation.navigate('Login', {
              initialEmail: email.trim().toLowerCase(),
              redirectTo,
              redirectParams,
            })
          }
          style={styles.linkContainer}
        >
          <Text style={styles.linkText}>
            Already have an account?{' '}
            <Text style={[styles.linkHighlight, { color: theme.primary }]}>Log In</Text>
          </Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.navigate('Main')} style={styles.cancelLinkContainer}>
          <Text style={[styles.cancelLinkText, { color: theme.lightText }]}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 18,
    justifyContent: 'center',
    flexGrow: 1,
  },
  contentContainerWeb: {
    alignItems: 'center',
    minHeight: '100%',
  },
  cardWeb: {
    maxWidth: 460,
    width: '100%',
  },
  card: {
    backgroundColor: '#FFFFFF',
    padding: 22,
    borderRadius: 22,
    shadowColor: '#171717',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 3,
    borderWidth: 1,
    marginVertical: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 4,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13,
    color: '#8E8E93',
    textAlign: 'center',
    marginBottom: 18,
    lineHeight: 18,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    paddingHorizontal: 20,
  },
  stepPillWrapper: {
    alignItems: 'center',
  },
  stepBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
  },
  stepBadgeText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '800',
  },
  stepBadgeLabel: {
    fontSize: 11,
    marginTop: 4,
  },
  stepProgressLine: {
    flex: 1,
    height: 2,
    marginHorizontal: 12,
    marginBottom: 16,
  },
  roleGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
    gap: 6,
  },
  roleCard: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: '#E5E5EA',
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#FAFAFC',
  },
  roleCardIcon: {
    fontSize: 20,
    marginBottom: 4,
  },
  roleCardTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#3A3A3C',
  },
  roleCardSub: {
    fontSize: 9.5,
    color: '#8E8E93',
    marginTop: 2,
  },
  infoBanner: {
    flexDirection: 'row',
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#86EFAC',
    borderRadius: 12,
    padding: 10,
    marginBottom: 14,
    alignItems: 'center',
    gap: 8,
  },
  infoBannerIcon: {
    fontSize: 16,
  },
  infoBannerText: {
    fontSize: 12,
    color: '#166534',
    flex: 1,
    lineHeight: 16,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 6,
    marginTop: 6,
  },
  fieldNote: {
    fontSize: 11,
    color: '#8E8E93',
    fontWeight: '400',
  },
  fieldOptional: {
    fontSize: 11,
    color: '#8E8E93',
    fontWeight: '500',
  },
  fieldHint: {
    fontSize: 11.5,
    color: '#8E8E93',
    marginBottom: 8,
    lineHeight: 15,
  },
  fieldSection: {
    marginBottom: 14,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    marginBottom: 10,
    fontSize: 14,
    backgroundColor: '#F9F9FB',
  },
  passwordWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    marginBottom: 10,
    backgroundColor: '#F9F9FB',
  },
  passwordInput: {
    flex: 1,
    fontSize: 14,
    height: '100%',
  },
  eyeToggleBtn: {
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  eyeToggleText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#8E8E93',
  },
  errorHelperText: {
    fontSize: 11,
    color: '#FF3B30',
    marginTop: -6,
    marginBottom: 10,
    marginLeft: 4,
  },
  countryPickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 14,
    backgroundColor: '#F9F9FB',
  },
  countryPickerLabel: {
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  countryPickerCurrency: {
    fontSize: 12,
    fontWeight: '600',
  },
  primaryButton: {
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 2,
  },
  primaryButtonText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
  },
  backButton: {
    paddingVertical: 8,
    marginBottom: 12,
  },
  backButtonText: {
    fontSize: 13,
    fontWeight: '700',
  },
  specialtyWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 6,
  },
  specialtyPill: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: '#E5E5EA',
    backgroundColor: '#FFF',
  },
  specialtyText: {
    fontSize: 12,
    color: '#3A3A3C',
    fontWeight: '600',
  },
  vehicleGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 6,
  },
  vehicleCard: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#E5E5EA',
    borderRadius: 12,
    backgroundColor: '#FAFAFC',
  },
  vehicleIcon: {
    fontSize: 22,
    marginBottom: 2,
  },
  vehicleLabel: {
    fontSize: 11,
    color: '#3A3A3C',
    fontWeight: '600',
  },
  identityToggleRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  idToggleBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#E5E5EA',
    backgroundColor: '#FAFAFC',
  },
  idToggleBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#636366',
  },
  photoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F7',
    gap: 10,
  },
  photoInfo: {
    flex: 1,
  },
  photoTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  photoSub: {
    fontSize: 11,
    color: '#8E8E93',
    marginTop: 2,
    lineHeight: 14,
  },
  photoUploadBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 80,
  },
  photoUploadBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  photoThumbContainer: {
    position: 'relative',
  },
  photoThumb: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: '#E5E5EA',
  },
  photoActionBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#FF3B30',
    width: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoActionBadgeText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '800',
  },
  linkContainer: {
    alignItems: 'center',
    marginTop: 16,
  },
  linkText: {
    color: '#8E8E93',
    fontSize: 13,
  },
  linkHighlight: {
    fontWeight: '700',
  },
  cancelLinkContainer: {
    alignItems: 'center',
    marginTop: 12,
    paddingVertical: 4,
  },
  cancelLinkText: {
    fontSize: 13,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '72%',
    paddingBottom: 40,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  modalSheetTitle: {
    fontSize: 17,
    fontWeight: '800',
  },
  countryModalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
});
