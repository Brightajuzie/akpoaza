import React, { useContext, useEffect, useState, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Image, TextInput, Alert, Modal, FlatList,
  KeyboardAvoidingView, Platform, useWindowDimensions,
} from 'react-native';
import apiClient from '../api/client';
import { CartContext } from '../context/CartContext';
import { SettingsContext } from '../context/SettingsContext';
import { useCurrency } from '../context/CurrencyContext';
import AddToCartModal from '../components/AddToCartModal';

interface ChatMessage {
  id: string;
  text: string;
  sender: 'customer' | 'vendor';
  timestamp: Date;
}

export default function ProductDetailScreen({ route, navigation }: any) {
  const { productId } = route.params;
  const [product, setProduct] = useState<any>(null);
  const [reviews, setReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [averageRating, setAverageRating] = useState<number | null>(null);

  // Review form
  const [rating, setRating] = useState('5');
  const [comment, setComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  // Chat simulator
  const [chatVisible, setChatVisible] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [typeMessage, setTypeMessage] = useState('');
  const [typing, setTyping] = useState(false);
  const chatFlatListRef = useRef<FlatList>(null);

  const { cart, addToCart } = useContext(CartContext);
  const [addedModalVisible, setAddedModalVisible] = useState(false);
  const { theme, colorMode } = useContext(SettingsContext);
  const { fmt } = useCurrency();
  const isDark = colorMode === 'dark';

  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;
  const isTablet = width >= 600 && width < 1024;
  const contentMaxWidth = isDesktop ? 1200 : isTablet ? 800 : undefined;
  const imageHeight = isDesktop ? 420 : isTablet ? 340 : 260;

  const fetchProductAndReviews = async () => {
    try {
      const [productRes, reviewsRes] = await Promise.all([
        apiClient.get(`/products/${productId}`),
        apiClient.get(`/reviews/product/${productId}`)
      ]);
      setProduct(productRes.data);
      setReviews(reviewsRes.data);

      const rList = reviewsRes.data as any[];
      if (rList.length > 0) {
        const avg = rList.reduce((sum: number, r: any) => sum + r.rating, 0) / rList.length;
        setAverageRating(Math.round(avg * 10) / 10);
      } else {
        setAverageRating(null);
      }
    } catch (error) {
      console.error('Failed to load product details', error);
      Alert.alert('Error', 'Failed to load product details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProductAndReviews();
  }, [productId]);

  useEffect(() => {
    if (chatVisible && product) {
      setChatMessages([
        {
          id: '1',
          text: `Hi there! Thanks for your interest in "${product.name}". How can I help you today?`,
          sender: 'vendor',
          timestamp: new Date()
        }
      ]);
    }
  }, [chatVisible, product]);

  const handleSubmitReview = async () => {
    const numRating = parseInt(rating, 10);
    if (isNaN(numRating) || numRating < 1 || numRating > 5) {
      Alert.alert('Invalid Rating', 'Please enter a rating between 1 and 5.');
      return;
    }

    setSubmittingReview(true);
    try {
      await apiClient.post('/reviews', {
        productId,
        rating: numRating,
        comment,
      });
      Alert.alert('Success', 'Review submitted!');
      setComment('');
      setRating('5');
      fetchProductAndReviews();
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'Failed to submit review.');
    } finally {
      setSubmittingReview(false);
    }
  };

  const handleAddToCart = () => {
    if (product) {
      addToCart({
        id: product.id,
        name: product.name,
        price: product.price,
        type: 'product'
      });
      setAddedModalVisible(true);
    }
  };

  const handleCallSimulate = () => {
    if (!product || !product.vendor) return;
    Alert.alert(
      '📞 Call Seller',
      `Connecting call to seller: ${product.vendor.name}\n\nStatus: DIALING...`,
      [{ text: 'End Call', style: 'cancel' }]
    );
  };

  const handleWhatsAppSimulate = () => {
    if (!product || !product.vendor) return;
    const msg = `Hi ${product.vendor.name}, I am interested in your product "${product.name}" listed for ${fmt(product.price)} on FixMart. Is it available?`;
    Alert.alert(
      '💬 WhatsApp Redirection',
      `Opening WhatsApp thread with ${product.vendor.name}...\n\nMessage:\n"${msg}"`,
      [{ text: 'Open WhatsApp', onPress: () => {} }, { text: 'Cancel', style: 'cancel' }]
    );
  };

  const handleSendChatMessage = () => {
    if (!typeMessage.trim()) return;

    const newMsg: ChatMessage = {
      id: Date.now().toString(),
      text: typeMessage.trim(),
      sender: 'customer',
      timestamp: new Date()
    };

    setChatMessages(prev => [...prev, newMsg]);
    const userMsg = typeMessage;
    setTypeMessage('');

    setTyping(true);
    setTimeout(() => {
      setTyping(false);
      let replyText = `Thanks for writing! Yes, "${product.name}" is in stock and available for delivery. Let me know if you have questions!`;
      const lc = userMsg.toLowerCase();
      if (lc.includes('price') || lc.includes('discount')) {
        replyText = `The price is fixed at ${fmt(product.price)}, which is already our best wholesale price!`;
      } else if (lc.includes('deliver') || lc.includes('ship')) {
        replyText = `We deliver nationwide! Delivery takes 1-3 business days. Enter your address at checkout for exact rates.`;
      }

      setChatMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        text: replyText,
        sender: 'vendor',
        timestamp: new Date()
      }]);
    }, 1500);
  };

  useEffect(() => {
    if (chatFlatListRef.current) {
      setTimeout(() => {
        chatFlatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [chatMessages, typing]);

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  if (!product) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <Text style={[styles.errorText, { color: isDark ? '#94A3B8' : '#64748B' }]}>Product not found.</Text>
      </View>
    );
  }

  const mainContent = (
    <>
      {/* Product Hero Header */}
      <View style={[
        styles.productHeader,
        { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderColor: isDark ? '#334155' : '#E2E8F0' },
        isDesktop && styles.productHeaderDesktop
      ]}>
        {/* Image column */}
        <View style={[styles.imageColumn, isDesktop && styles.imageColumnDesktop]}>
          {product.imageUrl ? (
            <Image
              source={{ uri: product.imageUrl }}
              style={[styles.image, { height: imageHeight }]}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.placeholderImage, { height: imageHeight, backgroundColor: isDark ? '#334155' : '#F1F5F9' }]}>
              <Text style={styles.placeholderText}>📦</Text>
              <Text style={[styles.placeholderSub, { color: isDark ? '#64748B' : '#94A3B8' }]}>No image available</Text>
            </View>
          )}

          {product.featured && (
            <View style={styles.promotedBadge}>
              <Text style={styles.promotedBadgeText}>🔥 Featured Product</Text>
            </View>
          )}
        </View>

        {/* Info column */}
        <View style={[styles.infoColumn, isDesktop && styles.infoColumnDesktop]}>
          {product.category && (
            <View style={[styles.categoryBadge, { backgroundColor: theme.primary + '18' }]}>
              <Text style={[styles.categoryText, { color: theme.primary }]}>{product.category}</Text>
            </View>
          )}
          
          <Text style={[styles.name, { color: isDark ? '#F1F5F9' : '#0F172A' }, isDesktop && styles.nameDesktop]}>
            {product.name}
          </Text>

          {/* Rating overview */}
          {averageRating !== null && (
            <View style={styles.ratingOverviewRow}>
              <View style={styles.starsRow}>
                {[1, 2, 3, 4, 5].map(s => (
                  <Text key={s} style={[styles.starIcon, { color: s <= Math.round(averageRating) ? '#F59E0B' : (isDark ? '#334155' : '#CBD5E1') }]}>★</Text>
                ))}
              </View>
              <Text style={[styles.ratingOverviewText, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                {averageRating.toFixed(1)} ({reviews.length} review{reviews.length !== 1 ? 's' : ''})
              </Text>
            </View>
          )}

          <Text style={[styles.price, { color: theme.primary }, isDesktop && styles.priceDesktop]}>
            {fmt(product.price)}
          </Text>

          <Text style={[styles.description, { color: isDark ? '#94A3B8' : '#475569' }]}>
            {product.description}
          </Text>

          {/* Seller / Vendor Box */}
          {product.vendor && (
            <View style={[styles.vendorBox, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderColor: isDark ? '#334155' : '#E2E8F0' }]}>
              <View style={styles.vendorHeaderRow}>
                <View style={[styles.vendorAvatar, { backgroundColor: theme.primary + '20' }]}>
                  <Text style={[styles.vendorAvatarText, { color: theme.primary }]}>
                    {product.vendor.name ? product.vendor.name.charAt(0).toUpperCase() : 'S'}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.vendorTitleRow}>
                    <Text style={[styles.vendorName, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>{product.vendor.name}</Text>
                    <View style={styles.verifiedTag}>
                      <Text style={styles.verifiedTagText}>✓ Verified</Text>
                    </View>
                  </View>
                  {product.vendor.address && (
                    <Text style={[styles.vendorAddress, { color: isDark ? '#64748B' : '#94A3B8' }]}>📍 {product.vendor.address}</Text>
                  )}
                </View>
              </View>

              {/* Direct Communication Buttons */}
              <View style={styles.communicationTray}>
                <TouchableOpacity
                  style={[styles.commButton, { borderColor: theme.primary, backgroundColor: theme.primary + '10' }]}
                  onPress={handleCallSimulate}
                >
                  <Text style={[styles.commButtonText, { color: theme.primary }]}>📞 Call</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.commButton, { borderColor: '#25D366', backgroundColor: '#25D36610' }]}
                  onPress={handleWhatsAppSimulate}
                >
                  <Text style={[styles.commButtonText, { color: '#25D366' }]}>💬 WhatsApp</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.commButton, { backgroundColor: theme.primary, borderColor: theme.primary }]}
                  onPress={() => setChatVisible(true)}
                >
                  <Text style={[styles.commButtonText, { color: '#FFFFFF' }]}>💬 Live Chat</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Add to Cart button on desktop */}
          {isDesktop && (
            <TouchableOpacity
              style={[styles.addToCartBtnInline, { backgroundColor: theme.primary }]}
              onPress={handleAddToCart}
              activeOpacity={0.85}
            >
              <Text style={styles.addToCartBtnText}>🛒 Add to Cart — {fmt(product.price)}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Reviews Section */}
      <View style={[styles.reviewsSection, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderColor: isDark ? '#334155' : '#E2E8F0' }]}>
        <Text style={[styles.sectionTitle, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>⭐ Customer Reviews</Text>

        {/* Aggregated Rating Summary */}
        {reviews.length > 0 && averageRating !== null && (
          <View style={[styles.ratingsSummary, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderColor: isDark ? '#334155' : '#E2E8F0' }]}>
            <View style={styles.ratingsBigNum}>
              <Text style={[styles.ratingsBigValue, { color: theme.primary }]}>
                {averageRating.toFixed(1)}
              </Text>
              <Text style={[styles.ratingsOutOf, { color: isDark ? '#64748B' : '#94A3B8' }]}>/ 5</Text>
            </View>
            <View style={styles.ratingsRight}>
              <View style={styles.ratingsStarsRow}>
                {[1, 2, 3, 4, 5].map((s) => (
                  <Text
                    key={s}
                    style={[
                      styles.ratingsStarChar,
                      s <= Math.round(averageRating) ? { color: '#F59E0B' } : { color: isDark ? '#334155' : '#E2E8F0' },
                    ]}
                  >
                    ★
                  </Text>
                ))}
              </View>
              <Text style={[styles.ratingsCount, { color: isDark ? '#64748B' : '#94A3B8' }]}>
                Based on {reviews.length} review{reviews.length !== 1 ? 's' : ''}
              </Text>
            </View>
          </View>
        )}

        {/* Review Form */}
        <View style={[styles.addReviewBox, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderColor: isDark ? '#334155' : '#E2E8F0' }]}>
          <Text style={[styles.label, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>Write a Review</Text>
          <View style={styles.ratingSelectorRow}>
            <Text style={[styles.ratingSelectorLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>Your Rating:</Text>
            {[1, 2, 3, 4, 5].map((starNum) => (
              <TouchableOpacity key={starNum} onPress={() => setRating(starNum.toString())}>
                <Text style={[styles.starSelectorChar, { color: starNum <= parseInt(rating, 10) ? '#F59E0B' : (isDark ? '#334155' : '#CBD5E1') }]}>★</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TextInput
            style={[styles.input, styles.textArea, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderColor: isDark ? '#334155' : '#E2E8F0', color: isDark ? '#F1F5F9' : '#0F172A' }]}
            placeholder="Share your experience with this product..."
            placeholderTextColor={isDark ? '#475569' : '#94A3B8'}
            value={comment}
            onChangeText={setComment}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />
          <TouchableOpacity
            style={[styles.submitBtn, { backgroundColor: theme.primary }]}
            onPress={handleSubmitReview}
            disabled={submittingReview}
          >
            {submittingReview ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBtnText}>Publish Review</Text>}
          </TouchableOpacity>
        </View>

        {/* Review List */}
        {reviews.length === 0 ? (
          <Text style={[styles.noReviews, { color: isDark ? '#64748B' : '#94A3B8' }]}>No reviews yet. Be the first to share your experience!</Text>
        ) : (
          reviews.map((review) => (
            <View key={review.id} style={[styles.reviewCard, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderColor: isDark ? '#334155' : '#E2E8F0' }]}>
              <View style={styles.reviewHeader}>
                <Text style={[styles.reviewerName, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>{review.author?.name || 'Customer'}</Text>
                <Text style={styles.ratingStars}>{'⭐'.repeat(review.rating)}</Text>
              </View>
              {review.comment && <Text style={[styles.reviewComment, { color: isDark ? '#94A3B8' : '#475569' }]}>{review.comment}</Text>}
              <Text style={[styles.reviewDate, { color: isDark ? '#475569' : '#94A3B8' }]}>{new Date(review.createdAt).toLocaleDateString()}</Text>
            </View>
          ))
        )}
      </View>
    </>
  );

  return (
    <View style={[styles.mainContainer, { backgroundColor: theme.background }]}>
      <ScrollView
        style={styles.container}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          !isDesktop && { paddingBottom: 90 },
        ]}
      >
        {contentMaxWidth ? (
          <View style={[styles.centeredContent, { maxWidth: contentMaxWidth }]}>
            {mainContent}
          </View>
        ) : (
          mainContent
        )}
      </ScrollView>

      {/* Fixed purchase footer on mobile/tablet */}
      {!isDesktop && (
        <View style={[styles.fixedFooter, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderTopColor: isDark ? '#334155' : '#E2E8F0' }]}>
          <View style={styles.footerPriceCol}>
            <Text style={[styles.footerPriceLabel, { color: isDark ? '#64748B' : '#94A3B8' }]}>Total Price</Text>
            <Text style={[styles.footerPriceVal, { color: theme.primary }]}>{fmt(product.price)}</Text>
          </View>
          <TouchableOpacity
            style={[styles.addToCartBtn, { backgroundColor: theme.primary }]}
            onPress={handleAddToCart}
            activeOpacity={0.85}
          >
            <Text style={styles.addToCartBtnText}>🛒 Add to Cart</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Live Chat Modal */}
      <Modal
        visible={chatVisible}
        animationType="slide"
        onRequestClose={() => setChatVisible(false)}
      >
        <KeyboardAvoidingView
          style={[styles.chatContainer, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC' }]}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
        >
          {/* Chat Header */}
          <View style={[styles.chatHeader, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderBottomColor: isDark ? '#334155' : '#E2E8F0' }]}>
            <View style={styles.chatHeaderLeft}>
              <TouchableOpacity onPress={() => setChatVisible(false)} style={styles.chatBackBtn}>
                <Text style={[styles.chatBackBtnText, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>←</Text>
              </TouchableOpacity>
              <View>
                <Text style={[styles.chatHeaderTitle, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>{product.vendor?.name || 'Seller'}</Text>
                <View style={styles.chatHeaderStatusRow}>
                  <View style={styles.statusDotGreen} />
                  <Text style={[styles.chatHeaderStatusText, { color: isDark ? '#64748B' : '#94A3B8' }]}>Verified Seller</Text>
                </View>
              </View>
            </View>
            <TouchableOpacity onPress={() => setChatVisible(false)} style={styles.chatCloseBtn}>
              <Text style={[styles.chatCloseBtnText, { color: theme.primary }]}>Close</Text>
            </TouchableOpacity>
          </View>

          {/* Messages list */}
          <FlatList
            ref={chatFlatListRef}
            data={chatMessages}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.chatMessagesList}
            renderItem={({ item }) => {
              const isMe = item.sender === 'customer';
              return (
                <View style={[styles.msgWrapper, isMe ? styles.msgRight : styles.msgLeft]}>
                  <View
                    style={[
                      styles.msgBubble,
                      isMe
                        ? { backgroundColor: theme.primary, borderBottomRightRadius: 4 }
                        : { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderBottomLeftRadius: 4, borderWidth: 1, borderColor: isDark ? '#334155' : '#E2E8F0' }
                    ]}
                  >
                    <Text style={[styles.msgText, { color: isMe ? '#FFF' : (isDark ? '#F1F5F9' : '#0F172A') }]}>
                      {item.text}
                    </Text>
                    <Text style={[styles.msgTime, { color: isMe ? 'rgba(255,255,255,0.7)' : (isDark ? '#475569' : '#94A3B8') }]}>
                      {item.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                </View>
              );
            }}
            ListFooterComponent={
              typing ? (
                <View style={[styles.msgWrapper, styles.msgLeft]}>
                  <View style={[styles.msgBubble, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderWidth: 1, borderColor: isDark ? '#334155' : '#E2E8F0' }]}>
                    <Text style={[styles.typingText, { color: isDark ? '#64748B' : '#94A3B8' }]}>Seller is typing...</Text>
                  </View>
                </View>
              ) : null
            }
          />

          {/* Messages Input Box */}
          <View style={[styles.chatInputRow, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderTopColor: isDark ? '#334155' : '#E2E8F0' }]}>
            <TextInput
              style={[styles.chatInput, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', color: isDark ? '#F1F5F9' : '#0F172A' }]}
              placeholder="Ask a question about availability, delivery..."
              value={typeMessage}
              onChangeText={setTypeMessage}
              placeholderTextColor={isDark ? '#475569' : '#94A3B8'}
            />
            <TouchableOpacity
              style={[styles.chatSendBtn, { backgroundColor: theme.primary }]}
              onPress={handleSendChatMessage}
            >
              <Text style={styles.chatSendBtnText}>Send</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <AddToCartModal
        visible={addedModalVisible}
        item={product}
        cartCount={cart.reduce((sum, item) => sum + item.quantity, 0)}
        themePrimary={theme.primary}
        onContinueShopping={() => setAddedModalVisible(false)}
        onProceedToCheckout={() => {
          setAddedModalVisible(false);
          navigation.navigate('CartTab');
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  mainContainer: { flex: 1 },
  container: { flex: 1 },
  scrollContent: { alignItems: 'center' },
  centeredContent: { width: '100%', alignSelf: 'center', padding: 16 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { fontSize: 16 },

  // Product Header
  productHeader: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    marginBottom: 16,
    width: '100%',
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 12, elevation: 2,
  },
  productHeaderDesktop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 36,
    padding: 28,
  },

  // Image Column
  imageColumn: { position: 'relative' },
  imageColumnDesktop: { flex: 1, minWidth: 0 },
  image: { width: '100%', borderRadius: 16 },
  placeholderImage: {
    width: '100%', borderRadius: 16,
    justifyContent: 'center', alignItems: 'center', gap: 6,
  },
  placeholderText: { fontSize: 44 },
  placeholderSub: { fontSize: 13, fontWeight: '500' },
  promotedBadge: {
    position: 'absolute', top: 12, left: 12,
    backgroundColor: '#EF4444',
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6,
  },
  promotedBadgeText: { color: '#FFF', fontSize: 10, fontWeight: '800' },

  // Info Column
  infoColumn: { marginTop: 16 },
  infoColumnDesktop: { flex: 1, marginTop: 0 },
  categoryBadge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, marginBottom: 8 },
  categoryText: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  name: { fontSize: 22, fontWeight: '900', lineHeight: 28, marginBottom: 8, letterSpacing: -0.5 },
  nameDesktop: { fontSize: 28, lineHeight: 34 },
  ratingOverviewRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  starsRow: { flexDirection: 'row', gap: 1 },
  starIcon: { fontSize: 16 },
  ratingOverviewText: { fontSize: 13, fontWeight: '600' },
  price: { fontSize: 26, fontWeight: '900', marginBottom: 14 },
  priceDesktop: { fontSize: 32 },
  description: { fontSize: 14, lineHeight: 22, marginBottom: 20 },

  // Vendor box
  vendorBox: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 20 },
  vendorHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  vendorAvatar: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  vendorAvatarText: { fontSize: 18, fontWeight: '900' },
  vendorTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  vendorName: { fontSize: 15, fontWeight: '800' },
  verifiedTag: { backgroundColor: '#22C55E18', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  verifiedTagText: { color: '#22C55E', fontSize: 10, fontWeight: '800' },
  vendorAddress: { fontSize: 12, marginTop: 2 },
  communicationTray: { flexDirection: 'row', gap: 8 },
  commButton: {
    flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
  },
  commButtonText: { fontSize: 12, fontWeight: '800' },

  addToCartBtnInline: {
    paddingVertical: 16, borderRadius: 14, alignItems: 'center',
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4,
  },
  addToCartBtnText: { color: '#FFF', fontSize: 15, fontWeight: '800' },

  // Reviews
  reviewsSection: {
    borderRadius: 20, borderWidth: 1, padding: 20, marginBottom: 16, width: '100%',
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 12, elevation: 2,
  },
  sectionTitle: { fontSize: 18, fontWeight: '900', marginBottom: 16 },
  ratingsSummary: {
    flexDirection: 'row', alignItems: 'center', gap: 16,
    borderRadius: 14, borderWidth: 1, padding: 16, marginBottom: 16,
  },
  ratingsBigNum: { flexDirection: 'row', alignItems: 'baseline' },
  ratingsBigValue: { fontSize: 36, fontWeight: '900' },
  ratingsOutOf: { fontSize: 14, fontWeight: '600', marginLeft: 2 },
  ratingsRight: { flex: 1 },
  ratingsStarsRow: { flexDirection: 'row', gap: 2, marginBottom: 2 },
  ratingsStarChar: { fontSize: 18 },
  ratingsCount: { fontSize: 12, fontWeight: '500' },

  addReviewBox: { borderRadius: 14, borderWidth: 1, padding: 16, marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '800', marginBottom: 8 },
  ratingSelectorRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  ratingSelectorLabel: { fontSize: 13, fontWeight: '600' },
  starSelectorChar: { fontSize: 24 },
  input: { borderRadius: 10, borderWidth: 1, padding: 12, fontSize: 14, marginBottom: 12 },
  textArea: { minHeight: 80 },
  submitBtn: { paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  submitBtnText: { color: '#FFF', fontSize: 14, fontWeight: '800' },
  noReviews: { fontSize: 14, textAlign: 'center', marginVertical: 16 },
  reviewCard: { borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 10 },
  reviewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  reviewerName: { fontSize: 14, fontWeight: '800' },
  ratingStars: { fontSize: 12 },
  reviewComment: { fontSize: 13, lineHeight: 19, marginBottom: 6 },
  reviewDate: { fontSize: 10 },

  // Fixed Mobile Footer
  fixedFooter: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14, borderTopWidth: 1,
    paddingBottom: Platform.OS === 'ios' ? 28 : 14,
    shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 8,
  },
  footerPriceCol: { gap: 2 },
  footerPriceLabel: { fontSize: 11, fontWeight: '600' },
  footerPriceVal: { fontSize: 22, fontWeight: '900' },
  addToCartBtn: {
    paddingHorizontal: 24, paddingVertical: 14, borderRadius: 12,
    shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.2, shadowRadius: 6, elevation: 3,
  },

  // Chat Modal
  chatContainer: { flex: 1 },
  chatHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 52 : 16, paddingBottom: 16,
    borderBottomWidth: 1,
  },
  chatHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  chatBackBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  chatBackBtnText: { fontSize: 22, fontWeight: '800' },
  chatHeaderTitle: { fontSize: 15, fontWeight: '800' },
  chatHeaderStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  statusDotGreen: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#22C55E' },
  chatHeaderStatusText: { fontSize: 11 },
  chatCloseBtn: { paddingHorizontal: 12, paddingVertical: 6 },
  chatCloseBtnText: { fontSize: 14, fontWeight: '800' },
  chatMessagesList: { padding: 16, paddingBottom: 24 },
  msgWrapper: { flexDirection: 'row', marginBottom: 12 },
  msgLeft: { justifyContent: 'flex-start' },
  msgRight: { justifyContent: 'flex-end' },
  msgBubble: { maxWidth: '80%', padding: 12, borderRadius: 16 },
  msgText: { fontSize: 14, lineHeight: 20 },
  msgTime: { fontSize: 9, marginTop: 4, textAlign: 'right' },
  typingText: { fontSize: 12, fontStyle: 'italic' },
  chatInputRow: {
    flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 12,
    borderTopWidth: 1, alignItems: 'center', gap: 10,
    paddingBottom: Platform.OS === 'ios' ? 24 : 12,
  },
  chatInput: { flex: 1, height: 42, borderRadius: 21, paddingHorizontal: 16, fontSize: 14 },
  chatSendBtn: { height: 42, paddingHorizontal: 18, borderRadius: 21, justifyContent: 'center', alignItems: 'center' },
  chatSendBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
});
