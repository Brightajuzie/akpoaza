import React, { useState, useContext, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Animated,
  useWindowDimensions,
  Image,
  Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import apiClient, { getImageUri } from '../api/client';
import { AuthContext } from '../context/AuthContext';
import { SettingsContext } from '../context/SettingsContext';

export default function KYCVerificationScreen({ route, navigation }: any) {
  const { width, height } = useWindowDimensions();
  const { theme } = useContext(SettingsContext);
  const { refreshUser, userInfo } = useContext(AuthContext);

  const redirectTo = route?.params?.redirectTo || 'Main';
  const redirectParams = route?.params?.redirectParams || {};

  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Step 1: BVN
  const [bvn, setBvn] = useState('');
  const [consent, setConsent] = useState(false);
  const [bvnMatchedData, setBvnMatchedData] = useState<any>(null);

  // Step 2: NIN
  const [nin, setNin] = useState('');
  const [ninMatchedData, setNinMatchedData] = useState<any>(null);

  // Step 3: Liveness
  const [livenessStage, setLivenessStage] = useState<'idle' | 'scanning' | 'blink' | 'smile' | 'processing' | 'done'>('idle');
  const [livenessInstruction, setLivenessInstruction] = useState('Align your face inside the circle.');
  const [livenessRef] = useState(`REF_LIVENESS_${Math.floor(Math.random() * 899999 + 100000)}`);
  const scanLineAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Step 4: Photos & Documents
  const [passportPhoto, setPassportPhoto] = useState<string | null>(userInfo?.passportPhoto || null);
  const [actionPhoto, setActionPhoto] = useState<string | null>(userInfo?.actionPhoto || null);
  const [uploadingPassport, setUploadingPassport] = useState(false);
  const [uploadingAction, setUploadingAction] = useState(false);
  const [uploadedDocName, setUploadedDocName] = useState<string | null>(null);
  const isVendor = userInfo?.role === 'VENDOR';
  const isHandymanOrRider = userInfo?.role === 'HANDYMAN' || userInfo?.role === 'RIDER';

  // Step 5: OPay Wallet Link
  const [opayPhone, setOpayPhone] = useState(userInfo?.phone || '');

  // Photo upload helpers
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
            Alert.alert('Permission Required', 'Please grant camera access.');
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
      console.error('Photo error:', err);
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
      Alert.alert('Upload Failed', uploadErr.response?.data?.error || 'Could not upload image.');
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
      Alert.alert('Upload Failed', uploadErr.response?.data?.error || 'Could not upload image.');
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
      target === 'passport' ? 'Please provide a clear front portrait photo.' : 'Please provide a photo of you at work / with vehicle.',
      [
        { text: '📸 Take Photo (Camera)', onPress: () => handleUploadPhoto(target, 'camera') },
        { text: '🖼️ Choose from Gallery', onPress: () => handleUploadPhoto(target, 'gallery') },
        { text: 'Cancel', style: 'cancel' }
      ]
    );
  };

  // Animated Scan Line & pulsing camera view
  useEffect(() => {
    let anim: Animated.CompositeAnimation | null = null;
    if (livenessStage === 'scanning' || livenessStage === 'blink' || livenessStage === 'smile') {
      anim = Animated.loop(
        Animated.sequence([
          Animated.timing(scanLineAnim, {
            toValue: 200,
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

  // Step 1 handler
  const handleVerifyBVN = async () => {
    if (!consent) {
      Alert.alert('Consent Required', 'You must agree to verify your BVN against official records.');
      return;
    }
    if (bvn.length !== 11 || !/^\d+$/.test(bvn)) {
      Alert.alert('Invalid BVN', 'BVN must be exactly 11 digits.');
      return;
    }

    setLoading(true);
    try {
      const res = await apiClient.post('/kyc/bvn', { bvn, consent });
      if (res.data.success) {
        setBvnMatchedData(res.data.data);
        Alert.alert('BVN Linked', `Verified as ${res.data.data.formatted_name}. Proceed to next step.`);
      }
    } catch (err: any) {
      Alert.alert('Verification Failed', err.response?.data?.error || 'Could not verify BVN.');
    } finally {
      setLoading(false);
    }
  };

  // Step 2 handler
  const handleVerifyNIN = async () => {
    if (nin.length !== 11 || !/^\d+$/.test(nin)) {
      Alert.alert('Invalid NIN', 'NIN must be exactly 11 digits.');
      return;
    }

    setLoading(true);
    try {
      const res = await apiClient.post('/kyc/nin', { nin });
      if (res.data.success) {
        setNinMatchedData(res.data.data);
        Alert.alert('NIN Verified', 'NIN verified successfully. Proceeding to liveness selfie scan.');
        setCurrentStep(3);
      }
    } catch (err: any) {
      Alert.alert('Verification Failed', err.response?.data?.error || 'Could not verify NIN.');
    } finally {
      setLoading(false);
    }
  };

  // Step 3: Interactive Liveness Simulation
  const startLivenessScan = () => {
    setLivenessStage('scanning');
    setLivenessInstruction('Align your face inside the circle.');

    // Stage 1: Scanning alignment
    setTimeout(() => {
      setLivenessStage('blink');
      setLivenessInstruction('Blink your eyes twice slowly.');

      // Stage 2: Blink
      setTimeout(() => {
        setLivenessStage('smile');
        setLivenessInstruction('Smile widely for the camera.');

        // Stage 3: Smile
        setTimeout(() => {
          setLivenessStage('processing');
          setLivenessInstruction('Analyzing facial scan data...');

          // Stage 4: Verify via API
          setTimeout(async () => {
            try {
              const res = await apiClient.post('/kyc/liveness', { referenceId: livenessRef });
              if (res.data.success) {
                setLivenessStage('done');
                setLivenessInstruction('Biometric Scan Verified ✅');
                Alert.alert('Liveness Passed', 'Facial mapping match confirmed!', [
                  { text: 'Proceed', onPress: () => setCurrentStep(4) }
                ]);
              }
            } catch (err: any) {
              setLivenessStage('idle');
              setLivenessInstruction('Verification failed. Try again.');
              Alert.alert('Match Failed', 'Face did not match records. Please scan again in good lighting.');
            }
          }, 2000);

        }, 2500);
      }, 2500);
    }, 2500);
  };

  // Step 4 Document capture simulation
  const simulateDocUpload = (type: string) => {
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      if (type === 'cac') {
        setUploadedDocName('CAC-Certificate-99120.pdf');
      } else {
        setUploadedDocName('Govt-ID-DriversLicense.jpg');
      }
    }, 1500);
  };

  // Step 5: Final Submission
  const handleFinalSubmit = async () => {
    if (!opayPhone || opayPhone.length < 10) {
      Alert.alert('Wallet Linking Required', 'Please enter a valid OPay account phone number.');
      return;
    }

    setLoading(true);
    try {
      const payload: any = {
        opayPhone,
        referenceId: livenessRef,
        passportPhoto: passportPhoto || null,
        actionPhoto: actionPhoto || null,
      };
      if (bvn) payload.bvn = bvn;
      if (nin) payload.nin = nin;

      const response = await apiClient.post('/kyc/submit', payload);

      if (response.data.success) {
        await refreshUser();
        const role = userInfo?.role;
        const alertTitle = role === 'VENDOR' ? '✅ Verification Complete' : '📋 KYC Submitted';
        const alertBody = role === 'VENDOR'
          ? 'Vendor registration is complete! Your seller account is now verified.'
          : role === 'HANDYMAN'
          ? 'Your service technician registration is submitted and is pending Admin verification.'
          : 'Your rider courier registration is submitted and is pending Admin verification.';

        Alert.alert(alertTitle, alertBody, [
          {
            text: 'OK',
            onPress: () => {
              navigation.replace('Main', { screen: 'ProfileTab' });
            }
          }
        ]);
      }
    } catch (err: any) {
      Alert.alert('Submission Failed', err.response?.data?.error || 'Could not complete registration.');
    } finally {
      setLoading(false);
    }
  };

  const renderProgressBar = () => {
    const progress = (currentStep - 1) / 4;
    return (
      <View style={styles.progressContainer}>
        <View style={styles.progressBarBackground}>
          <View style={[styles.progressBarFill, { width: `${progress * 100}%`, backgroundColor: theme.primary }]} />
        </View>
        <Text style={[styles.progressText, { color: theme.lightText }]}>
          Step {currentStep} of 5
        </Text>
      </View>
    );
  };

  return (
    <ScrollView 
      style={[styles.container, { backgroundColor: theme.background }]} 
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      <Text style={[styles.title, { color: theme.text }]}>KYC Verification</Text>
      <Text style={[styles.subtitle, { color: theme.lightText }]}>
        Complete your identity setup to unlock seller listings and job dispatches.
      </Text>

      {renderProgressBar()}

      <View style={[styles.card, { borderColor: theme.border }]}>
        {/* STEP 1: BVN */}
        {currentStep === 1 && (
          <View>
            <Text style={[styles.stepTitle, { color: theme.text }]}>1. Bank Verification Number (BVN)</Text>
            <Text style={[styles.stepDescription, { color: theme.lightText }]}>
              Enter your 11-digit BVN. To comply with Central Bank of Nigeria guidelines, this must match your registered name.
            </Text>

            {!bvnMatchedData ? (
              <View>
                <TextInput
                  style={[styles.input, { borderColor: theme.border, color: theme.text }]}
                  placeholder="Enter 11-digit BVN"
                  keyboardType="numeric"
                  maxLength={11}
                  value={bvn}
                  onChangeText={setBvn}
                  placeholderTextColor={theme.lightText}
                />

                <TouchableOpacity 
                  style={styles.consentBox} 
                  onPress={() => setConsent(!consent)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.consentCheck, { color: consent ? theme.primary : theme.lightText }]}>
                    {consent ? '☑' : '☐'}
                  </Text>
                  <Text style={[styles.consentLabel, { color: theme.text }]}>
                    I consent to verify my identity details via Dojah API against the NIBSS CBN register.
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={[styles.btn, { backgroundColor: theme.primary }]} 
                  onPress={handleVerifyBVN}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.btnText}>Verify Identity</Text>
                  )}
                </TouchableOpacity>
              </View>
            ) : (
              <View style={[styles.badgeSuccess, { borderColor: theme.primary }]}>
                <Text style={[styles.successName, { color: theme.text }]}>
                  ✅ Linked: {bvnMatchedData.formatted_name}
                </Text>
                <Text style={[styles.successDob, { color: theme.lightText }]}>
                  Birthdate: {bvnMatchedData.dob}
                </Text>
                
                <TouchableOpacity 
                  style={[styles.btn, { backgroundColor: theme.primary, marginTop: 24 }]} 
                  onPress={() => setCurrentStep(2)}
                >
                  <Text style={styles.btnText}>Proceed to Next Step</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* STEP 2: NIN */}
        {currentStep === 2 && (
          <View>
            <Text style={[styles.stepTitle, { color: theme.text }]}>2. National Identity Number (NIN)</Text>
            <Text style={[styles.stepDescription, { color: theme.lightText }]}>
              (Optional) Enter your 11-digit NIN. You can verify it now or skip to liveness matching.
            </Text>

            <TextInput
              style={[styles.input, { borderColor: theme.border, color: theme.text }]}
              placeholder="Enter 11-digit NIN"
              keyboardType="numeric"
              maxLength={11}
              value={nin}
              onChangeText={setNin}
              placeholderTextColor={theme.lightText}
            />

            <TouchableOpacity 
              style={[styles.btn, { backgroundColor: theme.primary }]} 
              onPress={handleVerifyNIN}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.btnText}>Verify NIN</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.btnSecondary, { borderColor: theme.border }]} 
              onPress={() => setCurrentStep(3)}
            >
              <Text style={[styles.btnSecondaryText, { color: theme.text }]}>Skip NIN Verification</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* STEP 3: LIVENESS */}
        {currentStep === 3 && (
          <View style={{ alignItems: 'center' }}>
            <Text style={[styles.stepTitle, { color: theme.text, alignSelf: 'flex-start' }]}>3. Biometric Liveness check</Text>
            <Text style={[styles.stepDescription, { color: theme.lightText, alignSelf: 'flex-start' }]}>
              Verify you are a live person. Align your face inside the circle frame and follow screen prompts.
            </Text>

            <View style={styles.cameraWrapper}>
              <Animated.View 
                style={[
                  styles.cameraCircle, 
                  { 
                    borderColor: livenessStage === 'done' ? '#34C759' : livenessStage !== 'idle' ? theme.primary : theme.border,
                    transform: [{ scale: pulseAnim }]
                  }
                ]}
              >
                {/* Simulated Camera Viewfinder Grid */}
                <View style={styles.faceSilhouette} />
                
                {(livenessStage === 'scanning' || livenessStage === 'blink' || livenessStage === 'smile') && (
                  <Animated.View 
                    style={[
                      styles.scanLine, 
                      { 
                        backgroundColor: theme.primary,
                        transform: [{ translateY: scanLineAnim }] 
                      }
                    ]} 
                  />
                )}
              </Animated.View>
            </View>

            <Text style={[styles.livenessInstructText, { color: theme.text }]}>{livenessInstruction}</Text>

            {livenessStage === 'idle' && (
              <TouchableOpacity 
                style={[styles.btn, { backgroundColor: theme.primary, width: '100%' }]} 
                onPress={startLivenessScan}
              >
                <Text style={styles.btnText}>Start Liveness Scan</Text>
              </TouchableOpacity>
            )}

            {livenessStage === 'processing' && (
              <ActivityIndicator size="large" color={theme.primary} style={{ marginTop: 15 }} />
            )}

            {livenessStage === 'done' && (
              <TouchableOpacity 
                style={[styles.btn, { backgroundColor: theme.primary, width: '100%' }]} 
                onPress={() => setCurrentStep(4)}
              >
                <Text style={styles.btnText}>Proceed to Step 4</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* STEP 4: CAC / PHOTOS & DOCUMENTS */}
        {currentStep === 4 && (
          <View>
            <Text style={[styles.stepTitle, { color: theme.text }]}>
              {isVendor ? '4. CAC Certificate Upload' : '4. Verification Photos & Government ID'}
            </Text>
            <Text style={[styles.stepDescription, { color: theme.lightText }]}>
              {isVendor
                ? 'Upload a scan of your Corporate Affairs Commission business certificate (PDF or Image).'
                : 'Upload both required photos (Passport Photograph & Action Picture) and your government-issued ID card.'}
            </Text>

            {/* HANDYMAN & RIDER: 2 Required Photos */}
            {isHandymanOrRider && (
              <View style={{ marginBottom: 20 }}>
                {/* 1. Passport Photo */}
                <View style={[styles.photoCard, { borderColor: theme.border }]}>
                  <View style={styles.photoCardHeader}>
                    <Text style={[styles.photoNumberBadge, { backgroundColor: theme.primary }]}>1</Text>
                    <View style={{ flex: 1, marginLeft: 8 }}>
                      <Text style={[styles.photoCardTitle, { color: theme.text }]}>Passport Photograph</Text>
                      <Text style={[styles.photoCardSub, { color: theme.lightText }]}>Clear portrait showing your face</Text>
                    </View>
                    {passportPhoto && <Text style={styles.photoBadgeSuccess}>Uploaded ✓</Text>}
                  </View>

                  {passportPhoto ? (
                    <View style={styles.photoPreviewRow}>
                      <Image source={{ uri: getImageUri(passportPhoto) ?? undefined }} style={styles.photoThumbnail} />
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: theme.text }}>Passport Photo</Text>
                        <Text style={{ fontSize: 11, color: '#34C759', marginTop: 2 }}>Ready for Admin Review</Text>
                        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                          <TouchableOpacity 
                            style={[styles.smallBtn, { borderColor: theme.border }]} 
                            onPress={() => showPhotoOptions('passport')}
                          >
                            <Text style={[styles.smallBtnText, { color: theme.text }]}>Change</Text>
                          </TouchableOpacity>
                          <TouchableOpacity 
                            style={styles.smallRemoveBtn} 
                            onPress={() => setPassportPhoto(null)}
                          >
                            <Text style={styles.smallRemoveBtnText}>Remove</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  ) : (
                    <View>
                      {uploadingPassport ? (
                        <View style={styles.uploadingBox}>
                          <ActivityIndicator color={theme.primary} size="small" />
                          <Text style={[styles.uploadingText, { color: theme.lightText }]}>Uploading photo...</Text>
                        </View>
                      ) : (
                        <TouchableOpacity 
                          style={[styles.btn, { backgroundColor: theme.primary, height: 44, borderRadius: 10 }]}
                          onPress={() => showPhotoOptions('passport')}
                        >
                          <Text style={styles.btnText}>📸 Select / Take Passport Photo</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                </View>

                {/* 2. Action Picture */}
                <View style={[styles.photoCard, { borderColor: theme.border, marginTop: 12 }]}>
                  <View style={styles.photoCardHeader}>
                    <Text style={[styles.photoNumberBadge, { backgroundColor: theme.primary }]}>2</Text>
                    <View style={{ flex: 1, marginLeft: 8 }}>
                      <Text style={[styles.photoCardTitle, { color: theme.text }]}>
                        {userInfo?.role === 'HANDYMAN' ? 'Action Picture (At Work / Tools)' : 'Action Picture (With Vehicle)'}
                      </Text>
                      <Text style={[styles.photoCardSub, { color: theme.lightText }]}>
                        {userInfo?.role === 'HANDYMAN' ? 'Photo of you doing repairs / with tools' : 'Photo of you with your delivery vehicle'}
                      </Text>
                    </View>
                    {actionPhoto && <Text style={styles.photoBadgeSuccess}>Uploaded ✓</Text>}
                  </View>

                  {actionPhoto ? (
                    <View style={styles.photoPreviewRow}>
                      <Image source={{ uri: getImageUri(actionPhoto) ?? undefined }} style={styles.photoThumbnail} />
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: theme.text }}>Action Picture</Text>
                        <Text style={{ fontSize: 11, color: '#34C759', marginTop: 2 }}>Ready for Admin Review</Text>
                        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                          <TouchableOpacity 
                            style={[styles.smallBtn, { borderColor: theme.border }]} 
                            onPress={() => showPhotoOptions('action')}
                          >
                            <Text style={[styles.smallBtnText, { color: theme.text }]}>Change</Text>
                          </TouchableOpacity>
                          <TouchableOpacity 
                            style={styles.smallRemoveBtn} 
                            onPress={() => setActionPhoto(null)}
                          >
                            <Text style={styles.smallRemoveBtnText}>Remove</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  ) : (
                    <View>
                      {uploadingAction ? (
                        <View style={styles.uploadingBox}>
                          <ActivityIndicator color={theme.primary} size="small" />
                          <Text style={[styles.uploadingText, { color: theme.lightText }]}>Uploading photo...</Text>
                        </View>
                      ) : (
                        <TouchableOpacity 
                          style={[styles.btn, { backgroundColor: theme.primary, height: 44, borderRadius: 10 }]}
                          onPress={() => showPhotoOptions('action')}
                        >
                          <Text style={styles.btnText}>
                            {userInfo?.role === 'HANDYMAN' ? '🛠️ Select / Take Action Photo' : '🏍️ Select / Take Action Photo'}
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                </View>
              </View>
            )}

            {/* 3. Government ID / CAC Certificate */}
            <Text style={[styles.stepTitle, { color: theme.text, fontSize: 15, marginBottom: 6 }]}>
              {isVendor ? 'Business Certificate' : '3. Government ID Card'}
            </Text>

            {!uploadedDocName ? (
              <TouchableOpacity 
                style={[styles.uploadBox, { borderColor: theme.border }]} 
                onPress={() => simulateDocUpload(isVendor ? 'cac' : 'id')}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator size="large" color={theme.primary} />
                ) : (
                  <View style={{ alignItems: 'center' }}>
                    <Text style={{ fontSize: 32 }}>📁</Text>
                    <Text style={[styles.uploadTitle, { color: theme.text }]}>Select ID Card / Certificate File</Text>
                    <Text style={[styles.uploadSubtitle, { color: theme.lightText }]}>Supports JPG, PNG, PDF up to 5MB</Text>
                  </View>
                )}
              </TouchableOpacity>
            ) : (
              <View style={[styles.uploadBoxSuccess, { borderColor: theme.primary }]}>
                <Text style={{ fontSize: 32 }}>📄</Text>
                <Text style={[styles.uploadTitle, { color: theme.text, marginTop: 8 }]}>
                  {uploadedDocName}
                </Text>
                <Text style={[styles.uploadSubtitle, { color: '#34C759', fontWeight: '600' }]}>
                  File successfully captured
                </Text>
                
                <TouchableOpacity 
                  style={[styles.btnSecondary, { borderColor: theme.border, marginTop: 16 }]} 
                  onPress={() => setUploadedDocName(null)}
                >
                  <Text style={[styles.btnSecondaryText, { color: theme.text }]}>Remove File</Text>
                </TouchableOpacity>
              </View>
            )}

            <TouchableOpacity 
              style={[styles.btn, { backgroundColor: theme.primary, marginTop: 24 }]} 
              onPress={() => {
                if (isHandymanOrRider && (!passportPhoto || !actionPhoto)) {
                  Alert.alert(
                    'Photos Recommended',
                    'You have not uploaded both required photos (Passport Photo & Action Picture). You can proceed now and update them later in your profile, but complete photos are required for Admin approval.',
                    [
                      { text: 'Upload Photos First', style: 'cancel' },
                      { text: 'Proceed Anyway', onPress: () => setCurrentStep(5) },
                    ]
                  );
                  return;
                }
                setCurrentStep(5);
              }}
            >
              <Text style={styles.btnText}>Proceed to Payout Configuration</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* STEP 5: OPAY WALLET */}
        {currentStep === 5 && (
          <View>
            <Text style={[styles.stepTitle, { color: theme.text }]}>5. Link OPay Wallet</Text>
            <Text style={[styles.stepDescription, { color: theme.lightText }]}>
              Enter your OPay Wallet account number (this is the phone number associated with your OPay App). All earnings and payouts will be sent directly here.
            </Text>

            <TextInput
              style={[styles.input, { borderColor: theme.border, color: theme.text }]}
              placeholder="OPay Phone Number (e.g. 08012345678)"
              keyboardType="phone-pad"
              maxLength={11}
              value={opayPhone}
              onChangeText={setOpayPhone}
              placeholderTextColor={theme.lightText}
            />

            <View style={[styles.summaryCard, { backgroundColor: theme.background }]}>
              <Text style={[styles.summaryTitle, { color: theme.text }]}>Verify Summary</Text>
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryLabel, { color: theme.lightText }]}>BVN Name</Text>
                <Text style={[styles.summaryVal, { color: theme.text }]}>{bvnMatchedData?.formatted_name}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryLabel, { color: theme.lightText }]}>NIN</Text>
                <Text style={[styles.summaryVal, { color: theme.text }]}>{ninMatchedData ? 'Verified ✓' : 'Skipped'}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryLabel, { color: theme.lightText }]}>Biometric Selfie</Text>
                <Text style={[styles.summaryVal, { color: theme.text }]}>Passed ✓</Text>
              </View>
              {isHandymanOrRider && (
                <>
                  <View style={styles.summaryRow}>
                    <Text style={[styles.summaryLabel, { color: theme.lightText }]}>Passport Photo</Text>
                    <Text style={[styles.summaryVal, { color: passportPhoto ? '#34C759' : '#FF9500' }]}>
                      {passportPhoto ? 'Uploaded ✓' : '⚠️ Missing'}
                    </Text>
                  </View>
                  <View style={styles.summaryRow}>
                    <Text style={[styles.summaryLabel, { color: theme.lightText }]}>Action Picture</Text>
                    <Text style={[styles.summaryVal, { color: actionPhoto ? '#34C759' : '#FF9500' }]}>
                      {actionPhoto ? 'Uploaded ✓' : '⚠️ Missing'}
                    </Text>
                  </View>
                </>
              )}
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryLabel, { color: theme.lightText }]}>Verification Status</Text>
                <Text style={[styles.summaryVal, { color: theme.primary, fontWeight: '700' }]}>PENDING REVIEW</Text>
              </View>
            </View>

            <TouchableOpacity 
              style={[styles.btn, { backgroundColor: theme.primary }]} 
              onPress={handleFinalSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.btnText}>Complete & Submit Verification</Text>
              )}
            </TouchableOpacity>
          </View>
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
    paddingBottom: 60,
    flexGrow: 1,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 24,
  },
  progressContainer: {
    marginBottom: 24,
  },
  progressBarBackground: {
    height: 8,
    backgroundColor: '#E5E5EA',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressText: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 6,
    textAlign: 'right',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 10,
    elevation: 2,
  },
  stepTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 10,
  },
  stepDescription: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 20,
  },
  input: {
    height: 52,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 15,
    marginBottom: 20,
  },
  consentBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  consentCheck: {
    fontSize: 24,
    marginRight: 10,
  },
  consentLabel: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
  },
  btn: {
    height: 52,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  btnSecondary: {
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
  },
  btnSecondaryText: {
    fontSize: 15,
    fontWeight: '600',
  },
  badgeSuccess: {
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    borderStyle: 'dashed',
  },
  successName: {
    fontSize: 16,
    fontWeight: '700',
  },
  successDob: {
    fontSize: 13,
    marginTop: 4,
  },
  cameraWrapper: {
    width: 220,
    height: 220,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    marginTop: 10,
  },
  cameraCircle: {
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 3,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1C1C1E',
  },
  faceSilhouette: {
    width: 110,
    height: 140,
    borderRadius: 55,
    borderWidth: 2.5,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    borderStyle: 'dashed',
    position: 'absolute',
  },
  scanLine: {
    width: '100%',
    height: 3,
    position: 'absolute',
    top: 0,
    opacity: 0.8,
  },
  livenessInstructText: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 24,
  },
  uploadBox: {
    height: 160,
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  uploadBoxSuccess: {
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    padding: 20,
    alignItems: 'center',
  },
  uploadTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginTop: 12,
  },
  uploadSubtitle: {
    fontSize: 12,
    marginTop: 4,
  },
  summaryCard: {
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
    marginBottom: 24,
  },
  summaryTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  summaryLabel: {
    fontSize: 13,
  },
  summaryVal: {
    fontSize: 13,
    fontWeight: '600',
  },
  // Photo Upload Cards
  photoCard: {
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 14,
  },
  photoCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  photoNumberBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 22,
  },
  photoCardTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  photoCardSub: {
    fontSize: 11,
    marginTop: 1,
  },
  photoBadgeSuccess: {
    fontSize: 11,
    fontWeight: '700',
    color: '#16A34A',
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  photoPreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    borderRadius: 10,
  },
  photoThumbnail: {
    width: 64,
    height: 64,
    borderRadius: 10,
    backgroundColor: '#E2E8F0',
  },
  smallBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  smallBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  smallRemoveBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  smallRemoveBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#EF4444',
  },
  uploadingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 8,
  },
  uploadingText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
