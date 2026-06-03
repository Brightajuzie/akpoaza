import React, { useEffect, useState, useContext, useRef } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, TouchableOpacity, Alert, TextInput, Modal, KeyboardAvoidingView, Platform } from 'react-native';
import apiClient from '../api/client';
import { SettingsContext } from '../context/SettingsContext';

interface ChatMessage {
  id: string;
  text: string;
  sender: 'customer' | 'provider';
  timestamp: Date;
}

export default function ServicesScreen({ navigation }: any) {
  const [services, setServices] = useState<any[]>([]);
  const [filteredServices, setFilteredServices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const { theme } = useContext(SettingsContext);

  // Service ratings map: serviceId -> { averageRating, count }
  const [ratingsMap, setRatingsMap] = useState<Record<string, { averageRating: number | null; count: number }>>({});

  // Chat simulator state
  const [chatVisible, setChatVisible] = useState(false);
  const [selectedService, setSelectedService] = useState<any>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [typeMessage, setTypeMessage] = useState('');
  const [typing, setTyping] = useState(false);
  const chatFlatListRef = useRef<FlatList>(null);

  const categories = ['All', 'Plumbing', 'Electrical', 'General'];

  const fetchServices = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get('/services');
      const fetchedServices = response.data;
      setServices(fetchedServices);
      setFilteredServices(fetchedServices);

      // Fetch ratings for each service in parallel
      const ratingResults = await Promise.allSettled(
        fetchedServices.map((s: any) =>
          apiClient.get(`/reviews/service/${s.id}`).then((r) => ({ id: s.id, data: r.data }))
        )
      );
      const map: Record<string, { averageRating: number | null; count: number }> = {};
      ratingResults.forEach((result) => {
        if (result.status === 'fulfilled') {
          const { id, data } = result.value;
          map[id] = { averageRating: data.averageRating, count: data.count };
        }
      });
      setRatingsMap(map);
    } catch (error) {
      console.error('Failed to fetch services', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchServices();
  }, []);

  useEffect(() => {
    let result = services;

    // Apply search filter
    if (search.trim()) {
      result = result.filter(s => 
        s.name.toLowerCase().includes(search.toLowerCase()) || 
        s.description.toLowerCase().includes(search.toLowerCase())
      );
    }

    // Apply category filter
    if (selectedCategory !== 'All') {
      result = result.filter(s => s.category.toLowerCase() === selectedCategory.toLowerCase());
    }

    setFilteredServices(result);
  }, [search, selectedCategory, services]);

  const handleBookService = (service: any) => {
    // Allow guests to navigate — BookingSetupScreen handles its own auth gate
    navigation.navigate('BookingSetup', { service });
  };

  // Communication Simulation triggers
  const handleCallSimulate = (service: any) => {
    Alert.alert(
      '📞 Call Dialing Simulator',
      `Connecting to closest certified technician specializing in: ${service.name}\nSpecialist: Bob Builder (Specialty: ${service.category})\n\nStatus: DIALING...`,
      [{ text: 'End Call', style: 'cancel' }]
    );
  };

  const handleWhatsAppSimulate = (service: any) => {
    const msg = `Hi, I am looking for a qualified specialist for "${service.name}". I saw your service on Handyman E-Commerce. Is anyone available for booking tomorrow?`;
    Alert.alert(
      '💬 WhatsApp Redirection Simulator',
      `Opening WhatsApp thread...\n\nRecipient: Closest ${service.category} Expert\n\nPre-filled text:\n"${msg}"`,
      [{ text: 'Open WhatsApp', onPress: () => {} }, { text: 'Cancel', style: 'cancel' }]
    );
  };

  const handleOpenChat = (service: any) => {
    setSelectedService(service);
    setChatVisible(true);
    setChatMessages([
      {
        id: '1',
        text: `Hi there! I am Bob the Builder, your closest verified expert for "${service.name}". I am online and currently in your area! What repair do you need help with?`,
        sender: 'provider',
        timestamp: new Date()
      }
    ]);
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
      
      let replyText = `I can definitely help you with that repair! Feel free to book the appointment slot using the 'Book Now' button in the app. I will immediately confirm and be on my way!`;
      const lowercaseUser = userMsg.toLowerCase();
      if (lowercaseUser.includes('cost') || lowercaseUser.includes('price') || lowercaseUser.includes('expensive')) {
        replyText = `Our base hourly rate is $${selectedService.basePrice.toFixed(2)}/hr. This includes standard diagnostic checking and tools!`;
      } else if (lowercaseUser.includes('time') || lowercaseUser.includes('when') || lowercaseUser.includes('tomorrow') || lowercaseUser.includes('today')) {
        replyText = `I have open slots available today and tomorrow! If you schedule now via 'Book Now', I will peg my GPS route coordinates directly to your house!`;
      }

      setChatMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        text: replyText,
        sender: 'provider',
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

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header Search Bar */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>Find a Professional</Text>
        <TextInput
          style={styles.searchBar}
          placeholder="🔍 Search plumbing, electrical, assembly..."
          value={search}
          onChangeText={setSearch}
          placeholderTextColor="#8E8E93"
        />
      </View>

      {/* Category Selection Filter Pills */}
      <View style={styles.categoryContainer}>
        <FlatList
          data={categories}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => item}
          contentContainerStyle={styles.categoryList}
          renderItem={({ item }) => {
            const isActive = selectedCategory === item;
            return (
              <TouchableOpacity
                style={[
                  styles.categoryPill,
                  isActive && { backgroundColor: theme.primary, borderColor: theme.primary }
                ]}
                onPress={() => setSelectedCategory(item)}
              >
                <Text
                  style={[
                    styles.categoryText,
                    isActive && styles.activeCategoryText
                  ]}
                >
                  {item}
                </Text>
              </TouchableOpacity>
            );
          }}
        />
      </View>

      {/* Services List */}
      <FlatList
        data={filteredServices}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContainer}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => {
          const isFeatured = item.featured;
          return (
            <View 
              style={[
                styles.card, 
                isFeatured && {
                  borderColor: '#FF9500',
                  borderWidth: 2,
                  shadowColor: '#FF9500',
                  shadowOpacity: 0.1,
                }
              ]}
            >
              {isFeatured && (
                <View style={styles.promotedBadge}>
                  <Text style={styles.promotedBadgeText}>🔥 Featured Service</Text>
                </View>
              )}

              <View style={styles.cardHeader}>
                <View style={styles.titleColumn}>
                  <Text style={styles.name}>{item.name}</Text>
                  <Text style={[styles.categoryBadge, { color: theme.primary }]}>
                    {item.category}
                  </Text>
                  {/* Star Rating Row */}
                  {ratingsMap[item.id] && ratingsMap[item.id].averageRating !== null && (
                    <View style={styles.ratingRow}>
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Text
                          key={s}
                          style={[
                            styles.ratingStar,
                            s <= Math.round(ratingsMap[item.id]!.averageRating!) ? styles.ratingStarOn : styles.ratingStarOff,
                          ]}
                        >
                          ★
                        </Text>
                      ))}
                      <Text style={styles.ratingCount}>
                        {ratingsMap[item.id]!.averageRating!.toFixed(1)} ({ratingsMap[item.id]!.count})
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={styles.price}>
                  ${item.basePrice.toFixed(0)}
                  <Text style={styles.baseLabel}>/hr base</Text>
                </Text>
              </View>
              
              <Text style={styles.desc} numberOfLines={2}>
                {item.description}
              </Text>

              {/* Service Cards CTA buttons tray */}
              <View style={styles.actionsRow}>
                <TouchableOpacity 
                  style={[styles.contactBtn, { borderColor: theme.primary }]}
                  onPress={() => handleOpenChat(item)}
                >
                  <Text style={[styles.contactBtnText, { color: theme.primary }]}>💬 Contact Specialist</Text>
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={[styles.bookButton, { backgroundColor: theme.primary }]} 
                  onPress={() => handleBookService(item)}
                >
                  <Text style={styles.bookButtonText}>Book Now</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No services found matching filters.</Text>
          </View>
        }
      />

      {/* CHAT WITH TECHNICIAN SIMULATOR MODAL */}
      <Modal
        visible={chatVisible}
        animationType="slide"
        onRequestClose={() => setChatVisible(false)}
      >
        {selectedService && (
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
                  <Text style={styles.chatHeaderTitle}>Bob Builder ({selectedService.category})</Text>
                  <View style={styles.chatHeaderStatusRow}>
                    <View style={styles.statusDotGreen} />
                    <Text style={styles.chatHeaderStatusText}>Simulated Technician Bot</Text>
                  </View>
                </View>
              </View>
              
              <View style={styles.chatHeaderRight}>
                <TouchableOpacity 
                  style={styles.headerSimCall}
                  onPress={() => handleCallSimulate(selectedService)}
                >
                  <Text style={styles.headerSimCallText}>📞 Call</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.headerSimCall}
                  onPress={() => handleWhatsAppSimulate(selectedService)}
                >
                  <Text style={[styles.headerSimCallText, { color: '#25D366' }]}>💬 WA</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Chat message listing */}
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
                      <Text style={styles.typingText}>Technician is typing...</Text>
                    </View>
                  </View>
                ) : null
              }
            />

            {/* Messages Input Box */}
            <View style={styles.chatInputRow}>
              <TextInput
                style={styles.chatInput}
                placeholder="Ask about availability, emergency repair..."
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
        )}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    padding: 20,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderColor: '#E5E5EA',
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 12,
  },
  searchBar: {
    backgroundColor: '#F2F2F7',
    height: 44,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 15,
    color: '#1C1C1E',
  },
  categoryContainer: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: '#E5E5EA',
  },
  categoryList: {
    paddingHorizontal: 16,
  },
  categoryPill: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: '#F2F2F7',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#F2F2F7',
  },
  categoryText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8E8E93',
  },
  activeCategoryText: {
    color: '#FFFFFF',
  },
  listContainer: {
    padding: 16,
  },
  card: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    borderRadius: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    position: 'relative',
  },
  promotedBadge: {
    position: 'absolute',
    top: -12,
    left: 16,
    backgroundColor: '#FF9500',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  promotedBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
    marginTop: 4,
  },
  titleColumn: {
    flex: 1,
    marginRight: 8,
  },
  name: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1C1C1E',
    marginBottom: 4,
  },
  categoryBadge: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  price: {
    fontSize: 20,
    fontWeight: '800',
    color: '#34C759',
    textAlign: 'right',
  },
  baseLabel: {
    fontSize: 11,
    color: '#8E8E93',
    fontWeight: '400',
  },
  desc: {
    color: '#8E8E93',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 20,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  contactBtn: {
    flex: 1,
    height: 46,
    borderRadius: 10,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  contactBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  bookButton: {
    flex: 1,
    height: 46,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bookButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 40,
  },
  emptyText: {
    fontSize: 15,
    color: '#8E8E93',
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 2,
  },
  ratingStar: {
    fontSize: 13,
    marginRight: 1,
  },
  ratingStarOn: {
    color: '#FFD700',
  },
  ratingStarOff: {
    color: '#E5E5EA',
  },
  ratingCount: {
    fontSize: 11,
    color: '#8E8E93',
    marginLeft: 4,
    fontWeight: '600',
  },
  // Chat Simulator Modal Styles
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
    fontSize: 15,
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
  chatHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerSimCall: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#F2F2F7',
    borderRadius: 6,
    marginLeft: 6,
  },
  headerSimCallText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#007AFF',
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
