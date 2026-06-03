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
  Dimensions,
} from 'react-native';
import apiClient from '../api/client';
import { AuthContext } from '../context/AuthContext';
import { SettingsContext } from '../context/SettingsContext';

const { width } = Dimensions.get('window');

export default function KYCVerificationScreen({ route, navigation }: any) {
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

  // Step 4: Documents
  const [uploadedDocName, setUploadedDocName] = useState<string | null>(null);
  const isVendor = userInfo?.role === 'VENDOR';

  // Step 5: OPay Wallet Link
  const [opayPhone, setOpayPhone] = useState(userInfo?.phone || '');

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
      const response = await apiClient.post('/kyc/submit', {
        bvn,
        opayPhone,
        referenceId: livenessRef,
      });

      if (response.data.success) {
        await refreshUser();
        Alert.alert('KYC Submitted', 'Verification documents successfully filed. Status: Pending Review.', [
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

        {/* STEP 4: CAC / DOCUMENTS */}
        {currentStep === 4 && (
          <View>
            <Text style={[styles.stepTitle, { color: theme.text }]}>
              {isVendor ? '4. CAC Certificate Upload' : '4. Government ID Upload'}
            </Text>
            <Text style={[styles.stepDescription, { color: theme.lightText }]}>
              {isVendor
                ? 'Upload a scan of your Corporate Affairs Commission business certificate (PDF or Image).'
                : 'Upload a clear front photo of your government-issued ID card.'}
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
                    <Text style={[styles.uploadTitle, { color: theme.text }]}>Select Certificate File</Text>
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

            {uploadedDocName && (
              <TouchableOpacity 
                style={[styles.btn, { backgroundColor: theme.primary, marginTop: 24 }]} 
                onPress={() => setCurrentStep(5)}
              >
                <Text style={styles.btnText}>Proceed to Payout Configuration</Text>
              </TouchableOpacity>
            )}
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
    padding: 24,
    paddingBottom: 60,
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
});
