import React, { useContext, useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Image, TextInput, Alert, Modal, FlatList, KeyboardAvoidingView, Platform } from 'react-native';
import apiClient from '../api/client';
import { CartContext } from '../context/CartContext';
import { SettingsContext } from '../context/SettingsContext';

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

  // Communication / Chat Simulator State
  const [chatVisible, setChatVisible] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [typeMessage, setTypeMessage] = useState('');
  const [typing, setTyping] = useState(false);
  const chatFlatListRef = useRef<FlatList>(null);

  const { addToCart } = useContext(CartContext);
  const { theme } = useContext(SettingsContext);

  const fetchProductAndReviews = async () => {
    try {
      const [productRes, reviewsRes] = await Promise.all([
        apiClient.get(`/products/${productId}`),
        apiClient.get(`/reviews/product/${productId}`)
      ]);
      setProduct(productRes.data);
      setReviews(reviewsRes.data);

      // Compute aggregated rating client-side from the reviews list
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

  // Setup initial mock messages when chat opens
  useEffect(() => {
    if (chatVisible && product) {
      setChatMessages([
        {
          id: '1',
          text: `Hi there! Thanks for your interest in the "${product.name}". How can I help you today?`,
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
      fetchProductAndReviews(); // Refresh reviews
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
      Alert.alert('Added to Cart', `${product.name} has been added to your cart.`);
      navigation.goBack();
    }
  };

  // Communication Simulation triggers
  const handleCallSimulate = () => {
    if (!product || !product.vendor) return;
    Alert.alert(
      '📞 Call Dialing Simulator',
      `Connecting call to seller: ${product.vendor.name}\nPhone: +1 (555) 019-9482\n\nStatus: DIALING...`,
      [{ text: 'End Call', style: 'cancel' }]
    );
  };

  const handleWhatsAppSimulate = () => {
    if (!product || !product.vendor) return;
    const msg = `Hi ${product.vendor.name}, I am interested in buying your product "${product.name}" listed for $${product.price} on Handyman E-Commerce. Is it still available?`;
    Alert.alert(
      '💬 WhatsApp Redirection Simulator',
      `Opening WhatsApp thread...\n\nRecipient: ${product.vendor.name}\n\nPre-filled text:\n"${msg}"`,
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

    // Trigger typing simulation
    setTyping(true);
    setTimeout(() => {
      setTyping(false);
      
      // Smart context replies
      let replyText = `Thanks for writing! Yes, the "${product.name}" is completely in stock and available for delivery. Let me know if you would like to arrange it!`;
      const lowercaseUser = userMsg.toLowerCase();
      if (lowercaseUser.includes('price') || lowercaseUser.includes('discount') || lowercaseUser.includes('cheap')) {
        replyText = `The price is fixed at $${product.price.toFixed(2)}, which is already a discounted wholesale price for the "${product.name}"!`;
      } else if (lowercaseUser.includes('deliver') || lowercaseUser.includes('ship') || lowercaseUser.includes('where')) {
        replyText = `We deliver across the metropolitan region! Standard delivery takes about 1-2 business days. Let us know your address coordinates.`;
      }

      setChatMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        text: replyText,
        sender: 'vendor',
        timestamp: new Date()
      }]);
    }, 1500);
  };

  // Scroll to bottom helper
  useEffect(() => {
    if (chatFlatListRef.current) {
      setTimeout(() => {
        chatFlatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [chatMessages, typing]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  if (!product) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Product not found.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.mainContainer, { backgroundColor: theme.background }]}>
      <ScrollView 
        style={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.productHeader}>
          {product.imageUrl ? (
            <Image source={{ uri: product.imageUrl }} style={styles.image} />
          ) : (
            <View style={styles.placeholderImage}>
              <Text style={styles.placeholderText}>No Image Available</Text>
            </View>
          )}

          {product.featured && (
            <View style={styles.promotedBadge}>
              <Text style={styles.promotedBadgeText}>🔥 Promoted Listing</Text>
            </View>
          )}

          <Text style={styles.name}>{product.name}</Text>
          
          {product.vendor && (
            <View style={styles.vendorBox}>
              <View style={styles.vendorHeaderRow}>
                <View>
                  <Text style={styles.vendorLabel}>Verified Shop Seller</Text>
                  <Text style={styles.vendorName}>{product.vendor.name}</Text>
                  <Text style={styles.vendorEmail}>{product.vendor.email}</Text>
                  {product.vendor.address && (
                    <Text style={styles.vendorAddress}>📍 {product.vendor.address}</Text>
                  )}
                </View>
                <View style={styles.vendorStatusDotContainer}>
                  <View style={styles.vendorStatusDot} />
                  <Text style={styles.vendorStatusText}>Online</Text>
                </View>
              </View>

              {/* Direct Communication Buttons Tray */}
              <View style={styles.communicationTray}>
                <TouchableOpacity 
                  style={[styles.commButton, { borderColor: theme.primary }]}
                  onPress={handleCallSimulate}
                >
                  <Text style={[styles.commButtonText, { color: theme.primary }]}>📞 Simulated Call</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.commButton, { borderColor: '#25D366' }]}
                  onPress={handleWhatsAppSimulate}
                >
                  <Text style={[styles.commButtonText, { color: '#25D366' }]}>💬 WhatsApp</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.commButton, { backgroundColor: theme.primary, borderColor: theme.primary }]}
                  onPress={() => setChatVisible(true)}
                >
                  <Text style={[styles.commButtonText, { color: '#FFFFFF' }]}>💬 In-App Chat</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <Text style={[styles.price, { color: theme.primary }]}>${product.price.toFixed(2)}</Text>
          <Text style={styles.description}>{product.description}</Text>
          {product.category && <Text style={styles.category}>Category: {product.category}</Text>}
        </View>

        {/* Reviews Section */}
        <View style={styles.reviewsSection}>
          <Text style={styles.sectionTitle}>Customer Reviews</Text>

          {/* Aggregated Rating Summary */}
          {reviews.length > 0 && averageRating !== null && (
            <View style={styles.ratingsSummary}>
              <View style={styles.ratingsBigNum}>
                <Text style={[styles.ratingsBigValue, { color: theme.primary }]}>
                  {averageRating.toFixed(1)}
                </Text>
                <Text style={styles.ratingsOutOf}>/ 5</Text>
              </View>
              <View style={styles.ratingsRight}>
                <View style={styles.ratingsStarsRow}>
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Text
                      key={s}
                      style={[
                        styles.ratingsStarChar,
                        s <= Math.round(averageRating) ? { color: '#FFD700' } : { color: '#E5E5EA' },
                      ]}
                    >
                      ★
                    </Text>
                  ))}
                </View>
                <Text style={styles.ratingsCount}>
                  Based on {reviews.length} review{reviews.length !== 1 ? 's' : ''}
                </Text>
              </View>
            </View>
          )}
          
          <View style={styles.addReviewBox}>
            <Text style={styles.label}>Write a Review</Text>
            <TextInput 
              style={styles.input} 
              placeholder="Rating (1-5)" 
              keyboardType="numeric" 
              value={rating} 
              onChangeText={setRating} 
              maxLength={1}
            />
            <TextInput 
              style={[styles.input, styles.textArea]} 
              placeholder="Share your thoughts about this product..." 
              value={comment} 
              onChangeText={setComment} 
              multiline 
              numberOfLines={3} 
            />
            <TouchableOpacity 
              style={[styles.submitBtn, { backgroundColor: theme.primary }]} 
              onPress={handleSubmitReview} 
              disabled={submittingReview}
            >
              {submittingReview ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBtnText}>Publish Review</Text>}
            </TouchableOpacity>
          </View>

          {reviews.length === 0 ? (
            <Text style={styles.noReviews}>No reviews yet. Be the first to share your experience!</Text>
          ) : (
            reviews.map((review) => (
              <View key={review.id} style={styles.reviewCard}>
                <View style={styles.reviewHeader}>
                  <Text style={styles.reviewerName}>{review.author?.name || 'Anonymous User'}</Text>
                  <Text style={styles.ratingStars}>{'⭐'.repeat(review.rating)}</Text>
                </View>
                {review.comment && <Text style={styles.reviewComment}>{review.comment}</Text>}
                <Text style={styles.reviewDate}>{new Date(review.createdAt).toLocaleDateString()}</Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* FIXED PURCHASE FOOTER */}
      <View style={styles.fixedFooter}>
        <TouchableOpacity 
          style={[styles.addToCartBtn, { backgroundColor: theme.primary }]} 
          onPress={handleAddToCart}
        >
          <Text style={styles.addToCartBtnText}>🛒 Add to Cart</Text>
        </TouchableOpacity>
      </View>

      {/* DYNAMIC FULL SCREEN IN-APP LIVE CHAT SIMULATOR */}
      <Modal
        visible={chatVisible}
        animationType="slide"
        onRequestClose={() => setChatVisible(false)}
      >
        <KeyboardAvoidingView 
          style={styles.chatContainer} 
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
        >
          {/* Chat Header */}
          <View style={styles.chatHeader}>
            <View style={styles.chatHeaderLeft}>
              <TouchableOpacity onPress={() => setChatVisible(false)} style={styles.chatBackBtn}>
                <Text style={styles.chatBackBtnText}>←</Text>
              </TouchableOpacity>
              <View>
                <Text style={styles.chatHeaderTitle}>{product.vendor?.name}</Text>
                <View style={styles.chatHeaderStatusRow}>
                  <View style={styles.statusDotGreen} />
                  <Text style={styles.chatHeaderStatusText}>Simulated Chat Bot</Text>
                </View>
              </View>
            </View>
            <TouchableOpacity onPress={() => setChatVisible(false)} style={styles.chatCloseBtn}>
              <Text style={styles.chatCloseBtnText}>Close</Text>
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
                        ? { backgroundColor: theme.primary } 
                        : styles.msgBubbleVendor
                    ]}
                  >
                    <Text style={[styles.msgText, isMe ? styles.msgTextMe : styles.msgTextVendor]}>
                      {item.text}
                    </Text>
                    <Text style={[styles.msgTime, isMe ? styles.msgTimeMe : styles.msgTimeVendor]}>
                      {item.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                </View>
              );
            }}
            ListFooterComponent={
              typing ? (
                <View style={[styles.msgWrapper, styles.msgLeft]}>
                  <View style={[styles.msgBubble, styles.msgBubbleVendor, styles.typingBubble]}>
                    <Text style={styles.typingText}>Seller is typing...</Text>
                  </View>
                </View>
              ) : null
            }
          />

          {/* Messages Input Box */}
          <View style={styles.chatInputRow}>
            <TextInput
              style={styles.chatInput}
              placeholder="Ask a question about availability, delivery..."
              value={typeMessage}
              onChangeText={setTypeMessage}
              placeholderTextColor="#8E8E93"
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
    </View>
  );
}

