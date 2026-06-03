import React, { useState, useEffect, useContext } from 'react';
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity, ScrollView,
  Alert, ActivityIndicator, Modal, Image, Platform
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import apiClient from '../api/client';
import { AuthContext } from '../context/AuthContext';
import { SettingsContext } from '../context/SettingsContext';

// ─── AI Filter Configuration ────────────────────────────────────────────────
const AI_FILTERS = [
  { id: 'none',     label: 'Original',      icon: '🖼️',  tint: 'transparent',            description: 'No filter applied' },
  { id: 'auto',     label: 'AI Enhance',    icon: '✨',  tint: 'rgba(255,255,255,0.05)', description: 'Auto brightness & contrast' },
  { id: 'cyberpunk',label: 'Cyberpunk',     icon: '🌆',  tint: 'rgba(0,200,255,0.18)',   description: 'Cool neon blue & pink tones' },
  { id: 'vintage',  label: 'Vintage Noir',  icon: '🎞️',  tint: 'rgba(100,80,60,0.22)',   description: 'High-contrast black & white' },
  { id: 'golden',   label: 'Golden Hour',   icon: '🌅',  tint: 'rgba(255,160,0,0.18)',   description: 'Warm amber sunlight tones' },
  { id: 'vivid',    label: 'Vivid HDR',     icon: '🎨',  tint: 'rgba(80,0,160,0.12)',    description: 'Rich, saturated colors' },
];

