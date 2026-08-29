import React, { useState, useContext, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  ActivityIndicator,
  Animated,
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
import { SUPPORTED_COUNTRIES } from '../utils/currency';
import AddressInput from '../components/AddressInput';


export default function SignupScreen({ route, navigation }: any) {
  const { width } = useWindowDimensions();
  const isLargeScreen = width >= 768;
  const { login, refreshUser } = useContext(AuthContext);
  const { theme } = useContext(SettingsContext);

  const redirectTo: string | undefined = route?.params?.redirectTo;
  const redirectParams: any = route?.params?.redirectParams;

  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Step 1: Account setup
  const [role, setRole] = useState(route?.params?.role || route?.params?.initialRole || 'CUSTOMER'); // CUSTOMER, HANDYMAN, VENDOR, RIDER
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isOpaySignup, setIsOpaySignup] = useState(false);
  const [opayPhone, setOpayPhone] = useState('');

  // Step 2: Professional Details (Handyman/Vendor/Rider)
  const [specialty, setSpecialty] = useState('Plumbing');
  const [address, setAddress] = useState('');
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [vehicleType, setVehicleType] = useState('MOTORCYCLE'); // BICYCLE, MOTORCYCLE, CAR
  const [licensePlate, setLicensePlate] = useState('');
  
  // Step 3: Identity Selection (BVN or NIN)
  const [identityType, setIdentityType] = useState<'BVN' | 'NIN'>('BVN');
  const [identityNumber, setIdentityNumber] = useState('');
  const [consent, setConsent] = useState(false);
  const [identityVerified, setIdentityVerified] = useState(false);
  const [identityName, setIdentityName] = useState('');

  // Country & Currency
  const { activeCountry, setCountry, countries } = useCurrency();
  const [selectedCountry, setSelectedCountry] = useState(activeCountry);
  const [showCountryPicker, setShowCountryPicker] = useState(false);

  // Step 4: Biometric Liveness Simulation
  const [livenessStage, setLivenessStage] = useState<'idle' | 'scanning' | 'blink' | 'smile' | 'processing' | 'done'>('idle');
  const [livenessInstruction, setLivenessInstruction] = useState('Align your face inside the circle.');
  const [livenessRef] = useState(`REF_LIVENESS_${Math.floor(Math.random() * 899999 + 100000)}`);
  const scanLineAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Step 5: Photos & Documents for Handyman / Rider / Vendor
  const [passportPhoto, setPassportPhoto] = useState<string | null>(null);
  const [actionPhoto, setActionPhoto] = useState<string | null>(null);
  const [uploadingPassport, setUploadingPassport] = useState(false);
  const [uploadingAction, setUploadingAction] = useState(false);
  const [uploadedDocName, setUploadedDocName] = useState<string | null>(null);

  const specialties = ['Plumbing', 'Electrical', 'General'];
  const TAB_SCREENS = ['HomeTab', 'CartTab', 'NotificationsTab', 'ProfileTab'];

  // OPay emerald green color branding
  const OPAY_GREEN = '#03B576';

  // Photo picker & upload helpers
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
            Alert.alert('Permission Required', 'Please grant camera access to take a photo.');
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
      Alert.alert('Error', 'Could not select photo.');
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
        Alert.alert('✅ Photo Uploaded', `${target === 'passport' ? 'Passport photograph' : 'Action picture'} uploaded successfully!`);
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
        Alert.alert('✅ Photo Uploaded', `${target === 'passport' ? 'Passport photograph' : 'Action picture'} uploaded successfully!`);
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
    const title = target === 'passport' ? 'Upload Passport Photograph' : 'Upload Action Picture';
    if (Platform.OS === 'web') {
      handleUploadPhoto(target, 'file');
      return;
    }
    Alert.alert(
      title,
      target === 'passport' ? 'Please provide a clear front-facing portrait photo.' : 'Please provide a photo of you performing work or with your vehicle.',
      [
        { text: '📸 Take Photo (Camera)', onPress: () => handleUploadPhoto(target, 'camera') },
        { text: '🖼️ Choose from Gallery', onPress: () => handleUploadPhoto(target, 'gallery') },
        { text: 'Cancel', style: 'cancel' }
      ]
    );
  };

  // Liveness animations
  useEffect(() => {
    let anim: Animated.CompositeAnimation | null = null;
    if (livenessStage === 'scanning' || livenessStage === 'blink' || livenessStage === 'smile') {
      anim = Animated.loop(
        Animated.sequence([
          Animated.timing(scanLineAnim, {
            toValue: 180,
            duration: 1800,
            useNativeDriver: true,
          }),
          Animated.timing(scanLineAnim, {
            toValue: 0,
            duration: 1800,
            useNativeDriver: true,
          }),
        ])
      );
      anim.start();
    } else {
      scanLineAnim.setValue(0);
    }
    return () => {
      if (anim) anim.stop();
    };
  }, [livenessStage]);

  useEffect(() => {
    let anim: Animated.CompositeAnimation | null = null;
    if (livenessStage === 'processing') {
      anim = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.12,
            duration: 700,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 700,
            useNativeDriver: true,
          }),
        ])
      );
      anim.start();
    } else {
      pulseAnim.setValue(1);
    }
    return () => {
      if (anim) anim.stop();
    };
  }, [livenessStage]);

  // Handle Standard customer signup or First-stage register for Handyman/Vendor
  const handleRegisterBasicAccount = async () => {
    if (!name.trim() || !email.trim() || !password.trim()) {
      Alert.alert('Missing Info', 'Please enter your name, email, and password.');
      return;
    }
    if (role !== 'CUSTOMER' && isOpaySignup && (!opayPhone.trim() || opayPhone.length < 10)) {
      Alert.alert('OPay Required', 'Please enter a valid OPay Wallet phone number.');
      return;
    }

    setLoading(true);

    let latitude = null;
    let longitude = null;
    if (address.trim()) {
      latitude = 40.7128 + (Math.random() - 0.5) * 0.02;
      longitude = -74.0060 + (Math.random() - 0.5) * 0.02;
    }

    try {
      // For CUSTOMER, register immediately and log in
      if (role === 'CUSTOMER') {
        const response = await apiClient.post('/auth/register', {
          name,
          email,
          password,
          role,
          country: selectedCountry.country,
          currency: selectedCountry.currency,
        });
        await setCountry(selectedCountry.country);
        await login(response.data.token, response.data.user);
        
        if (redirectTo) {
          if (TAB_SCREENS.includes(redirectTo)) {
            navigation.navigate('Main', { screen: redirectTo });
          } else {
            navigation.navigate(redirectTo, redirectParams || {});
          }
        } else {
          navigation.replace('Main');
        }
        return;
      }

      // For Handyman/Vendor, proceed to Professional Info
      setCurrentStep(2);
    } catch (error: any) {
      console.error(error);
      Alert.alert('Registration Failed', error.response?.data?.error || 'Could not initiate registration.');
    } finally {
      setLoading(false);
    }
  };

  // Perform background register for Handyman/Vendor/Rider, acquiring the JWT token
  const handleVerifyProfessionAndRegister = async () => {
    if (!address.trim()) {
      Alert.alert('Address Required', 'Please enter your work/store address.');
      return;
    }
    if (role === 'RIDER' && !licensePlate.trim()) {
      Alert.alert('License Plate Required', 'Please enter your license plate number.');
      return;
    }

    setLoading(true);

    // Use geocoded coordinates if available, otherwise default to Port Harcourt area coordinates
    const finalLat = latitude !== null ? latitude : 4.8156 + (Math.random() - 0.5) * 0.02;
    const finalLng = longitude !== null ? longitude : 7.0498 + (Math.random() - 0.5) * 0.02;

    try {
      // Register the account first to get JWT token
      const response = await apiClient.post('/auth/register', {
        name,
        email,
        password,
        role,
        phone: isOpaySignup ? opayPhone : null,
        opayPhone: isOpaySignup ? opayPhone : null,
        specialty: role === 'HANDYMAN' ? specialty : null,
        address,
        latitude: finalLat,
        longitude: finalLng,
        vehicleType: role === 'RIDER' ? vehicleType : null,
        licensePlate: role === 'RIDER' ? licensePlate : null,
        passportPhoto: passportPhoto || null,
        actionPhoto: actionPhoto || null,
        country: selectedCountry.country,
        currency: selectedCountry.currency,
      });

      // Login the user to secure local auth header defaults
      await login(response.data.token, response.data.user);

      // Successfully registered basic account, proceed to KYC flow
      setCurrentStep(3);
    } catch (error: any) {
      console.error(error);
      Alert.alert('Setup Failed', error.response?.data?.error || 'Could not complete registration details.');
    } finally {
      setLoading(false);
    }
  };

  // Real-time Dojah BVN/NIN verification during signup
  const handleVerifyIdentity = async () => {
    if (identityType === 'BVN' && !consent) {
      Alert.alert('Consent Required', 'You must consent to verify your BVN details.');
      return;
    }
    if (identityNumber.length !== 11 || !/^\d+$/.test(identityNumber)) {
      Alert.alert('Invalid Number', `${identityType} must be exactly 11 digits.`);
      return;
    }

    setLoading(true);
    try {
      if (identityType === 'BVN') {
        const res = await apiClient.post('/kyc/bvn', { bvn: identityNumber, consent });
        if (res.data.success) {
          setIdentityVerified(true);
          setIdentityName(res.data.data.formatted_name);
          Alert.alert('BVN Verified', `Verified as ${res.data.data.formatted_name}. Proceed to liveness check.`);
        }
      } else {
        const res = await apiClient.post('/kyc/nin', { nin: identityNumber });
        if (res.data.success) {
          setIdentityVerified(true);
          setIdentityName(name); // default to input name for NIN mock
          Alert.alert('NIN Verified', 'NIN verified successfully. Proceed to liveness check.');
        }
      }
    } catch (err: any) {
      Alert.alert('Verification Failed', err.response?.data?.error || `Could not verify ${identityType}.`);
    } finally {
      setLoading(false);
    }
  };

  // Liveness check simulator
  const startLivenessScan = () => {
    setLivenessStage('scanning');
    setLivenessInstruction('Align your face inside the circle.');

    setTimeout(() => {
      setLivenessStage('blink');
      setLivenessInstruction('Blink your eyes twice slowly.');

      setTimeout(() => {
        setLivenessStage('smile');
        setLivenessInstruction('Smile widely for the camera.');

        setTimeout(() => {
          setLivenessStage('processing');
          setLivenessInstruction('Analyzing facial scan data...');

          setTimeout(async () => {
            try {
              const res = await apiClient.post('/kyc/liveness', { referenceId: livenessRef });
              if (res.data.success) {
                setLivenessStage('done');
                setLivenessInstruction('Biometric Scan Verified ✅');
                Alert.alert('Liveness Passed', 'Facial mapping match confirmed!', [
                  { text: 'Proceed', onPress: () => setCurrentStep(5) }
                ]);
              }
            } catch (err: any) {
              setLivenessStage('idle');
              setLivenessInstruction('Verification failed. Try again.');
              Alert.alert('Match Failed', 'Face did not match records. Scan again.');
            }
          }, 2000);
        }, 2000);
      }, 2000);
    }, 2000);
  };

  // Document Upload simulator
  const simulateDocUpload = (type: string) => {
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      if (type === 'cac') {
        setUploadedDocName('CAC-Certificate-99201.pdf');
      } else {
        setUploadedDocName('Govt-ID-DriversLicense.jpg');
      }
    }, 1500);
  };

  // Final submit KYC matching & redirection
  const handleFinalSubmit = async () => {
    setLoading(true);
    try {
      const payload: any = {
        opayPhone: isOpaySignup ? opayPhone : opayPhone || null,
        phone: isOpaySignup ? opayPhone : null,
        referenceId: livenessRef,
        address: address || null,
        latitude: latitude !== null ? latitude : null,
        longitude: longitude !== null ? longitude : null,
        specialty: role === 'HANDYMAN' ? specialty : null,
        vehicleType: role === 'RIDER' ? vehicleType : null,
        licensePlate: role === 'RIDER' ? licensePlate : null,
        passportPhoto: passportPhoto || null,
        actionPhoto: actionPhoto || null,
      };

      if (identityType === 'BVN') {
        payload.bvn = identityNumber;
      } else {
        payload.nin = identityNumber;
      }

      // Link final registration details to KYC submission
      const response = await apiClient.post('/kyc/submit', payload);

      if (response.data.success) {
        await refreshUser();
        const alertTitle = role === 'VENDOR' ? '✅ Store Setup Complete' : '📋 Registration Submitted';
        const alertMsg = role === 'VENDOR'
          ? 'Your vendor registration is complete! Your seller account is verified.'
          : role === 'HANDYMAN'
          ? 'Your service technician registration is complete and submitted for Admin verification.'
          : 'Your rider courier registration is complete and submitted for Admin verification.';

        Alert.alert(alertTitle, alertMsg, [
          {
            text: 'Launch App',
            onPress: () => {
              navigation.replace('Main');
            }
          }
        ]);
      }
    } catch (err: any) {
      Alert.alert('Submission Failed', err.response?.data?.error || 'Could not finalize KYC registration.');
    } finally {
      setLoading(false);
    }
  };

  // Step Indicators
  const renderStepIndicators = () => {
    if (role === 'CUSTOMER') return null;
    return (
      <View style={styles.stepIndicatorContainer}>
        {[1, 2, 3, 4, 5, 6].map((step) => {
          const isActive = currentStep === step;
          const isCompleted = currentStep > step;
          return (
            <View key={step} style={styles.stepDotWrapper}>
              <View 
                style={[
                  styles.stepDot, 
                  { 
                    backgroundColor: isActive ? OPAY_GREEN : isCompleted ? '#34C759' : '#E5E5EA',
                    borderColor: isActive ? OPAY_GREEN : 'transparent' 
                  }
                ]} 
              >
                {isCompleted ? (
                  <Text style={styles.stepDotCheck}>✓</Text>
                ) : (
                  <Text style={[styles.stepDotText, isActive && { color: '#FFF' }]}>{step}</Text>
                )}
              </View>
              {step < 6 && (
                <View 
                  style={[
                    styles.stepLine, 
                    { backgroundColor: isCompleted ? '#34C759' : '#E5E5EA' }
                  ]} 
                />
              )}
            </View>
          );
        })}
      </View>
    );
  };

  return (
    <ScrollView 
      style={[styles.container, { backgroundColor: theme.background }]} 
      contentContainerStyle={[styles.contentContainer, isLargeScreen && styles.contentContainerWeb]}
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.card, { borderColor: theme.border }, isLargeScreen && styles.cardWeb]}>
        <Text style={styles.title}>Create Account</Text>
        <Text style={styles.subtitle}>
          {role === 'CUSTOMER' ? 'Join as a Customer' : `Partner Registration (Step ${currentStep} of 6)`}
        </Text>

        {renderStepIndicators()}

        {/* STEP 1: Account Setup */}
        {currentStep === 1 && (
          <View>
            <Text style={styles.label}>Register As</Text>
            <View style={styles.roleContainer}>
              <TouchableOpacity
                style={[
                  styles.roleButton,
                  role === 'CUSTOMER' && { backgroundColor: theme.primary + '15', borderColor: theme.primary }
                ]}
                onPress={() => setRole('CUSTOMER')}
              >
                <Text style={[styles.roleButtonText, role === 'CUSTOMER' && { color: theme.primary }]}>Customer</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.roleButton,
                  role === 'HANDYMAN' && { backgroundColor: OPAY_GREEN + '15', borderColor: OPAY_GREEN }
                ]}
                onPress={() => setRole('HANDYMAN')}
              >
                <Text style={[styles.roleButtonText, role === 'HANDYMAN' && { color: OPAY_GREEN }]}>Services</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.roleButton,
                  role === 'VENDOR' && { backgroundColor: OPAY_GREEN + '15', borderColor: OPAY_GREEN }
                ]}
                onPress={() => setRole('VENDOR')}
              >
                <Text style={[styles.roleButtonText, role === 'VENDOR' && { color: OPAY_GREEN }]}>Vendor</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.roleButton,
                  role === 'RIDER' && { backgroundColor: OPAY_GREEN + '15', borderColor: OPAY_GREEN }
                ]}
                onPress={() => setRole('RIDER')}
              >
                <Text style={[styles.roleButtonText, role === 'RIDER' && { color: OPAY_GREEN }]}>Rider</Text>
              </TouchableOpacity>
            </View>

            {/* Notification & Checklist Banner for Handyman / Rider */}
            {(role === 'HANDYMAN' || role === 'RIDER') && (
              <View style={styles.requirementNoticeBox}>
                <View style={styles.requirementNoticeHeader}>
                  <Text style={styles.requirementNoticeIcon}>📢</Text>
                  <Text style={styles.requirementNoticeTitle}>
                    {role === 'HANDYMAN' ? 'Service Technician Checklist' : 'Courier Rider Checklist'}
                  </Text>
                </View>
                <Text style={styles.requirementNoticeDesc}>
                  Please ensure you have the following <Text style={{ fontWeight: '700' }}>2 photos</Text> and credentials handy to complete your registration:
                </Text>
                <View style={styles.requirementNoticeList}>
                  <Text style={styles.requirementNoticeItem}>
                    • 📸 <Text style={{ fontWeight: '700' }}>Passport Photograph:</Text> Clear portrait photo of your face.
                  </Text>
                  <Text style={styles.requirementNoticeItem}>
                    • {role === 'HANDYMAN' ? '🛠️' : '🏍️'} <Text style={{ fontWeight: '700' }}>Action Picture:</Text> {role === 'HANDYMAN' ? 'Photo of you doing service work / with your tools.' : 'Photo of you with your delivery vehicle / gear.'}
                  </Text>
                  <Text style={styles.requirementNoticeItem}>
                    • 🪪 <Text style={{ fontWeight: '700' }}>Identity Number:</Text> Valid 11-digit BVN or NIN.
                  </Text>
                  <Text style={styles.requirementNoticeItem}>
                    • 📍 <Text style={{ fontWeight: '700' }}>Work/Base Address</Text> for localized job matching.
                  </Text>
                </View>
              </View>
            )}

            {role !== 'CUSTOMER' && (
              <TouchableOpacity
                style={[styles.opayToggleBtn, isOpaySignup && { borderColor: OPAY_GREEN, backgroundColor: OPAY_GREEN + '08' }]}
                onPress={() => setIsOpaySignup(!isOpaySignup)}
                activeOpacity={0.8}
              >
                <Text style={[styles.opayToggleCheck, { color: isOpaySignup ? OPAY_GREEN : '#8E8E93' }]}>
                  {isOpaySignup ? '☑' : '☐'}
                </Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.opayToggleTitle}>Sign Up with OPay Wallet</Text>
                  <Text style={styles.opayToggleSubtitle}>Links your OPay phone for secure payouts</Text>
                </View>
              </TouchableOpacity>
            )}

            <TextInput
              style={[styles.input, { borderColor: theme.border }]}
              placeholder="Full Name"
              value={name}
              onChangeText={setName}
              placeholderTextColor="#8E8E93"
            />
            
            <TextInput
              style={[styles.input, { borderColor: theme.border }]}
              placeholder="Email address"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholderTextColor="#8E8E93"
            />

            {role !== 'CUSTOMER' && isOpaySignup && (
              <TextInput
                style={[styles.input, { borderColor: OPAY_GREEN }]}
                placeholder="OPay Wallet Phone Number"
                value={opayPhone}
                onChangeText={setOpayPhone}
                keyboardType="phone-pad"
                maxLength={11}
                placeholderTextColor="#8E8E93"
              />
            )}

            <TextInput
              style={[styles.input, { borderColor: theme.border }]}
              placeholder="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholderTextColor="#8E8E93"
            />

            {/* Country of Residence Selector */}
            <Text style={[styles.fieldLabel, { marginTop: 8, marginBottom: 6 }]}>Country of Residence</Text>
            <TouchableOpacity
              style={[
                styles.countryPickerBtn,
                { borderColor: theme.border },
              ]}
              onPress={() => setShowCountryPicker(true)}
              activeOpacity={0.8}
            >
              <Text style={{ fontSize: 22 }}>{selectedCountry.flag}</Text>
              <Text style={[styles.countryPickerLabel, { color: theme.text }]}>{selectedCountry.country}</Text>
              <Text style={[styles.countryPickerCurrency, { color: theme.primary }]}>
                {selectedCountry.currency} {selectedCountry.symbol}
              </Text>
              <Text style={{ color: '#8E8E93', marginLeft: 'auto' }}>›</Text>
            </TouchableOpacity>

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
                            <Text style={{ fontSize: 14, fontWeight: '600', color: theme.text }}>{item.country}</Text>
                            <Text style={{ fontSize: 12, color: '#8E8E93' }}>{item.currency} · {item.symbol}</Text>
                          </View>
                          {isActive && <Text style={{ color: theme.primary, fontWeight: '800' }}>✓</Text>}
                        </TouchableOpacity>
                      );
                    }}
                  />
                </View>
              </View>
            </Modal>

            <TouchableOpacity 
              style={[styles.button, { backgroundColor: role === 'CUSTOMER' ? theme.primary : OPAY_GREEN }]} 
              onPress={handleRegisterBasicAccount} 
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>
                  {role === 'CUSTOMER' ? 'Sign Up' : 'Continue'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* STEP 2: Professional Info (Handyman/Vendor) */}
        {currentStep === 2 && (
          <View>
            <Text style={styles.stepTitle}>Work Details</Text>
            <Text style={styles.stepDesc}>Provide your service details to continue.</Text>

            {(role === 'HANDYMAN' || role === 'RIDER') && (
              <View style={[styles.requirementNoticeBox, { marginBottom: 16 }]}>
                <Text style={[styles.requirementNoticeDesc, { marginBottom: 0 }]}>
                  📸 <Text style={{ fontWeight: '700' }}>Reminder:</Text> In Step 5 you will upload your <Text style={{ fontWeight: '700' }}>Passport Photograph</Text> and <Text style={{ fontWeight: '700' }}>Action Picture</Text>. Please have them ready!
                </Text>
              </View>
            )}

            {role === 'HANDYMAN' && (
              <View style={styles.fieldSection}>
                <Text style={styles.fieldLabel}>Select Your Specialty</Text>
                <View style={styles.specialtyRow}>
                  {specialties.map(spec => {
                    const isActive = specialty === spec;
                    return (
                      <TouchableOpacity
                        key={spec}
                        style={[
                          styles.specPill,
                          isActive && { backgroundColor: OPAY_GREEN, borderColor: OPAY_GREEN }
                        ]}
                        onPress={() => setSpecialty(spec)}
                      >
                        <Text style={[styles.specText, isActive && { color: '#FFF' }]}>{spec}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {role === 'RIDER' && (
              <View>
                <View style={styles.fieldSection}>
                  <Text style={styles.fieldLabel}>Select Vehicle Type</Text>
                  <View style={styles.specialtyRow}>
                    {['BICYCLE', 'MOTORCYCLE', 'CAR'].map(typeOpt => {
                      const isActive = vehicleType === typeOpt;
                      const emoji = typeOpt === 'BICYCLE' ? '🚲' : typeOpt === 'MOTORCYCLE' ? '🏍️' : '🚗';
                      return (
                        <TouchableOpacity
                          key={typeOpt}
                          style={[
                            styles.specPill,
                            isActive && { backgroundColor: OPAY_GREEN, borderColor: OPAY_GREEN }
                          ]}
                          onPress={() => setVehicleType(typeOpt)}
                        >
                          <Text style={[styles.specText, isActive && { color: '#FFF' }]}>
                            {emoji} {typeOpt.charAt(0) + typeOpt.slice(1).toLowerCase()}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                <View style={styles.fieldSection}>
                  <Text style={styles.fieldLabel}>License Plate Number</Text>
                  <TextInput
                    style={[styles.input, { borderColor: theme.border }]}
                    placeholder="e.g. ABC-123-XYZ"
                    value={licensePlate}
                    onChangeText={setLicensePlate}
                    placeholderTextColor="#8E8E93"
                    autoCapitalize="characters"
                  />
                </View>
              </View>
            )}

            <View style={styles.fieldSection}>
              <AddressInput
                label="Work/Store Address"
                onAddressChange={(assembledAddress, lat, lng) => {
                  setAddress(assembledAddress);
                  setLatitude(lat);
                  setLongitude(lng);
                }}
                initialValue={address}
                countryCode="ng"
              />
            </View>

            <TouchableOpacity 
              style={[styles.button, { backgroundColor: OPAY_GREEN }]} 
              onPress={handleVerifyProfessionAndRegister} 
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Register & Verify Identity</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* STEP 3: Identity Verification (BVN or NIN) */}
        {currentStep === 3 && (
          <View>
            <Text style={styles.stepTitle}>Identity Verification</Text>
            <Text style={styles.stepDesc}>Verify your identity using either your BVN or NIN document.</Text>

            <View style={styles.identityToggle}>
              <TouchableOpacity
                style={[styles.idToggleBtn, identityType === 'BVN' && styles.idToggleBtnActive]}
                onPress={() => { setIdentityType('BVN'); setIdentityVerified(false); }}
              >
                <Text style={[styles.idToggleText, identityType === 'BVN' && { color: '#FFF' }]}>Verify with BVN</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.idToggleBtn, identityType === 'NIN' && styles.idToggleBtnActive]}
                onPress={() => { setIdentityType('NIN'); setIdentityVerified(false); }}
              >
                <Text style={[styles.idToggleText, identityType === 'NIN' && { color: '#FFF' }]}>Verify with NIN</Text>
              </TouchableOpacity>
            </View>

            {!identityVerified ? (
              <View>
                <TextInput
                  style={[styles.input, { borderColor: theme.border }]}
                  placeholder={`Enter 11-digit ${identityType}`}
                  value={identityNumber}
                  onChangeText={setIdentityNumber}
                  keyboardType="numeric"
                  maxLength={11}
                  placeholderTextColor="#8E8E93"
                />

                {identityType === 'BVN' && (
                  <TouchableOpacity 
                    style={styles.consentRow} 
                    onPress={() => setConsent(!consent)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.consentCheckText, { color: consent ? OPAY_GREEN : '#8E8E93' }]}>
                      {consent ? '☑' : '☐'}
                    </Text>
                    <Text style={styles.consentLabelText}>
                      I consent to verify my identity details via Dojah API.
                    </Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity 
                  style={[styles.button, { backgroundColor: OPAY_GREEN }]} 
                  onPress={handleVerifyIdentity} 
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.buttonText}>Verify {identityType}</Text>
                  )}
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.successCard}>
                <Text style={styles.successCheck}>✅</Text>
                <Text style={styles.successNameText}>{identityType} Verification Success</Text>
                {identityType === 'BVN' && <Text style={styles.successDetailText}>Name: {identityName}</Text>}
                
                <TouchableOpacity 
                  style={[styles.button, { backgroundColor: OPAY_GREEN, marginTop: 20 }]} 
                  onPress={() => setCurrentStep(4)}
                >
                  <Text style={styles.buttonText}>Proceed to Liveness Check</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* STEP 4: Liveness Selfie Scan */}
        {currentStep === 4 && (
          <View style={{ alignItems: 'center' }}>
            <Text style={[styles.stepTitle, { alignSelf: 'flex-start' }]}>Biometric Selfie Scan</Text>
            <Text style={[styles.stepDesc, { alignSelf: 'flex-start' }]}>Verify you are a live user.</Text>

            <View style={styles.cameraFrame}>
              <Animated.View 
                style={[
                  styles.cameraOval, 
                  { 
                    borderColor: livenessStage === 'done' ? '#34C759' : livenessStage !== 'idle' ? OPAY_GREEN : '#E5E5EA',
                    transform: [{ scale: pulseAnim }]
                  }
                ]}
              >
                <View style={styles.faceOverlay} />
                {(livenessStage === 'scanning' || livenessStage === 'blink' || livenessStage === 'smile') && (
                  <Animated.View 
                    style={[
                      styles.scanLineElement, 
                      { 
                        backgroundColor: OPAY_GREEN,
                        transform: [{ translateY: scanLineAnim }] 
                      }
                    ]} 
                  />
                )}
              </Animated.View>
            </View>

            <Text style={styles.livenessInstruct}>{livenessInstruction}</Text>

            {livenessStage === 'idle' && (
              <TouchableOpacity 
                style={[styles.button, { backgroundColor: OPAY_GREEN, width: '100%' }]} 
                onPress={startLivenessScan}
              >
                <Text style={styles.buttonText}>Start Scan</Text>
              </TouchableOpacity>
            )}

            {livenessStage === 'processing' && (
              <ActivityIndicator size="large" color={OPAY_GREEN} style={{ marginTop: 10 }} />
            )}
          </View>
        )}

        {/* STEP 5: Photos & Document Upload */}
        {currentStep === 5 && (
          <View>
            <Text style={styles.stepTitle}>
              {role === 'VENDOR' ? 'Store & Legal Documents' : 'Verification Photos & ID'}
            </Text>
            <Text style={styles.stepDesc}>
              {role === 'VENDOR'
                ? 'Upload your business CAC certificate and verification documents.'
                : 'Upload both required photos (Passport Photograph & Action Picture) and your government ID card.'}
            </Text>

            {/* HANDYMAN & RIDER: 2 Required Photos */}
            {(role === 'HANDYMAN' || role === 'RIDER') && (
              <View style={{ marginBottom: 20 }}>
                {/* 1. Passport Photo Card */}
                <View style={styles.photoUploadCard}>
                  <View style={styles.photoCardHeader}>
                    <Text style={styles.photoCardNumber}>1</Text>
                    <View style={{ flex: 1, marginLeft: 8 }}>
                      <Text style={styles.photoCardTitle}>Passport Photograph</Text>
                      <Text style={styles.photoCardSubtitle}>Clear portrait showing your face</Text>
                    </View>
                    {passportPhoto && <Text style={styles.photoUploadedTag}>Uploaded ✓</Text>}
                  </View>

                  {passportPhoto ? (
                    <View style={styles.photoPreviewWrapper}>
                      <Image source={{ uri: getImageUri(passportPhoto) ?? undefined }} style={styles.photoThumbnail} />
                      <View style={{ flex: 1, marginLeft: 14 }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: '#1C1C1E' }}>Passport Photo</Text>
                        <Text style={{ fontSize: 11, color: '#34C759', marginTop: 2 }}>Ready for Admin Review</Text>
                        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                          <TouchableOpacity 
                            style={styles.photoChangeBtn} 
                            onPress={() => showPhotoOptions('passport')}
                          >
                            <Text style={styles.photoChangeBtnText}>Change</Text>
                          </TouchableOpacity>
                          <TouchableOpacity 
                            style={styles.photoRemoveBtn} 
                            onPress={() => setPassportPhoto(null)}
                          >
                            <Text style={styles.photoRemoveBtnText}>Remove</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  ) : (
                    <View style={styles.photoUploadBtnsRow}>
                      {uploadingPassport ? (
                        <View style={styles.uploadingBox}>
                          <ActivityIndicator color={OPAY_GREEN} size="small" />
                          <Text style={styles.uploadingText}>Processing photo...</Text>
                        </View>
                      ) : (
                        <>
                          <TouchableOpacity 
                            style={[styles.photoActionBtn, { backgroundColor: OPAY_GREEN }]}
                            onPress={() => showPhotoOptions('passport')}
                          >
                            <Text style={styles.photoActionBtnText}>📸 Select / Take Passport Photo</Text>
                          </TouchableOpacity>
                        </>
                      )}
                    </View>
                  )}
                </View>

                {/* 2. Action Picture Card */}
                <View style={styles.photoUploadCard}>
                  <View style={styles.photoCardHeader}>
                    <Text style={styles.photoCardNumber}>2</Text>
                    <View style={{ flex: 1, marginLeft: 8 }}>
                      <Text style={styles.photoCardTitle}>
                        {role === 'HANDYMAN' ? 'Action Picture (At Work / Tools)' : 'Action Picture (With Vehicle)'}
                      </Text>
                      <Text style={styles.photoCardSubtitle}>
                        {role === 'HANDYMAN' 
                          ? 'Photo of you doing repairs or holding tools' 
                          : 'Photo of you with your motorcycle/car/gear'}
                      </Text>
                    </View>
                    {actionPhoto && <Text style={styles.photoUploadedTag}>Uploaded ✓</Text>}
                  </View>

                  {actionPhoto ? (
                    <View style={styles.photoPreviewWrapper}>
                      <Image source={{ uri: getImageUri(actionPhoto) ?? undefined }} style={styles.photoThumbnail} />
                      <View style={{ flex: 1, marginLeft: 14 }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: '#1C1C1E' }}>Action Picture</Text>
                        <Text style={{ fontSize: 11, color: '#34C759', marginTop: 2 }}>Ready for Admin Review</Text>
                        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                          <TouchableOpacity 
                            style={styles.photoChangeBtn} 
                            onPress={() => showPhotoOptions('action')}
                          >
                            <Text style={styles.photoChangeBtnText}>Change</Text>
                          </TouchableOpacity>
                          <TouchableOpacity 
                            style={styles.photoRemoveBtn} 
                            onPress={() => setActionPhoto(null)}
                          >
                            <Text style={styles.photoRemoveBtnText}>Remove</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  ) : (
                    <View style={styles.photoUploadBtnsRow}>
                      {uploadingAction ? (
                        <View style={styles.uploadingBox}>
                          <ActivityIndicator color={OPAY_GREEN} size="small" />
                          <Text style={styles.uploadingText}>Processing photo...</Text>
                        </View>
                      ) : (
                        <>
                          <TouchableOpacity 
                            style={[styles.photoActionBtn, { backgroundColor: OPAY_GREEN }]}
                            onPress={() => showPhotoOptions('action')}
                          >
                            <Text style={styles.photoActionBtnText}>
                              {role === 'HANDYMAN' ? '🛠️ Select / Take Action Photo' : '🏍️ Select / Take Action Photo'}
                            </Text>
                          </TouchableOpacity>
                        </>
                      )}
                    </View>
                  )}
                </View>
              </View>
            )}

            {/* 3. Government ID Card / CAC Document */}
            <Text style={[styles.fieldLabel, { marginTop: (role === 'HANDYMAN' || role === 'RIDER') ? 8 : 0 }]}>
              {role === 'VENDOR' ? 'Corporate Affairs Commission (CAC) Certificate' : '3. Government ID Card'}
            </Text>

            {!uploadedDocName ? (
              <TouchableOpacity 
                style={styles.uploadArea} 
                onPress={() => simulateDocUpload(role === 'VENDOR' ? 'cac' : 'id')}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator size="large" color={OPAY_GREEN} />
                ) : (
                  <View style={{ alignItems: 'center' }}>
                    <Text style={{ fontSize: 32 }}>📁</Text>
                    <Text style={styles.uploadTextTitle}>
                      {role === 'VENDOR' ? 'Upload CAC Certificate' : 'Select ID Card Document'}
                    </Text>
                    <Text style={styles.uploadTextDesc}>Supports JPG, PNG, PDF up to 5MB</Text>
                  </View>
                )}
              </TouchableOpacity>
            ) : (
              <View style={styles.successDocCard}>
                <Text style={{ fontSize: 32 }}>📄</Text>
                <Text style={styles.successDocTitle}>{uploadedDocName}</Text>
                <Text style={{ color: '#34C759', fontWeight: '700', fontSize: 13, marginTop: 4 }}>File linked successfully</Text>
                
                <TouchableOpacity 
                  style={styles.removeBtn} 
                  onPress={() => setUploadedDocName(null)}
                >
                  <Text style={styles.removeBtnText}>Remove file</Text>
                </TouchableOpacity>
              </View>
            )}

            <TouchableOpacity 
              style={[styles.button, { backgroundColor: OPAY_GREEN, width: '100%', marginTop: 24 }]} 
              onPress={() => {
                if ((role === 'HANDYMAN' || role === 'RIDER') && (!passportPhoto || !actionPhoto)) {
                  Alert.alert(
                    'Photos Recommended',
                    'You have not uploaded both required photos (Passport Photo & Action Picture). You can proceed now and update them later in your profile, but complete photos are required for Admin approval.',
                    [
                      { text: 'Upload Photos First', style: 'cancel' },
                      { text: 'Proceed Anyway', onPress: () => setCurrentStep(6) },
                    ]
                  );
                  return;
                }
                setCurrentStep(6);
              }}
            >
              <Text style={styles.buttonText}>Proceed to Confirmation</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* STEP 6: Confirmation */}
        {currentStep === 6 && (
          <View>
            <Text style={styles.stepTitle}>Registration Summary</Text>
            <Text style={styles.stepDesc}>Confirm your details to finalize registration.</Text>

            <View style={styles.summaryContainer}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Role</Text>
                <Text style={styles.summaryValue}>{role}</Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Name</Text>
                <Text style={styles.summaryValue}>{name}</Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Email</Text>
                <Text style={styles.summaryValue}>{email}</Text>
              </View>
              {isOpaySignup && (
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryLabel}>OPay Phone</Text>
                  <Text style={[styles.summaryValue, { color: OPAY_GREEN, fontWeight: '700' }]}>{opayPhone}</Text>
                </View>
              )}
              {role === 'HANDYMAN' && (
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryLabel}>Specialty</Text>
                  <Text style={styles.summaryValue}>{specialty}</Text>
                </View>
              )}
              {role === 'RIDER' && (
                <>
                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryLabel}>Vehicle Type</Text>
                    <Text style={styles.summaryValue}>{vehicleType}</Text>
                  </View>
                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryLabel}>License Plate</Text>
                    <Text style={styles.summaryValue}>{licensePlate}</Text>
                  </View>
                </>
              )}
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Address</Text>
                <Text style={styles.summaryValue}>{address}</Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Identity Document</Text>
                <Text style={styles.summaryValue}>{identityType} (Verified)</Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Biometric Liveness</Text>
                <Text style={styles.summaryValue}>Passed</Text>
              </View>
              
              {(role === 'HANDYMAN' || role === 'RIDER') && (
                <>
                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryLabel}>Passport Photo</Text>
                    <Text style={[styles.summaryValue, { color: passportPhoto ? '#34C759' : '#FF9500' }]}>
                      {passportPhoto ? 'Uploaded ✓' : '⚠️ Missing'}
                    </Text>
                  </View>
                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryLabel}>Action Picture</Text>
                    <Text style={[styles.summaryValue, { color: actionPhoto ? '#34C759' : '#FF9500' }]}>
                      {actionPhoto ? 'Uploaded ✓' : '⚠️ Missing'}
                    </Text>
                  </View>
                </>
              )}

              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Verification Status</Text>
                <Text style={[styles.summaryValue, { color: OPAY_GREEN, fontWeight: '800' }]}>PENDING REVIEW</Text>
              </View>
            </View>

            <TouchableOpacity 
              style={[styles.button, { backgroundColor: OPAY_GREEN }]} 
              onPress={handleFinalSubmit} 
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Finalize Account</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {currentStep === 1 && (
          <>
            <TouchableOpacity 
              onPress={() => navigation.navigate('Login', { redirectTo, redirectParams })} 
              style={styles.linkContainer}
            >
              <Text style={styles.linkText}>
                Already have an account? <Text style={[styles.linkHighlight, { color: theme.primary }]}>Log In</Text>
              </Text>
            </TouchableOpacity>

            <TouchableOpacity 
              onPress={() => navigation.navigate('Main')} 
              style={styles.cancelLinkContainer}
            >
              <Text style={[styles.cancelLinkText, { color: theme.lightText }]}>Cancel</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    justifyContent: 'center',
    flexGrow: 1,
  },
  contentContainerWeb: {
    alignItems: 'center',
    minHeight: '100%',
  },
  cardWeb: {
    maxWidth: 420,
    width: '100%',
  },
  card: {
    backgroundColor: '#FFFFFF',
    padding: 24,
    borderRadius: 24,
    shadowColor: '#171717',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.05,
    shadowRadius: 20,
    elevation: 3,
    borderWidth: 1,
    marginVertical: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 6,
    textAlign: 'center',
    color: '#1C1C1E',
  },
  subtitle: {
    fontSize: 13,
    color: '#8E8E93',
    textAlign: 'center',
    marginBottom: 20,
    fontWeight: '500',
  },
  input: {
    height: 52,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    marginBottom: 16,
    fontSize: 15,
    color: '#1C1C1E',
    backgroundColor: '#F9F9FB',
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: '#3A3A3C',
    marginBottom: 10,
  },
  roleContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  roleButton: {
    flex: 1,
    paddingVertical: 12,
    borderWidth: 1.5,
    borderColor: '#E5E5EA',
    borderRadius: 12,
    marginHorizontal: 3,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  roleButtonText: {
    color: '#8E8E93',
    fontWeight: '700',
    fontSize: 13,
  },
  opayToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#E5E5EA',
    borderRadius: 14,
    padding: 12,
    marginBottom: 16,
    backgroundColor: '#FFFFFF',
  },
  opayToggleCheck: {
    fontSize: 24,
    marginRight: 10,
    fontWeight: 'bold',
  },
  opayToggleTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  opayToggleSubtitle: {
    fontSize: 11,
    color: '#8E8E93',
    marginTop: 2,
  },
  button: {
    height: 52,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 2,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  linkContainer: {
    alignItems: 'center',
    marginTop: 20,
  },
  linkText: {
    color: '#8E8E93',
    fontSize: 13,
  },
  linkHighlight: {
    fontWeight: '700',
  },
  stepIndicatorContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  stepDotWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
  },
  stepDotText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#8E8E93',
  },
  stepDotCheck: {
    fontSize: 11,
    fontWeight: '900',
    color: '#FFF',
  },
  stepLine: {
    width: 14,
    height: 2,
    marginHorizontal: 2,
  },
  stepTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1C1C1E',
    marginBottom: 4,
  },
  stepDesc: {
    fontSize: 13,
    color: '#8E8E93',
    marginBottom: 20,
  },
  fieldSection: {
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#3A3A3C',
    marginBottom: 10,
  },
  specialtyRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  specPill: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#E5E5EA',
    marginRight: 8,
    backgroundColor: '#FFF',
  },
  specText: {
    fontSize: 13,
    color: '#3A3A3C',
    fontWeight: '600',
  },
  identityToggle: {
    flexDirection: 'row',
    backgroundColor: '#F2F2F7',
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
  },
  idToggleBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  idToggleBtnActive: {
    backgroundColor: '#03B576',
  },
  idToggleText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#8E8E93',
  },
  consentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  consentCheckText: {
    fontSize: 24,
    marginRight: 8,
  },
  consentLabelText: {
    flex: 1,
    fontSize: 12,
    color: '#3A3A3C',
    lineHeight: 16,
  },
  successCard: {
    alignItems: 'center',
    padding: 20,
    borderWidth: 1.5,
    borderColor: '#34C759',
    borderStyle: 'dashed',
    borderRadius: 16,
  },
  successCheck: {
    fontSize: 36,
    marginBottom: 10,
  },
  successNameText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  successDetailText: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 4,
  },
  cameraFrame: {
    width: 190,
    height: 190,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 16,
  },
  cameraOval: {
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 3,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1C1C1E',
  },
  faceOverlay: {
    width: 100,
    height: 120,
    borderRadius: 50,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderStyle: 'dashed',
    position: 'absolute',
  },
  scanLineElement: {
    width: '100%',
    height: 3,
    position: 'absolute',
    top: 0,
    opacity: 0.8,
  },
  livenessInstruct: {
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 20,
    color: '#1C1C1E',
  },
  uploadArea: {
    height: 160,
    borderRadius: 16,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#E5E5EA',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9F9FB',
  },
  uploadTextTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1C1C1E',
    marginTop: 8,
  },
  uploadTextDesc: {
    fontSize: 11,
    color: '#8E8E93',
    marginTop: 2,
  },
  successDocCard: {
    alignItems: 'center',
    padding: 20,
    borderWidth: 1.5,
    borderColor: '#34C759',
    borderStyle: 'dashed',
    borderRadius: 16,
  },
  successDocTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1C1C1E',
    marginTop: 8,
  },
  removeBtn: {
    marginTop: 12,
  },
  removeBtnText: {
    fontSize: 13,
    color: '#FF3B30',
    fontWeight: '600',
  },
  summaryContainer: {
    backgroundColor: '#F2F2F7',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
  },
  summaryItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  summaryLabel: {
    fontSize: 13,
    color: '#8E8E93',
  },
  summaryValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  cancelLinkContainer: {
    alignItems: 'center',
    marginTop: 16,
    paddingVertical: 4,
  },
  cancelLinkText: {
    fontSize: 14,
    fontWeight: '600',
  },
  // Country picker
  countryPickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 16,
  },
  countryPickerLabel: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  countryPickerCurrency: {
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
  // Requirement Notice Box
  requirementNoticeBox: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1.5,
    borderColor: '#86EFAC',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
  },
  requirementNoticeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  requirementNoticeIcon: {
    fontSize: 18,
    marginRight: 6,
  },
  requirementNoticeTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#166534',
  },
  requirementNoticeDesc: {
    fontSize: 12,
    color: '#15803D',
    lineHeight: 17,
    marginBottom: 8,
  },
  requirementNoticeList: {
    gap: 4,
  },
  requirementNoticeItem: {
    fontSize: 12,
    color: '#166534',
    lineHeight: 17,
  },
  // Photo Upload Cards in Step 5
  photoUploadCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    padding: 14,
    marginBottom: 14,
  },
  photoCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  photoCardNumber: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#03B576',
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 22,
  },
  photoCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  photoCardSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  photoUploadedTag: {
    fontSize: 11,
    fontWeight: '700',
    color: '#16A34A',
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  photoPreviewWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  photoThumbnail: {
    width: 72,
    height: 72,
    borderRadius: 10,
    backgroundColor: '#E2E8F0',
  },
  photoChangeBtn: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  photoChangeBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  photoRemoveBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  photoRemoveBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#EF4444',
  },
  photoUploadBtnsRow: {
    marginTop: 4,
  },
  photoActionBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoActionBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  uploadingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 8,
  },
  uploadingText: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600',
  },
});