const styles = StyleSheet.create({
  mainContainer: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 16,
    color: '#888',
  },
  productHeader: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
    marginBottom: 10,
    position: 'relative',
  },
  image: {
    width: '100%',
    height: 250,
    borderRadius: 12,
    marginBottom: 16,
    resizeMode: 'cover',
  },
  placeholderImage: {
    width: '100%',
    height: 250,
    backgroundColor: '#E9ECEF',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  placeholderText: {
    color: '#ADB5BD',
    fontSize: 18,
    fontWeight: 'bold',
  },
  promotedBadge: {
    position: 'absolute',
    top: 32,
    left: 32,
    backgroundColor: '#FF9500',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
  },
  promotedBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  name: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1C1C1E',
    marginBottom: 8,
  },
  price: {
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 16,
  },
  description: {
    fontSize: 15,
    color: '#3A3A3C',
    lineHeight: 22,
    marginBottom: 16,
  },
  category: {
    fontSize: 13,
    color: '#8E8E93',
    fontStyle: 'italic',
  },
  vendorBox: {
    backgroundColor: '#F8F9FA',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    marginVertical: 16,
  },
  vendorHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  vendorLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#8E8E93',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  vendorName: {
    fontSize: 16,
    color: '#1C1C1E',
    fontWeight: '700',
  },
  vendorEmail: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 1,
  },
  vendorAddress: {
    fontSize: 12,
    color: '#5856D6',
    marginTop: 4,
  },
  vendorStatusDotContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  vendorStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#4CAF50',
    marginRight: 6,
  },
  vendorStatusText: {
    color: '#4CAF50',
    fontSize: 10,
    fontWeight: '700',
  },
  communicationTray: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  commButton: {
    flex: 1,
    height: 38,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 3,
  },
  commButtonText: {
    fontSize: 11,
    fontWeight: '700',
  },
  reviewsSection: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    paddingBottom: 100, // Make room for fixed footer
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 16,
    color: '#1C1C1E',
  },
  addReviewBox: {
    backgroundColor: '#F8F9FA',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    marginBottom: 24,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: '#3A3A3C',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D1D6',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 12,
    color: '#1C1C1E',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  submitBtn: {
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  noReviews: {
    color: '#8E8E93',
    fontStyle: 'italic',
    textAlign: 'center',
    marginVertical: 20,
  },
  reviewCard: {
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F7',
    paddingVertical: 16,
  },
  reviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  reviewerName: {
    fontWeight: '700',
    color: '#1C1C1E',
    fontSize: 14,
  },
  ratingStars: {
    fontSize: 11,
  },
  reviewComment: {
    color: '#3A3A3C',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 6,
  },
  reviewDate: {
    fontSize: 11,
    color: '#AEAEB2',
  },
  fixedFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E5EA',
  },
  // Aggregated ratings summary
  ratingsSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    padding: 16,
    marginBottom: 20,
  },
  ratingsBigNum: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginRight: 16,
  },
  ratingsBigValue: {
    fontSize: 36,
    fontWeight: '900',
  },
  ratingsOutOf: {
    fontSize: 14,
    color: '#8E8E93',
    marginLeft: 4,
    fontWeight: '600',
  },
  ratingsRight: {
    flex: 1,
  },
  ratingsStarsRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  ratingsStarChar: {
    fontSize: 20,
    marginRight: 2,
  },
  ratingsCount: {
    fontSize: 12,
    color: '#8E8E93',
    fontWeight: '500',
  },
  addToCartBtn: {
    height: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  addToCartBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  // Chat Simulator overlay styles
  chatContainer: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  chatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 48 : 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderColor: '#E5E5EA',
  },
  chatHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  chatBackBtn: {
    marginRight: 12,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatBackBtnText: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1C1C1E',
  },
  chatHeaderTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  chatHeaderStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  statusDotGreen: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#4CAF50',
    marginRight: 4,
  },
  chatHeaderStatusText: {
    color: '#8E8E93',
    fontSize: 11,
  },
  chatCloseBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#F2F2F7',
  },
  chatCloseBtnText: {
    fontSize: 13,
    color: '#8E8E93',
    fontWeight: '600',
  },
  chatMessagesList: {
    padding: 16,
    paddingBottom: 32,
  },
  msgWrapper: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  msgLeft: {
    justifyContent: 'flex-start',
  },
  msgRight: {
    justifyContent: 'flex-end',
  },
  msgBubble: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  msgBubbleVendor: {
    backgroundColor: '#FFFFFF',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  msgText: {
    fontSize: 14,
    lineHeight: 20,
  },
  msgTextMe: {
    color: '#FFFFFF',
  },
  msgTextVendor: {
    color: '#1C1C1E',
  },
  msgTime: {
    fontSize: 9,
    marginTop: 4,
    textAlign: 'right',
  },
  msgTimeMe: {
    color: 'rgba(255,255,255,0.7)',
  },
  msgTimeVendor: {
    color: '#AEAEB2',
  },
  typingBubble: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  typingText: {
    color: '#8E8E93',
    fontStyle: 'italic',
    fontSize: 12,
  },
  chatInputRow: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderColor: '#E5E5EA',
    alignItems: 'center',
    paddingBottom: Platform.OS === 'ios' ? 24 : 12,
  },
  chatInput: {
    flex: 1,
    backgroundColor: '#F2F2F7',
    height: 40,
    borderRadius: 20,
    paddingHorizontal: 16,
    fontSize: 14,
    color: '#1C1C1E',
    marginRight: 10,
  },
  chatSendBtn: {
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chatSendBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
});