export default function AdminScreen() {
  const { userInfo } = useContext(AuthContext);
  const { theme, settings, updateSettings } = useContext(SettingsContext);

  const isVendor = userInfo?.role === 'VENDOR';
  const isAdmin  = userInfo?.role === 'ADMIN';

  const [activeTab, setActiveTab] = useState<'products' | 'services' | 'settings' | 'bookings' | 'users' | 'kyc'>(
    'products'
  );

  // Products state
  const [products, setProducts]             = useState<any[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [name, setName]                     = useState('');
  const [description, setDescription]       = useState('');
  const [price, setPrice]                   = useState('');
  const [stock, setStock]                   = useState('');
  const [category, setCategory]             = useState('');
  const [imageUrl, setImageUrl]             = useState('');   // final uploaded URL
  const [editingId, setEditingId]           = useState<string | null>(null);

  // ── AI Image Enhancer Modal State ──────────────────────────────────────────
  const [showImageModal, setShowImageModal]   = useState(false);
  const [imageTarget, setImageTarget]         = useState<'product' | 'logo' | 'favicon'>('product');
  const [pickedImageUri, setPickedImageUri]   = useState<string | null>(null);
  const [selectedFilter, setSelectedFilter]   = useState('none');
  const [uploadingImage, setUploadingImage]   = useState(false);
  const [uploadedSizeKB, setUploadedSizeKB]   = useState<string | null>(null);

  // Services state (Admin only)
  const [services, setServices]               = useState<any[]>([]);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [serviceName, setServiceName]         = useState('');
  const [serviceDesc, setServiceDesc]         = useState('');
  const [serviceCategory, setServiceCategory] = useState('Plumbing');
  const [serviceBasePrice, setServiceBasePrice] = useState('');
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);

  // System Settings state (Admin only)
  const [logoUrlInput, setLogoUrlInput]               = useState('');
  const [faviconUrlInput, setFaviconUrlInput]         = useState('');
  const [heroTitleInput, setHeroTitleInput]           = useState('');
  const [heroSubtitleInput, setHeroSubtitleInput]     = useState('');
  const [footerTextInput, setFooterTextInput]         = useState('');
  const [primaryColorInput, setPrimaryColorInput]     = useState('');
  const [secondaryColorInput, setSecondaryColorInput] = useState('');
  const [backgroundColorInput, setBackgroundColorInput] = useState('');
  const [gatewayActive, setGatewayActive]             = useState('NONE');
  const [stripePubKey, setStripePubKey]               = useState('');
  const [stripeSecKey, setStripeSecKey]               = useState('');
  const [stripeWebhookSec, setStripeWebhookSec]       = useState('');
  const [paystackPubKey, setPaystackPubKey]           = useState('');
  const [paystackSecKey, setPaystackSecKey]           = useState('');
  const [flutterwavePubKey, setFlutterwavePubKey]     = useState('');
  const [flutterwaveSecKey, setFlutterwaveSecKey]     = useState('');
  const [opayMerchantId, setOpayMerchantId]           = useState('');
  const [opayPublicKey, setOpayPublicKey]             = useState('');
  const [opaySecretKey, setOpaySecretKey]             = useState('');

  const [loading, setLoading]               = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);

  // Bookings state (Admin only)
  const [bookings, setBookings]                   = useState<any[]>([]);
  const [bookingsLoading, setBookingsLoading]     = useState(false);
  const [updatingBookingId, setUpdatingBookingId] = useState<string | null>(null);

  // Users state (Admin only)
  const [users, setUsers]                   = useState<any[]>([]);
  const [usersLoading, setUsersLoading]     = useState(false);

  // KYC Reviews state (Admin only)
  const [kycReviews, setKycReviews]                 = useState<any[]>([]);
  const [kycLoading, setKycLoading]                 = useState(false);
  const [reviewingUserId, setReviewingUserId]       = useState<string | null>(null);
  const [rejectionReasonInput, setRejectionReasonInput] = useState('');

  // ─── Data Fetching ───────────────────────────────────────────────────────
  const fetchData = async () => {
    try {
      setProductsLoading(true);
      const endpoint = isVendor ? '/products/vendor/all' : '/products';
      const prodRes = await apiClient.get(endpoint);
      setProducts(prodRes.data);
    } catch (error) {
      console.error('Failed to load products', error);
    } finally {
      setProductsLoading(false);
    }

    if (isAdmin) {
      try {
        setServicesLoading(true);
        const servRes = await apiClient.get('/services');
        setServices(servRes.data);
      } catch (error) {
        console.error('Failed to load services', error);
      } finally {
        setServicesLoading(false);
      }
    }
  };

  const fetchBookings = async () => {
    setBookingsLoading(true);
    try {
      const res = await apiClient.get('/bookings/admin/all');
      setBookings(res.data);
    } catch (e) {
      console.error('Failed to load admin bookings', e);
    } finally {
      setBookingsLoading(false);
    }
  };

  const fetchUsers = async () => {
    setUsersLoading(true);
    try {
      const res = await apiClient.get('/users');
      setUsers(res.data.users || []);
    } catch (e) {
      console.error('Failed to load users', e);
    } finally {
      setUsersLoading(false);
    }
  };

  const handleUpdateBookingStatus = async (bookingId: string, status: string) => {
    setUpdatingBookingId(bookingId);
    try {
      await apiClient.patch(`/bookings/${bookingId}/status`, { status });
      Alert.alert('Updated', `Booking status changed to ${status}.`);
      fetchBookings();
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.error || 'Failed to update booking status.');
    } finally {
      setUpdatingBookingId(null);
    }
  };

  const fetchKycReviews = async () => {
    setKycLoading(true);
    try {
      const res = await apiClient.get('/kyc/admin/reviews');
      setKycReviews(res.data.reviews || []);
    } catch (e) {
      console.error('Failed to load KYC reviews', e);
    } finally {
      setKycLoading(false);
    }
  };

  const handleReviewKYC = async (targetUserId: string, status: 'VERIFIED' | 'REJECTED') => {
    if (status === 'REJECTED' && !rejectionReasonInput.trim()) {
      Alert.alert('Reason Required', 'Please enter a rejection reason.');
      return;
    }
    setLoading(true);
    try {
      await apiClient.patch(`/kyc/${targetUserId}/review`, {
        status,
        reason: status === 'REJECTED' ? rejectionReasonInput : undefined,
      });
      Alert.alert('Decision Logged', `KYC status set to ${status}.`);
      setRejectionReasonInput('');
      setReviewingUserId(null);
      fetchKycReviews();
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.error || 'Failed to submit review.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    if (isAdmin) {
      fetchBookings();
      fetchUsers();
      fetchKycReviews();
    }
  }, []);

  useEffect(() => {
    if (settings) {
      setLogoUrlInput(settings.logo_url || '');
      setFaviconUrlInput(settings.favicon_url || '');
      setHeroTitleInput(settings.hero_title || '');
      setHeroSubtitleInput(settings.hero_subtitle || '');
      setFooterTextInput(settings.footer_text || '');
      setPrimaryColorInput(settings.primary_color || '#007AFF');
      setSecondaryColorInput(settings.secondary_color || '#5856D6');
      setBackgroundColorInput(settings.background_color || '#F8F9FA');
      setGatewayActive(settings.payment_gateway_active || 'NONE');
      setStripePubKey(settings.stripe_public_key || '');
      setStripeSecKey(settings.stripe_secret_key || '');
      setStripeWebhookSec(settings.stripe_webhook_secret || '');
      setPaystackPubKey(settings.paystack_public_key || '');
      setPaystackSecKey(settings.paystack_secret_key || '');
      setFlutterwavePubKey(settings.flutterwave_public_key || '');
      setFlutterwaveSecKey(settings.flutterwave_secret_key || '');
      setOpayMerchantId(settings.opay_merchant_id || '');
      setOpayPublicKey(settings.opay_public_key || '');
      setOpaySecretKey(settings.opay_secret_key || '');
    }
  }, [settings]);

  // ─── AI Image Picker & Upload ─────────────────────────────────────────────
  const handlePickImage = async (target: 'product' | 'logo' | 'favicon' = 'product') => {
    if (Platform.OS !== 'web') {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission Required',
          'Please grant photo library access to upload images.',
        );
        return;
      }
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 1,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const asset = result.assets[0];
      if (asset.fileSize && asset.fileSize > 2000000) {
        Alert.alert('File too large', 'Please select an image smaller than 2MB.');
        return;
      }
      setImageTarget(target);
      setPickedImageUri(asset.uri);
      setSelectedFilter('none');
      setUploadedSizeKB(null);
      setShowImageModal(true);
    }
  };

  const handleApplyAndUpload = async () => {
    if (!pickedImageUri) return;
    setUploadingImage(true);

    try {
      const formData = new FormData();
      const filename = pickedImageUri.split('/').pop() || 'image.jpg';
      const ext      = filename.split('.').pop()?.toLowerCase() || 'jpg';
      const mimeType = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : 'image/jpeg';

      formData.append('image', {
        uri:  pickedImageUri,
        name: filename,
        type: mimeType,
      } as any);
      formData.append('filter', selectedFilter);

      const response = await apiClient.post('/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 30_000,
      });

      if (response.data.success) {
        if (imageTarget === 'product') {
          setImageUrl(response.data.imageUrl);
        } else if (imageTarget === 'logo') {
          setLogoUrlInput(response.data.imageUrl);
        } else if (imageTarget === 'favicon') {
          setFaviconUrlInput(response.data.imageUrl);
        }
        
        setUploadedSizeKB(response.data.sizeKB);
        Alert.alert(
          '✅ Upload Successful',
          `Image processed with "${selectedFilter}" filter.\nCompressed to ${response.data.sizeKB} (under 50KB limit).`,
        );
        setShowImageModal(false);
        setPickedImageUri(null);
      }
    } catch (err: any) {
      Alert.alert('Upload Failed', err.response?.data?.error || 'Image processing failed. Please try again.');
    } finally {
      setUploadingImage(false);
    }
  };

  // ─── Product Actions ──────────────────────────────────────────────────────
  const handleSaveProduct = async () => {
    if (isVendor && userInfo?.verificationStatus !== 'VERIFIED') {
      Alert.alert(
        'Verification Required',
        'Your vendor account must be fully verified before you can list or update products.'
      );
      return;
    }
    if (!name || !price) {
      Alert.alert('Error', 'Name and Price are required.');
      return;
    }
    setLoading(true);
    try {
      const payload = {
        name,
        description,
        price: parseFloat(price),
        stock: parseInt(stock, 10) || 0,
        category,
        imageUrl,
      };

      if (editingId) {
        await apiClient.put(`/products/${editingId}`, payload);
        Alert.alert('Success', 'Product updated successfully!');
      } else {
        await apiClient.post('/products', payload);
        Alert.alert('Success', 'Product created successfully!');
      }
      resetProductForm();
      fetchData();
    } catch (error: any) {
      console.error(error);
      Alert.alert('Error', error.response?.data?.error || 'Failed to save product.');
    } finally {
      setLoading(false);
    }
  };

  const handleEditProduct = (product: any) => {
    setEditingId(product.id);
    setName(product.name);
    setDescription(product.description || '');
    setPrice(product.price.toString());
    setStock(product.stock.toString());
    setCategory(product.category || '');
    setImageUrl(product.imageUrl || '');
    setUploadedSizeKB(null);
  };

  const handleDeleteProduct = async (id: string) => {
    Alert.alert('Delete', 'Delete this product?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await apiClient.delete(`/products/${id}`);
            Alert.alert('Deleted', 'Product deleted.');
            fetchData();
          } catch (e) {
            Alert.alert('Error', 'Failed to delete.');
          }
        }
      }
    ]);
  };

  const handleBoostProduct = async (id: string) => {
    try {
      const response = await apiClient.patch(`/products/${id}/boost`);
      Alert.alert(
        response.data.featured ? '🚀 Promoted!' : 'Boost Deactivated',
        response.data.featured
          ? 'This ad will now sort at the top of search lists!'
          : 'Removed from promoted listing list.'
      );
      fetchData();
    } catch (e) {
      Alert.alert('Error', 'Failed to update boost status.');
    }
  };

  const resetProductForm = () => {
    setEditingId(null);
    setName('');
    setDescription('');
    setPrice('');
    setStock('');
    setCategory('');
    setImageUrl('');
    setPickedImageUri(null);
    setUploadedSizeKB(null);
  };

  // ─── Service Actions ──────────────────────────────────────────────────────
  const handleSaveService = async () => {
    if (!serviceName || !serviceBasePrice) {
      Alert.alert('Error', 'Service name and base price are required.');
      return;
    }
    setLoading(true);
    try {
      const payload = {
        name: serviceName,
        description: serviceDesc,
        category: serviceCategory,
        basePrice: parseFloat(serviceBasePrice),
      };
      if (editingServiceId) {
        await apiClient.put(`/services/${editingServiceId}`, payload);
        Alert.alert('Success', 'Service catalog updated!');
      } else {
        await apiClient.post('/services', payload);
        Alert.alert('Success', 'Service created successfully!');
      }
      resetServiceForm();
      fetchData();
    } catch (e) {
      Alert.alert('Error', 'Failed to save service.');
    } finally {
      setLoading(false);
    }
  };

  const handleEditService = (service: any) => {
    setEditingServiceId(service.id);
    setServiceName(service.name);
    setServiceDesc(service.description);
    setServiceCategory(service.category);
    setServiceBasePrice(service.basePrice.toString());
  };

  const handleDeleteService = async (id: string) => {
    Alert.alert('Delete', 'Delete this service category?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await apiClient.delete(`/services/${id}`);
            fetchData();
          } catch (e) {
            Alert.alert('Error', 'Failed to delete service.');
          }
        }
      }
    ]);
  };

  const handleBoostService = async (id: string) => {
    try {
      const response = await apiClient.patch(`/services/${id}/boost`);
      Alert.alert(response.data.featured ? '🚀 Promoted!' : 'Boost Deactivated');
      fetchData();
    } catch (e) {
      Alert.alert('Error', 'Failed to boost.');
    }
  };

  const resetServiceForm = () => {
    setEditingServiceId(null);
    setServiceName('');
    setServiceDesc('');
    setServiceCategory('Plumbing');
    setServiceBasePrice('');
  };

  // ─── Settings Save ────────────────────────────────────────────────────────
  const handleSaveSettings = async () => {
    setSettingsSaving(true);
    try {
      const updates = {
        logo_url:                 logoUrlInput,
        favicon_url:              faviconUrlInput,
        hero_title:               heroTitleInput,
        hero_subtitle:            heroSubtitleInput,
        footer_text:              footerTextInput,
        primary_color:            primaryColorInput,
        secondary_color:          secondaryColorInput,
        background_color:         backgroundColorInput,
        payment_gateway_active:   gatewayActive,
        stripe_public_key:        stripePubKey,
        stripe_secret_key:        stripeSecKey,
        stripe_webhook_secret:    stripeWebhookSec,
        paystack_public_key:      paystackPubKey,
        paystack_secret_key:      paystackSecKey,
        flutterwave_public_key:   flutterwavePubKey,
        flutterwave_secret_key:   flutterwaveSecKey,
        opay_merchant_id:         opayMerchantId,
        opay_public_key:          opayPublicKey,
        opay_secret_key:          opaySecretKey,
      };
      await updateSettings(updates);
      Alert.alert('Branding Updated', 'System configurations updated successfully across all client devices.');
    } catch (e) {
      Alert.alert('Error', 'Failed to save system configurations.');
    } finally {
      setSettingsSaving(false);
    }
  };

  // ─── AI Image Enhancer Modal ──────────────────────────────────────────────
  const activeFilterObj = AI_FILTERS.find(f => f.id === selectedFilter) || AI_FILTERS[0];

  const renderImageModal = () => (
    <Modal
      visible={showImageModal}
      animationType="slide"
      transparent={false}
      onRequestClose={() => !uploadingImage && setShowImageModal(false)}
    >
      <View style={styles.modalContainer}>
        {/* Header */}
        <View style={styles.modalHeader}>
          <TouchableOpacity
            onPress={() => !uploadingImage && setShowImageModal(false)}
            style={styles.modalCloseBtn}
          >
            <Text style={styles.modalCloseText}>✕</Text>
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={styles.modalTitle}>✨ AI Image Enhancer</Text>
            <Text style={styles.modalSubtitle}>Auto-compressed to under 50KB</Text>
          </View>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalScroll}>
          {/* Image Preview */}
          {pickedImageUri && (
            <View style={styles.imagePreviewContainer}>
              <Image
                source={{ uri: pickedImageUri }}
                style={styles.imagePreview}
                resizeMode="cover"
              />
              {/* Filter Tint Overlay */}
              <View
                style={[
                  styles.filterTintOverlay,
                  { backgroundColor: activeFilterObj.tint },
                ]}
              />
              {/* Filter Badge */}
              <View style={styles.filterBadge}>
                <Text style={styles.filterBadgeText}>
                  {activeFilterObj.icon} {activeFilterObj.label}
                </Text>
              </View>
            </View>
          )}

          {/* Filter Description */}
          <View style={styles.filterDescBox}>
            <Text style={styles.filterDescIcon}>{activeFilterObj.icon}</Text>
            <View>
              <Text style={styles.filterDescLabel}>{activeFilterObj.label}</Text>
              <Text style={styles.filterDescDetail}>{activeFilterObj.description}</Text>
            </View>
          </View>

          {/* Filter Selector Grid */}
          <Text style={styles.filterSectionLabel}>SELECT AI FILTER</Text>
          <View style={styles.filterGrid}>
            {AI_FILTERS.map(filter => (
              <TouchableOpacity
                key={filter.id}
                style={[
                  styles.filterCard,
                  selectedFilter === filter.id && [
                    styles.filterCardActive,
                    { borderColor: theme.primary },
                  ],
                ]}
                onPress={() => setSelectedFilter(filter.id)}
                disabled={uploadingImage}
              >
                {pickedImageUri && (
                  <View style={styles.filterThumbContainer}>
                    <Image
                      source={{ uri: pickedImageUri }}
                      style={styles.filterThumb}
                      resizeMode="cover"
                    />
                    <View style={[styles.filterThumbTint, { backgroundColor: filter.tint }]} />
                  </View>
                )}
                <Text style={[
                  styles.filterCardIcon,
                  selectedFilter === filter.id && { color: theme.primary },
                ]}>
                  {filter.icon}
                </Text>
                <Text style={[
                  styles.filterCardLabel,
                  selectedFilter === filter.id && { color: theme.primary, fontWeight: '800' },
                ]}>
                  {filter.label}
                </Text>
                {selectedFilter === filter.id && (
                  <View style={[styles.filterCheckBadge, { backgroundColor: theme.primary }]}>
                    <Text style={styles.filterCheckText}>✓</Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>

          {/* Compression Info */}
          <View style={styles.compressionInfoCard}>
            <Text style={styles.compressionInfoTitle}>🤖 AI Compression Pipeline</Text>
            <Text style={styles.compressionInfoText}>
              Your image is processed server-side with the chosen filter, then recursively scaled
              until it meets the strict <Text style={{ fontWeight: '800' }}>50KB maximum</Text> for
              fast mobile loading across all network conditions.
            </Text>
          </View>
        </ScrollView>

        {/* Upload Button */}
        <View style={styles.modalFooter}>
          <TouchableOpacity
            style={[
              styles.uploadApplyBtn,
              { backgroundColor: theme.primary },
              uploadingImage && { opacity: 0.7 },
            ]}
            onPress={handleApplyAndUpload}
            disabled={uploadingImage}
          >
            {uploadingImage ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <ActivityIndicator color="#fff" />
                <Text style={styles.uploadApplyBtnText}>Compressing & Uploading…</Text>
              </View>
            ) : (
              <Text style={styles.uploadApplyBtnText}>
                Apply {activeFilterObj.icon} & Upload Image
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <View style={[styles.mainContainer, { backgroundColor: theme.background }]}>
      {renderImageModal()}

      {/* Tab bar for Admins */}
      {isAdmin && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tabScrollContainer}
          contentContainerStyle={styles.tabContentContainer}
        >
          {[
            { id: 'products',  label: '📦 Inventory' },
            { id: 'services',  label: '⚡ Services' },
            { id: 'bookings',  label: '📋 Bookings' },
            { id: 'users',     label: '👥 Users' },
            { id: 'settings',  label: '⚙️ Settings' },
            { id: 'kyc',       label: '🔍 KYC Reviews' },
          ].map(tab => (
            <TouchableOpacity
              key={tab.id}
              style={[styles.tabButton, activeTab === tab.id && { borderBottomColor: theme.primary }]}
              onPress={() => {
                setActiveTab(tab.id as any);
                if (tab.id === 'kyc') fetchKycReviews();
              }}
            >
              <Text style={[styles.tabText, activeTab === tab.id && { color: theme.primary, fontWeight: '700' }]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">

        {/* ── PRODUCTS TAB ── */}
        {activeTab === 'products' && (
          <View>
            <Text style={styles.formTitle}>
              {editingId ? 'Edit Product Details' : 'List New Product'}
            </Text>

            <View style={styles.card}>
              <View style={styles.formGroup}>
                <Text style={styles.label}>Product Name *</Text>
                <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="e.g. Cordless Power Drill" />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Description</Text>
                <TextInput style={[styles.input, styles.textArea]} value={description} onChangeText={setDescription} placeholder="Enter description..." multiline numberOfLines={3} />
              </View>

              <View style={styles.row}>
                <View style={[styles.formGroup, { flex: 1, marginRight: 8 }]}>
                  <Text style={styles.label}>Price (₦) *</Text>
                  <TextInput style={styles.input} value={price} onChangeText={setPrice} keyboardType="numeric" placeholder="0.00" />
                </View>
                <View style={[styles.formGroup, { flex: 1, marginLeft: 8 }]}>
                  <Text style={styles.label}>Stock *</Text>
                  <TextInput style={styles.input} value={stock} onChangeText={setStock} keyboardType="numeric" placeholder="0" />
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Category</Text>
                <TextInput style={styles.input} value={category} onChangeText={setCategory} placeholder="e.g. Tools, Hardware" />
              </View>

              {/* ── AI Image Upload (replaces URL textbox) ── */}
              <View style={styles.formGroup}>
                <Text style={styles.label}>Product Image</Text>

                {imageUrl ? (
                  <View style={styles.imageSuccessContainer}>
                    <Image source={{ uri: imageUrl }} style={styles.imageSuccessPreview} resizeMode="cover" />
                    <View style={styles.imageSuccessInfo}>
                      <Text style={styles.imageSuccessTitle}>✅ Image Uploaded</Text>
                      {uploadedSizeKB && (
                        <Text style={styles.imageSuccessSize}>🗜️ {uploadedSizeKB} (under 50KB)</Text>
                      )}
                      <TouchableOpacity
                        style={[styles.imageChangeBtn, { borderColor: theme.primary }]}
                        onPress={handlePickImage}
                      >
                        <Text style={[styles.imageChangeBtnText, { color: theme.primary }]}>Change Image</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[styles.imagePickerBox, { borderColor: theme.border || '#CED4DA' }]}
                    onPress={() => handlePickImage('product')}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.imagePickerIcon}>🖼️</Text>
                    <Text style={styles.imagePickerTitle}>Upload Product Image</Text>
                    <Text style={styles.imagePickerSubtitle}>Tap to pick from gallery</Text>
                    <View style={[styles.imagePickerBadge, { backgroundColor: theme.primary + '18' }]}>
                      <Text style={[styles.imagePickerBadgeText, { color: theme.primary }]}>
                        ✨ AI Filter + Auto-Compress to 50KB
                      </Text>
                    </View>
                  </TouchableOpacity>
                )}
              </View>

              <View style={styles.btnRow}>
                <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: theme.primary }]} onPress={handleSaveProduct} disabled={loading}>
                  {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>{editingId ? 'Update Listing' : 'Publish Product'}</Text>}
                </TouchableOpacity>
                {editingId && (
                  <TouchableOpacity style={styles.cancelBtn} onPress={resetProductForm}>
                    <Text style={styles.cancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            <Text style={styles.sectionHeader}>Listed Items ({products.length})</Text>
            {productsLoading ? (
              <ActivityIndicator size="small" color={theme.primary} />
            ) : products.length === 0 ? (
              <Text style={styles.emptyText}>No items found in your catalog.</Text>
            ) : (
              products.map(item => (
                <View key={item.id} style={styles.listItem}>
                  <View style={styles.listItemInfo}>
                    <Text style={styles.listItemName}>
                      {item.name} {item.featured && <Text style={{ color: '#FF9500' }}>🔥</Text>}
                    </Text>
                    <Text style={styles.listItemMeta}>Price: ₦{item.price.toFixed(2)} | Stock: {item.stock}</Text>
                    {item.imageUrl && (
                      <Text style={[styles.listItemMeta, { color: '#34C759' }]}>📷 Image uploaded</Text>
                    )}
                    {item.featured && (
                      <View style={[styles.badgeContainer, { backgroundColor: '#FFF3E0' }]}>
                        <Text style={[styles.badgeText, { color: '#FF9500' }]}>Promoted (Top Listing)</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.listItemActions}>
                    <TouchableOpacity style={[styles.actionBtn, styles.boostBtn]} onPress={() => handleBoostProduct(item.id)}>
                      <Text style={styles.boostBtnText}>{item.featured ? 'Unboost' : '🚀 Boost'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.actionBtn, styles.editBtn]} onPress={() => handleEditProduct(item)}>
                      <Text style={styles.editBtnText}>Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.actionBtn, styles.deleteBtn]} onPress={() => handleDeleteProduct(item.id)}>
                      <Text style={styles.deleteBtnText}>Del</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {/* ── SERVICES TAB ── */}
        {activeTab === 'services' && isAdmin && (
          <View>
            <Text style={styles.formTitle}>
              {editingServiceId ? 'Edit Service Catalog Details' : 'Create New Service Category'}
            </Text>

            <View style={styles.card}>
              <View style={styles.formGroup}>
                <Text style={styles.label}>Service Title *</Text>
                <TextInput style={styles.input} value={serviceName} onChangeText={setServiceName} placeholder="e.g. Plumbing Repair" />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Service Description</Text>
                <TextInput style={[styles.input, styles.textArea]} value={serviceDesc} onChangeText={setServiceDesc} placeholder="What does this service category cover?" multiline numberOfLines={3} />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Matchmaking Category Group *</Text>
                <View style={styles.pickerRow}>
                  {['Plumbing', 'Electrical', 'General'].map(cat => (
                    <TouchableOpacity
                      key={cat}
                      style={[styles.pickerPill, serviceCategory === cat && { backgroundColor: theme.primary, borderColor: theme.primary }]}
                      onPress={() => setServiceCategory(cat)}
                    >
                      <Text style={[styles.pickerPillText, serviceCategory === cat && { color: '#FFF' }]}>{cat}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Base Price Hourly Rate (₦) *</Text>
                <TextInput style={styles.input} value={serviceBasePrice} onChangeText={setServiceBasePrice} keyboardType="numeric" placeholder="80.00" />
              </View>

              <View style={styles.btnRow}>
                <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: theme.primary }]} onPress={handleSaveService} disabled={loading}>
                  {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>{editingServiceId ? 'Save Changes' : 'Publish Service'}</Text>}
                </TouchableOpacity>
                {editingServiceId && (
                  <TouchableOpacity style={styles.cancelBtn} onPress={resetServiceForm}>
                    <Text style={styles.cancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            <Text style={styles.sectionHeader}>Active Services Catalog</Text>
            {servicesLoading ? (
              <ActivityIndicator size="small" color={theme.primary} />
            ) : services.length === 0 ? (
              <Text style={styles.emptyText}>No services defined yet.</Text>
            ) : (
              services.map(s => (
                <View key={s.id} style={styles.listItem}>
                  <View style={styles.listItemInfo}>
                    <Text style={styles.listItemName}>
                      {s.name} {s.featured && <Text style={{ color: '#FF9500' }}>🔥</Text>}
                    </Text>
                    <Text style={styles.listItemMeta}>Category: {s.category} | Hourly base: ₦{s.basePrice.toFixed(2)}</Text>
                    {s.featured && (
                      <View style={[styles.badgeContainer, { backgroundColor: '#FFF3E0' }]}>
                        <Text style={[styles.badgeText, { color: '#FF9500' }]}>Featured Page Listing</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.listItemActions}>
                    <TouchableOpacity style={[styles.actionBtn, styles.boostBtn]} onPress={() => handleBoostService(s.id)}>
                      <Text style={styles.boostBtnText}>{s.featured ? 'Unboost' : '🚀 Boost'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.actionBtn, styles.editBtn]} onPress={() => handleEditService(s)}>
                      <Text style={styles.editBtnText}>Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.actionBtn, styles.deleteBtn]} onPress={() => handleDeleteService(s.id)}>
                      <Text style={styles.deleteBtnText}>Del</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {/* ── SETTINGS TAB ── */}
        {activeTab === 'settings' && isAdmin && (
          <View>
            <Text style={styles.formTitle}>⚙️ Dynamic Branding & Gateway Settings</Text>

            <View style={styles.card}>
              <Text style={styles.sectionHeading}>1. Visual Brand Style</Text>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Application Brand Logo</Text>
                {logoUrlInput ? (
                  <View style={styles.imageSuccessContainer}>
                    <Image source={{ uri: logoUrlInput }} style={styles.imageSuccessPreview} resizeMode="contain" />
                    <View style={styles.imageSuccessInfo}>
                      <TouchableOpacity
                        style={[styles.imageChangeBtn, { borderColor: theme.primary }]}
                        onPress={() => handlePickImage('logo')}
                      >
                        <Text style={[styles.imageChangeBtnText, { color: theme.primary }]}>Change Logo</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <TouchableOpacity style={styles.imagePickerBox} onPress={() => handlePickImage('logo')}>
                    <Text style={styles.imagePickerIcon}>🖼️</Text>
                    <Text style={styles.imagePickerTitle}>Upload Brand Logo</Text>
                  </TouchableOpacity>
                )}
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Web Favicon Icon</Text>
                {faviconUrlInput ? (
                  <View style={styles.imageSuccessContainer}>
                    <Image source={{ uri: faviconUrlInput }} style={styles.imageSuccessPreview} resizeMode="contain" />
                    <View style={styles.imageSuccessInfo}>
                      <TouchableOpacity
                        style={[styles.imageChangeBtn, { borderColor: theme.primary }]}
                        onPress={() => handlePickImage('favicon')}
                      >
                        <Text style={[styles.imageChangeBtnText, { color: theme.primary }]}>Change Favicon</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <TouchableOpacity style={styles.imagePickerBox} onPress={() => handlePickImage('favicon')}>
                    <Text style={styles.imagePickerIcon}>🖼️</Text>
                    <Text style={styles.imagePickerTitle}>Upload Favicon</Text>
                  </TouchableOpacity>
                )}
              </View>

              <View style={styles.row}>
                <View style={[styles.formGroup, { flex: 1, marginRight: 6 }]}>
                  <Text style={styles.label}>Primary Color</Text>
                  <View style={styles.colorInputContainer}>
                    <View style={[styles.colorPreview, { backgroundColor: primaryColorInput || '#007AFF' }]} />
                    <TextInput style={[styles.input, { flex: 1, paddingLeft: 34 }]} value={primaryColorInput} onChangeText={setPrimaryColorInput} placeholder="#007AFF" autoCapitalize="none" />
                  </View>
                </View>
                <View style={[styles.formGroup, { flex: 1, marginLeft: 6 }]}>
                  <Text style={styles.label}>Secondary Color</Text>
                  <View style={styles.colorInputContainer}>
                    <View style={[styles.colorPreview, { backgroundColor: secondaryColorInput || '#5856D6' }]} />
                    <TextInput style={[styles.input, { flex: 1, paddingLeft: 34 }]} value={secondaryColorInput} onChangeText={setSecondaryColorInput} placeholder="#5856D6" autoCapitalize="none" />
                  </View>
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Custom Page Background Color</Text>
                <View style={styles.colorInputContainer}>
                  <View style={[styles.colorPreview, { backgroundColor: backgroundColorInput || '#F8F9FA' }]} />
                  <TextInput style={[styles.input, { flex: 1, paddingLeft: 34 }]} value={backgroundColorInput} onChangeText={setBackgroundColorInput} placeholder="#F8F9FA" autoCapitalize="none" />
                </View>
              </View>

              <Text style={styles.sectionHeading}>2. Home & Footer Text Templates</Text>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Hero Banner Title</Text>
                <TextInput style={styles.input} value={heroTitleInput} onChangeText={setHeroTitleInput} placeholder="Find the Best Handyman..." />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Hero Banner Subtitle</Text>
                <TextInput style={[styles.input, styles.textArea]} value={heroSubtitleInput} onChangeText={setHeroSubtitleInput} placeholder="Subtitle description text..." multiline numberOfLines={2} />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Footer Copyright Text</Text>
                <TextInput style={styles.input} value={footerTextInput} onChangeText={setFooterTextInput} placeholder="© 2026 Handyman..." />
              </View>

              <Text style={styles.sectionHeading}>3. Active Payment Gateways Credentials</Text>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Select Active System Gateway</Text>
                <View style={styles.pickerRow}>
                  {['NONE', 'STRIPE', 'PAYSTACK', 'FLUTTERWAVE', 'OPAY'].map(gw => (
                    <TouchableOpacity
                      key={gw}
                      style={[styles.pickerPill, gatewayActive === gw && { backgroundColor: theme.primary, borderColor: theme.primary }]}
                      onPress={() => setGatewayActive(gw)}
                    >
                      <Text style={[styles.pickerPillText, gatewayActive === gw && { color: '#FFF' }]}>{gw}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {gatewayActive === 'STRIPE' && (
                <View style={styles.subSettingsCard}>
                  <Text style={styles.subCardTitle}>Stripe Gateway Keys</Text>
                  <View style={styles.formGroup}>
                    <Text style={styles.label}>Stripe Publishable Key</Text>
                    <TextInput style={styles.input} value={stripePubKey} onChangeText={setStripePubKey} placeholder="pk_test_..." secureTextEntry />
                  </View>
                  <View style={styles.formGroup}>
                    <Text style={styles.label}>Stripe Secret Key</Text>
                    <TextInput style={styles.input} value={stripeSecKey} onChangeText={setStripeSecKey} placeholder="sk_test_..." secureTextEntry />
                  </View>
                  <View style={styles.formGroup}>
                    <Text style={styles.label}>Stripe Webhook Endpoint Secret</Text>
                    <TextInput style={styles.input} value={stripeWebhookSec} onChangeText={setStripeWebhookSec} placeholder="whsec_..." secureTextEntry />
                  </View>
                </View>
              )}

              {gatewayActive === 'PAYSTACK' && (
                <View style={styles.subSettingsCard}>
                  <Text style={styles.subCardTitle}>Paystack Gateway Keys</Text>
                  <View style={styles.formGroup}>
                    <Text style={styles.label}>Paystack Public Key</Text>
                    <TextInput style={styles.input} value={paystackPubKey} onChangeText={setPaystackPubKey} placeholder="pk_test_..." secureTextEntry />
                  </View>
                  <View style={styles.formGroup}>
                    <Text style={styles.label}>Paystack Secret Key</Text>
                    <TextInput style={styles.input} value={paystackSecKey} onChangeText={setPaystackSecKey} placeholder="sk_test_..." secureTextEntry />
                  </View>
                </View>
              )}

              {gatewayActive === 'FLUTTERWAVE' && (
                <View style={styles.subSettingsCard}>
                  <Text style={styles.subCardTitle}>Flutterwave Gateway Keys</Text>
                  <View style={styles.formGroup}>
                    <Text style={styles.label}>Flutterwave Public Key</Text>
                    <TextInput style={styles.input} value={flutterwavePubKey} onChangeText={setFlutterwavePubKey} placeholder="FLWPUBK_TEST-..." secureTextEntry />
                  </View>
                  <View style={styles.formGroup}>
                    <Text style={styles.label}>Flutterwave Secret Key</Text>
                    <TextInput style={styles.input} value={flutterwaveSecKey} onChangeText={setFlutterwaveSecKey} placeholder="FLWSECK_TEST-..." secureTextEntry />
                  </View>
                </View>
              )}

              {gatewayActive === 'OPAY' && (
                <View style={styles.subSettingsCard}>
                  <Text style={styles.subCardTitle}>🔵 OPay Cashier Gateway Keys</Text>
                  <Text style={styles.subCardNote}>
                    Leave blank to use sandbox mock mode for testing. Enter real credentials from your OPay merchant dashboard when ready to go live.
                  </Text>
                  <View style={styles.formGroup}>
                    <Text style={styles.label}>OPay Merchant ID</Text>
                    <TextInput style={styles.input} value={opayMerchantId} onChangeText={setOpayMerchantId} placeholder="merchant_id_from_dashboard" secureTextEntry />
                  </View>
                  <View style={styles.formGroup}>
                    <Text style={styles.label}>OPay Public Key</Text>
                    <TextInput style={styles.input} value={opayPublicKey} onChangeText={setOpayPublicKey} placeholder="pk_live_..." secureTextEntry />
                  </View>
                  <View style={styles.formGroup}>
                    <Text style={styles.label}>OPay Secret Key</Text>
                    <TextInput style={styles.input} value={opaySecretKey} onChangeText={setOpaySecretKey} placeholder="sk_live_..." secureTextEntry />
                  </View>
                </View>
              )}

              <TouchableOpacity
                style={[styles.saveSettingsBtn, { backgroundColor: theme.primary }]}
                onPress={handleSaveSettings}
                disabled={settingsSaving}
              >
                {settingsSaving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveSettingsBtnText}>Apply System Branding</Text>}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── BOOKINGS TAB ── */}
        {activeTab === 'bookings' && isAdmin && (
          <View>
            <Text style={styles.formTitle}>📋 All Bookings</Text>
            {bookingsLoading ? (
              <ActivityIndicator size="large" color={theme.primary} style={{ marginTop: 20 }} />
            ) : bookings.length === 0 ? (
              <Text style={styles.emptyText}>No bookings found.</Text>
            ) : (
              bookings.map((b: any) => (
                <View key={b.id} style={styles.listItem}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.listItemName}>{b.service?.name || 'Service'}</Text>
                    <Text style={styles.listItemMeta}>Customer: {b.customer?.name}</Text>
                    <Text style={styles.listItemMeta}>Handyman: {b.handyman?.name || 'Unassigned'}</Text>
                    <Text style={styles.listItemMeta}>Status: <Text style={{ fontWeight: '700' }}>{b.status}</Text></Text>
                    <Text style={styles.listItemMeta}>Price: ₦{b.totalPrice?.toFixed(2)}</Text>
                    <Text style={styles.listItemMeta}>Scheduled: {new Date(b.scheduledAt).toLocaleString()}</Text>
                  </View>
                  {b.status === 'PENDING' && (
                    <View style={{ flexDirection: 'column', gap: 6 }}>
                      <TouchableOpacity
                        style={[styles.actionBtn, { backgroundColor: '#34C759', paddingVertical: 8 }]}
                        onPress={() => handleUpdateBookingStatus(b.id, 'ACCEPTED')}
                        disabled={updatingBookingId === b.id}
                      >
                        {updatingBookingId === b.id
                          ? <ActivityIndicator size="small" color="#fff" />
                          : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 11 }}>Accept</Text>}
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.actionBtn, { backgroundColor: '#FF3B30', paddingVertical: 8 }]}
                        onPress={() => handleUpdateBookingStatus(b.id, 'CANCELLED')}
                        disabled={updatingBookingId === b.id}
                      >
                        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 11 }}>Cancel</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              ))
            )}
          </View>
        )}

        {/* ── USERS TAB ── */}
        {activeTab === 'users' && isAdmin && (
          <View>
            <Text style={styles.formTitle}>👥 All Users</Text>
            {usersLoading ? (
              <ActivityIndicator size="large" color={theme.primary} style={{ marginTop: 20 }} />
            ) : users.length === 0 ? (
              <Text style={styles.emptyText}>No users found.</Text>
            ) : (
              users.map((u: any) => (
                <View key={u.id} style={[styles.listItem, { flexDirection: 'column', alignItems: 'flex-start' }]}>
                  <Text style={styles.listItemName}>{u.name}</Text>
                  <Text style={styles.listItemMeta}>Email: {u.email}</Text>
                  <Text style={styles.listItemMeta}>Role: {u.role}</Text>
                  <Text style={styles.listItemMeta}>Status: {u.verificationStatus}</Text>
                  {u.phone && <Text style={styles.listItemMeta}>Phone: {u.phone}</Text>}
                </View>
              ))
            )}
          </View>
        )}

        {/* ── KYC TAB ── */}
        {activeTab === 'kyc' && isAdmin && (
          <View>
            <Text style={styles.formTitle}>🔍 KYC Verification Submissions</Text>

            {kycLoading ? (
              <ActivityIndicator size="large" color={theme.primary} style={{ marginTop: 20 }} />
            ) : kycReviews.length === 0 ? (
              <Text style={styles.emptyText}>No pending or completed KYC submissions found.</Text>
            ) : (
              kycReviews.map((rev: any) => (
                <View key={rev.id} style={styles.listItem}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.listItemName}>{rev.name} ({rev.role})</Text>
                    <Text style={styles.listItemMeta}>Email: {rev.email}</Text>
                    <Text style={styles.listItemMeta}>Phone: {rev.phone || 'N/A'}</Text>
                    <Text style={styles.listItemMeta}>OPay Phone: {rev.opayPhone || 'N/A'}</Text>
                    <Text style={styles.listItemMeta}>
                      Submitted: {rev.kycSubmittedAt ? new Date(rev.kycSubmittedAt).toLocaleDateString() : 'N/A'}
                    </Text>

                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 6 }}>
                      <Text style={[styles.label, { marginBottom: 0 }]}>Status: </Text>
                      <View
                        style={[
                          styles.badgeContainer,
                          rev.verificationStatus === 'VERIFIED' ? { backgroundColor: '#E8F5E9' } :
                          rev.verificationStatus === 'REJECTED' ? { backgroundColor: '#FFEBEE' } :
                          { backgroundColor: '#FFF3E0' }
                        ]}
                      >
                        <Text
                          style={[
                            styles.badgeText,
                            rev.verificationStatus === 'VERIFIED' ? { color: '#34C759' } :
                            rev.verificationStatus === 'REJECTED' ? { color: '#FF3B30' } :
                            { color: '#FF9500' }
                          ]}
                        >
                          {rev.verificationStatus}
                        </Text>
                      </View>
                    </View>

                    {rev.rejectionReason && (
                      <Text style={[styles.listItemMeta, { color: '#FF3B30', marginTop: 6 }]}>
                        Reason: {rev.rejectionReason}
                      </Text>
                    )}
                  </View>

                  {rev.verificationStatus === 'PENDING_REVIEW' && (
                    <View style={{ marginTop: 12 }}>
                      {reviewingUserId === rev.id ? (
                        <View style={{ width: '100%', marginTop: 8 }}>
                          <TextInput
                            style={styles.input}
                            value={rejectionReasonInput}
                            onChangeText={setRejectionReasonInput}
                            placeholder="Rejection reason (required if rejecting)"
                          />
                          <View style={{ flexDirection: 'row', marginTop: 12, gap: 8 }}>
                            <TouchableOpacity
                              style={[styles.actionBtn, { backgroundColor: '#34C759', flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center' }]}
                              onPress={() => handleReviewKYC(rev.id, 'VERIFIED')}
                              disabled={loading}
                            >
                              <Text style={{ color: '#FFF', fontWeight: '700' }}>Approve</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[styles.actionBtn, { backgroundColor: '#FF3B30', flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center' }]}
                              onPress={() => handleReviewKYC(rev.id, 'REJECTED')}
                              disabled={loading}
                            >
                              <Text style={{ color: '#FFF', fontWeight: '700' }}>Reject</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[styles.actionBtn, { backgroundColor: '#8E8E93', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8, alignItems: 'center' }]}
                              onPress={() => { setReviewingUserId(null); setRejectionReasonInput(''); }}
                            >
                              <Text style={{ color: '#FFF' }}>Cancel</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      ) : (
                        <TouchableOpacity
                          style={[styles.primaryBtn, { backgroundColor: theme.primary, paddingVertical: 8, paddingHorizontal: 16 }]}
                          onPress={() => setReviewingUserId(rev.id)}
                        >
                          <Text style={styles.primaryBtnText}>Review Submission</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                </View>
              ))
            )}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  mainContainer: { flex: 1 },
  tabScrollContainer: {
    maxHeight: 50,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  tabContentContainer: { flexDirection: 'row', paddingHorizontal: 8 },
  tabButton: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: 'center',
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  tabText: { fontSize: 13, color: '#8E8E93', fontWeight: '600' },
  scrollContent: { padding: 20 },
  formTitle: { fontSize: 20, fontWeight: '800', marginBottom: 12, color: '#1C1C1E' },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  formGroup: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '700', color: '#3A3A3C', marginBottom: 8 },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CED4DA',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#1C1C1E',
  },
  textArea: { height: 80, textAlignVertical: 'top' },
  row: { flexDirection: 'row' },
  btnRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  primaryBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 8,
    marginLeft: 12,
    backgroundColor: '#FFF',
  },
  cancelBtnText: { color: '#8E8E93', fontWeight: '600' },
  sectionHeader: { fontSize: 18, fontWeight: '800', color: '#1C1C1E', marginTop: 12, marginBottom: 16 },
  emptyText: { fontSize: 14, color: '#8E8E93', fontStyle: 'italic', textAlign: 'center', marginVertical: 20 },
  listItem: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  listItemInfo: { flex: 1, marginRight: 10 },
  listItemName: { fontSize: 15, fontWeight: '700', color: '#1C1C1E' },
  listItemMeta: { fontSize: 12, color: '#8E8E93', marginTop: 4 },
  listItemActions: { flexDirection: 'row', alignItems: 'center' },
  actionBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, marginLeft: 6 },
  boostBtn: { backgroundColor: '#FFF3E0', borderWidth: 1, borderColor: '#FF9500' },
  boostBtnText: { color: '#FF9500', fontSize: 11, fontWeight: '700' },
  editBtn: { backgroundColor: '#E7F5FF' },
  editBtnText: { color: '#007AFF', fontSize: 11, fontWeight: '700' },
  deleteBtn: { backgroundColor: '#FFE3E3' },
  deleteBtnText: { color: '#FF3B30', fontSize: 11, fontWeight: '700' },
  badgeContainer: { alignSelf: 'flex-start', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginTop: 6 },
  badgeText: { fontSize: 9, fontWeight: '700', textTransform: 'uppercase' },
  pickerRow: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 },
  pickerPill: {
    borderWidth: 1,
    borderColor: '#CED4DA',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 14,
    margin: 4,
    backgroundColor: '#F8F9FA',
  },
  pickerPillText: { fontSize: 12, fontWeight: '600', color: '#495057' },
  sectionHeading: {
    fontSize: 15,
    fontWeight: '800',
    color: '#495057',
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F7',
    paddingBottom: 6,
    marginTop: 8,
    marginBottom: 16,
  },
  colorInputContainer: { flexDirection: 'row', alignItems: 'center', position: 'relative' },
  colorPreview: {
    width: 18,
    height: 18,
    borderRadius: 9,
    position: 'absolute',
    left: 10,
    zIndex: 2,
    borderWidth: 1,
    borderColor: '#FFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1,
  },
  subSettingsCard: {
    backgroundColor: '#F8F9FA',
    padding: 16,
    borderRadius: 10,
    marginVertical: 12,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  subCardTitle: { fontSize: 13, fontWeight: '800', color: '#3A3A3C', marginBottom: 8 },
  subCardNote: { fontSize: 12, color: '#8E8E93', lineHeight: 17, marginBottom: 14, fontStyle: 'italic' },
  saveSettingsBtn: {
    paddingVertical: 15,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  saveSettingsBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },

  // ── Image Picker & Upload Styles ──────────────────────────────────────────
  imagePickerBox: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: 14,
    paddingVertical: 28,
    paddingHorizontal: 20,
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
  imagePickerIcon: { fontSize: 36, marginBottom: 10 },
  imagePickerTitle: { fontSize: 15, fontWeight: '700', color: '#1C1C1E', marginBottom: 4 },
  imagePickerSubtitle: { fontSize: 12, color: '#8E8E93', marginBottom: 12 },
  imagePickerBadge: {
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  imagePickerBadgeText: { fontSize: 12, fontWeight: '700' },
  imageSuccessContainer: {
    flexDirection: 'row',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E5E5EA',
    backgroundColor: '#F9FAFB',
  },
  imageSuccessPreview: {
    width: 90,
    height: 90,
  },
  imageSuccessInfo: {
    flex: 1,
    padding: 12,
    justifyContent: 'center',
  },
  imageSuccessTitle: { fontSize: 14, fontWeight: '700', color: '#34C759', marginBottom: 4 },
  imageSuccessSize: { fontSize: 12, color: '#8E8E93', marginBottom: 10 },
  imageChangeBtn: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  imageChangeBtnText: { fontSize: 12, fontWeight: '700' },

  // ── AI Enhancer Modal Styles ──────────────────────────────────────────────
  modalContainer: { flex: 1, backgroundColor: '#0D0D0D' },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 56,
    paddingBottom: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#1C1C1E',
  },
  modalCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1C1C1E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCloseText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  modalTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '800', textAlign: 'center' },
  modalSubtitle: { color: '#6E6E73', fontSize: 11, fontWeight: '600', textAlign: 'center', marginTop: 2 },
  modalScroll: { paddingBottom: 120 },
  imagePreviewContainer: {
    width: '100%',
    height: 280,
    position: 'relative',
    overflow: 'hidden',
    marginBottom: 20,
  },
  imagePreview: { width: '100%', height: '100%' },
  filterTintOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
  },
  filterBadge: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    zIndex: 3,
  },
  filterBadgeText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  filterDescBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1C1C1E',
    marginHorizontal: 16,
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    gap: 12,
  },
  filterDescIcon: { fontSize: 30 },
  filterDescLabel: { color: '#FFF', fontSize: 15, fontWeight: '800', marginBottom: 2 },
  filterDescDetail: { color: '#6E6E73', fontSize: 12 },
  filterSectionLabel: {
    color: '#6E6E73',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  filterGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    marginBottom: 24,
  },
  filterCard: {
    width: '30%',
    margin: '1.5%',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#1C1C1E',
    backgroundColor: '#1C1C1E',
    overflow: 'hidden',
    alignItems: 'center',
    paddingBottom: 8,
  },
  filterCardActive: {
    borderWidth: 2,
    backgroundColor: '#111',
  },
  filterThumbContainer: {
    width: '100%',
    height: 70,
    position: 'relative',
    overflow: 'hidden',
  },
  filterThumb: { width: '100%', height: '100%' },
  filterThumbTint: { ...StyleSheet.absoluteFillObject, zIndex: 2 },
  filterCardIcon: { fontSize: 18, marginTop: 6, marginBottom: 2, color: '#FFF' },
  filterCardLabel: { fontSize: 10, fontWeight: '700', color: '#AEAEB2', textAlign: 'center' },
  filterCheckBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3,
  },
  filterCheckText: { color: '#FFF', fontSize: 10, fontWeight: '900' },
  compressionInfoCard: {
    marginHorizontal: 16,
    backgroundColor: '#1C1C1E',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  compressionInfoTitle: { color: '#FFF', fontSize: 13, fontWeight: '800', marginBottom: 8 },
  compressionInfoText: { color: '#6E6E73', fontSize: 12, lineHeight: 18 },
  modalFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#0D0D0D',
    padding: 20,
    paddingBottom: 36,
    borderTopWidth: 1,
    borderTopColor: '#1C1C1E',
  },
  uploadApplyBtn: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadApplyBtnText: { color: '#FFF', fontSize: 16, fontWeight: '800' },
});
