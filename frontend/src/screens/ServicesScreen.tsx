import React, { useEffect, useState, useContext, useRef } from 'react';
import {
  View, Text, FlatList, StyleSheet, ActivityIndicator,
  TouchableOpacity, Alert, TextInput, Modal,
  KeyboardAvoidingView, Platform, useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import apiClient from '../api/client';
import { SettingsContext } from '../context/SettingsContext';
import { useCurrency } from '../context/CurrencyContext';
import FloatingCartBar from '../components/FloatingCartBar';

interface ChatMessage {
  id: string; text: string;
  sender: 'customer' | 'provider'; timestamp: Date;
}

const CATEGORY_CONFIG: Record<string, { icon: string; color: string; bg: string }> = {
  'Plumbing':    { icon: '🚿', color: '#3B82F6', bg: '#EFF6FF' },
  'Electrical':  { icon: '⚡', color: '#F59E0B', bg: '#FFFBEB' },
  'General':     { icon: '🔧', color: '#10B981', bg: '#F0FDF4' },
  'Carpentry':   { icon: '🪚', color: '#8B5CF6', bg: '#F5F3FF' },
  'Painting':    { icon: '🖌️', color: '#EC4899', bg: '#FDF2F8' },
  'Cleaning':    { icon: '🧹', color: '#06B6D4', bg: '#ECFEFF' },
  'HVAC':        { icon: '❄️', color: '#0EA5E9', bg: '#F0F9FF' },
  'default':     { icon: '🛠️', color: '#64748B', bg: '#F8FAFC' },
};

export default function ServicesScreen({ navigation }: any) {
  const [services, setServices] = useState<any[]>([]);
  const [filteredServices, setFilteredServices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [ratingsMap, setRatingsMap] = useState<Record<string, { averageRating: number | null; count: number }>>({});

  const { theme, colorMode } = useContext(SettingsContext);
  const { fmt } = useCurrency();
  const { width } = useWindowDimensions();
  const isDark = colorMode === 'dark';
  const numColumns = width >= 1200 ? 3 : width >= 768 ? 2 : 1;

  // Chat state
  const [chatVisible, setChatVisible] = useState(false);
  const [selectedService, setSelectedService] = useState<any>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [typeMessage, setTypeMessage] = useState('');
  const [typing, setTyping] = useState(false);
  const chatListRef = useRef<FlatList>(null);

  const fetchServices = async () => {
    try {
      setLoading(true);
      const res = await apiClient.get('/services');
      const data = res.data;
      setServices(data);
      setFilteredServices(data);

      const ratings = await Promise.allSettled(
        data.map((s: any) =>
          apiClient.get(`/reviews/service/${s.id}`).then(r => ({ id: s.id, data: r.data }))
        )
      );
      const map: Record<string, { averageRating: number | null; count: number }> = {};
      ratings.forEach(r => {
        if (r.status === 'fulfilled') map[r.value.id] = r.value.data;
      });
      setRatingsMap(map);
    } catch (e) {
      console.error('Failed to fetch services', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchServices(); }, []);

  const categories = ['All', ...Array.from(new Set(services.map((s: any) => s.category).filter(Boolean)))];

  useEffect(() => {
    let result = services;
    if (search.trim()) {
      result = result.filter(s =>
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.description.toLowerCase().includes(search.toLowerCase())
      );
    }
    if (selectedCategory !== 'All') {
      result = result.filter(s => s.category === selectedCategory);
    }
    setFilteredServices(result);
  }, [search, selectedCategory, services]);

  const handleBookService = (service: any) =>
    navigation.navigate('BookingSetup', { service });

  const handleCallSimulate = (service: any) =>
    Alert.alert('📞 Calling Specialist', `Connecting to the nearest certified ${service.category} technician...\n\nStatus: DIALING...`, [{ text: 'End Call', style: 'cancel' }]);

  const handleWhatsAppSimulate = (service: any) => {
    const msg = `Hi, I'm looking for a "${service.name}" specialist. I found you on FixMart. Are you available?`;
    Alert.alert('💬 WhatsApp', `Opening chat with nearest ${service.category} expert...\n\nMessage: "${msg}"`,
      [{ text: 'Open WhatsApp' }, { text: 'Cancel', style: 'cancel' }]);
  };

  const handleOpenChat = (service: any) => {
    setSelectedService(service);
    setChatVisible(true);
    setChatMessages([{
      id: '1',
      text: `Hi! I'm Bob, your nearest verified ${service.category} specialist. I'm currently in your area. What do you need help with?`,
      sender: 'provider', timestamp: new Date(),
    }]);
  };

  const handleSendMessage = () => {
    if (!typeMessage.trim()) return;
    const msg: ChatMessage = { id: Date.now().toString(), text: typeMessage.trim(), sender: 'customer', timestamp: new Date() };
    setChatMessages(prev => [...prev, msg]);
    const text = typeMessage.toLowerCase();
    setTypeMessage('');
    setTyping(true);
    setTimeout(() => {
      setTyping(false);
      let reply = `I can definitely help! Use the 'Book Now' button to confirm your slot and I'll head over immediately.`;
      if (text.includes('cost') || text.includes('price')) {
        reply = `Our base rate is ${fmt(selectedService.basePrice)}/hr, which includes diagnostic checks and standard tools!`;
      } else if (text.includes('time') || text.includes('when') || text.includes('today')) {
        reply = `I have open slots today and tomorrow! Book now and I'll GPS-route directly to your location.`;
      }
      setChatMessages(prev => [...prev, { id: (Date.now() + 1).toString(), text: reply, sender: 'provider', timestamp: new Date() }]);
    }, 1500);
  };

  useEffect(() => {
    setTimeout(() => chatListRef.current?.scrollToEnd({ animated: true }), 100);
  }, [chatMessages, typing]);

  const getCatConf = (cat: string) => CATEGORY_CONFIG[cat] || CATEGORY_CONFIG['default'];

  const renderStars = (serviceId: string) => {
    const r = ratingsMap[serviceId];
    if (!r || r.averageRating === null) return null;
    return (
      <View style={styles.ratingRow}>
        {[1, 2, 3, 4, 5].map(s => (
          <Text key={s} style={[styles.star, { color: s <= Math.round(r.averageRating!) ? '#F59E0B' : (isDark ? '#334155' : '#E2E8F0') }]}>★</Text>
        ))}
        <Text style={[styles.ratingLabel, { color: isDark ? '#64748B' : '#94A3B8' }]}>
          {r.averageRating!.toFixed(1)} ({r.count})
        </Text>
      </View>
    );
  };

  const renderServiceCard = ({ item }: any) => {
    const isFeatured = item.featured;
    const conf = getCatConf(item.category);

    return (
      <View style={[
        styles.card,
        { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderColor: isFeatured ? '#F59E0B' : (isDark ? '#334155' : '#E2E8F0') },
        isFeatured && { borderWidth: 2 },
        { margin: 8, flex: numColumns > 1 ? 1 : undefined },
      ]}>
        {/* Top accent */}
        <View style={[styles.cardAccent, { backgroundColor: conf.color }]} />

        {isFeatured && (
          <View style={styles.featuredBadge}>
            <Text style={styles.featuredBadgeText}>🔥 FEATURED</Text>
          </View>
        )}

        <View style={styles.cardMain}>
          {/* Icon + Category */}
          <View style={[styles.catIconWrap, { backgroundColor: isDark ? conf.color + '22' : conf.bg }]}>
            <Text style={styles.catIcon}>{conf.icon}</Text>
          </View>

          <View style={styles.cardInfo}>
            {/* Category pill */}
            <View style={[styles.catPill, { backgroundColor: isDark ? conf.color + '22' : conf.bg }]}>
              <Text style={[styles.catPillText, { color: conf.color }]}>{item.category}</Text>
            </View>
            <Text style={[styles.cardName, { color: isDark ? '#F1F5F9' : '#0F172A' }]} numberOfLines={2}>
              {item.name}
            </Text>
            {renderStars(item.id)}
          </View>

          {/* Price */}
          <View style={styles.priceBlock}>
            <Text style={[styles.priceVal, { color: theme.primary }]}>{fmt(item.basePrice)}</Text>
            <Text style={[styles.priceUnit, { color: isDark ? '#64748B' : '#94A3B8' }]}>/hr</Text>
          </View>
        </View>

        <Text style={[styles.cardDesc, { color: isDark ? '#64748B' : '#94A3B8' }]} numberOfLines={2}>
          {item.description}
        </Text>

        {/* CTA Row */}
        <View style={styles.ctaRow}>
          <TouchableOpacity
            style={[styles.ctaOutline, { borderColor: theme.primary + '60' }]}
            onPress={() => handleOpenChat(item)}
            activeOpacity={0.82}
          >
            <Text style={[styles.ctaOutlineText, { color: theme.primary }]}>💬 Contact</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.ctaFilled, { backgroundColor: theme.primary }]}
            onPress={() => handleBookService(item)}
            activeOpacity={0.85}
          >
            <Text style={styles.ctaFilledText}>Book Now →</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <View style={[styles.header, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderBottomColor: isDark ? '#334155' : '#E2E8F0' }]}>
        <Text style={[styles.pageTitle, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>🛠️ Find a Professional</Text>
        <Text style={[styles.pageSubtitle, { color: isDark ? '#64748B' : '#94A3B8' }]}>
          Verified specialists near you
        </Text>

        {/* Search */}
        <View style={[
          styles.searchBar,
          { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderColor: searchFocused ? theme.primary : (isDark ? '#334155' : '#E2E8F0') }
        ]}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={[styles.searchInput, { color: isDark ? '#F1F5F9' : '#0F172A' }]}
            placeholder="Search plumbing, electrical, cleaning..."
            placeholderTextColor={isDark ? '#475569' : '#94A3B8'}
            value={search}
            onChangeText={setSearch}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')} style={styles.clearBtn}>
              <Text style={[styles.clearBtnText, { color: isDark ? '#64748B' : '#94A3B8' }]}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Category Pills */}
        <FlatList
          data={categories}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={c => c}
          contentContainerStyle={styles.pillList}
          renderItem={({ item }) => {
            const active = selectedCategory === item;
            const conf = item !== 'All' ? getCatConf(item) : null;
            return (
              <TouchableOpacity
                style={[
                  styles.pill,
                  { backgroundColor: active ? (conf?.color || theme.primary) : (isDark ? '#0F172A' : '#F1F5F9'), borderColor: active ? (conf?.color || theme.primary) : (isDark ? '#334155' : '#E2E8F0') }
                ]}
                onPress={() => setSelectedCategory(item)}
              >
                {conf && <Text style={styles.pillIcon}>{conf.icon}</Text>}
                <Text style={[styles.pillText, { color: active ? '#FFF' : (isDark ? '#94A3B8' : '#64748B') }]}>{item}</Text>
              </TouchableOpacity>
            );
          }}
        />
      </View>

      {/* ── Services Grid ─────────────────────────────────────────────────── */}
      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.loadingText, { color: isDark ? '#64748B' : '#94A3B8' }]}>Loading services...</Text>
        </View>
      ) : (
        <FlatList
          key={`svc-${numColumns}`}
          data={filteredServices}
          keyExtractor={i => i.id}
          numColumns={numColumns}
          contentContainerStyle={[styles.list, { paddingBottom: 110 }]}
          showsVerticalScrollIndicator={false}
          renderItem={renderServiceCard}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyIcon}>🔍</Text>
              <Text style={[styles.emptyTitle, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>No services found</Text>
              <Text style={[styles.emptySub, { color: isDark ? '#64748B' : '#94A3B8' }]}>Try a different search or category</Text>
              <TouchableOpacity
                style={[styles.emptyReset, { backgroundColor: theme.primary }]}
                onPress={() => { setSearch(''); setSelectedCategory('All'); }}
              >
                <Text style={styles.emptyResetText}>Clear Filters</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}

      <FloatingCartBar />

      {/* ── Chat Modal ────────────────────────────────────────────────────── */}
      <Modal visible={chatVisible} animationType="slide" onRequestClose={() => setChatVisible(false)}>
        {selectedService && (
          <KeyboardAvoidingView
            style={[styles.chatRoot, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC' }]}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
          >
            {/* Chat Header */}
            <View style={[styles.chatHeader, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderBottomColor: isDark ? '#334155' : '#E2E8F0' }]}>
              <View style={styles.chatHeaderLeft}>
                <TouchableOpacity onPress={() => setChatVisible(false)} style={styles.backBtn}>
                  <Text style={[styles.backBtnText, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>←</Text>
                </TouchableOpacity>
                <View style={[styles.chatAvatar, { backgroundColor: getCatConf(selectedService.category).color + '20' }]}>
                  <Text style={styles.chatAvatarText}>{getCatConf(selectedService.category).icon}</Text>
                </View>
                <View>
                  <Text style={[styles.chatName, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>Bob Builder</Text>
                  <View style={styles.onlineRow}>
                    <View style={styles.onlineDot} />
                    <Text style={[styles.onlineText, { color: isDark ? '#64748B' : '#94A3B8' }]}>Online · {selectedService.category} Specialist</Text>
                  </View>
                </View>
              </View>
              <View style={styles.chatHeaderRight}>
                <TouchableOpacity style={[styles.chatQuickBtn, { backgroundColor: isDark ? '#0F172A' : '#F1F5F9' }]} onPress={() => handleCallSimulate(selectedService)}>
                  <Text style={[styles.chatQuickBtnText, { color: '#3B82F6' }]}>📞 Call</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.chatQuickBtn, { backgroundColor: isDark ? '#0F172A' : '#F1F5F9' }]} onPress={() => handleWhatsAppSimulate(selectedService)}>
                  <Text style={[styles.chatQuickBtnText, { color: '#25D366' }]}>💬 WA</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Messages */}
            <FlatList
              ref={chatListRef}
              data={chatMessages}
              keyExtractor={i => i.id}
              contentContainerStyle={styles.msgList}
              renderItem={({ item }) => {
                const isMe = item.sender === 'customer';
                return (
                  <View style={[styles.msgWrap, isMe ? styles.msgRight : styles.msgLeft]}>
                    <View style={[
                      styles.bubble,
                      isMe
                        ? { backgroundColor: theme.primary, borderBottomRightRadius: 4 }
                        : { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderBottomLeftRadius: 4, borderWidth: 1, borderColor: isDark ? '#334155' : '#E2E8F0' }
                    ]}>
                      <Text style={[styles.bubbleText, { color: isMe ? '#FFF' : (isDark ? '#F1F5F9' : '#0F172A') }]}>
                        {item.text}
                      </Text>
                      <Text style={[styles.bubbleTime, { color: isMe ? 'rgba(255,255,255,0.6)' : (isDark ? '#475569' : '#94A3B8') }]}>
                        {item.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </View>
                  </View>
                );
              }}
              ListFooterComponent={typing ? (
                <View style={[styles.msgWrap, styles.msgLeft]}>
                  <View style={[styles.bubble, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderBottomLeftRadius: 4, borderWidth: 1, borderColor: isDark ? '#334155' : '#E2E8F0' }]}>
                    <Text style={[styles.typingText, { color: isDark ? '#64748B' : '#94A3B8' }]}>Typing...</Text>
                  </View>
                </View>
              ) : null}
            />

            {/* Input */}
            <View style={[styles.inputRow, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderTopColor: isDark ? '#334155' : '#E2E8F0' }]}>
              <TextInput
                style={[styles.chatInput, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', color: isDark ? '#F1F5F9' : '#0F172A' }]}
                placeholder="Ask about availability, pricing..."
                placeholderTextColor={isDark ? '#475569' : '#94A3B8'}
                value={typeMessage}
                onChangeText={setTypeMessage}
              />
              <TouchableOpacity style={[styles.sendBtn, { backgroundColor: theme.primary }]} onPress={handleSendMessage}>
                <Text style={styles.sendBtnText}>Send →</Text>
              </TouchableOpacity>
            </View>

            {/* Book CTA inside chat */}
            <TouchableOpacity
              style={[styles.chatBookBtn, { backgroundColor: theme.primary }]}
              onPress={() => { setChatVisible(false); handleBookService(selectedService); }}
            >
              <Text style={styles.chatBookBtnText}>📅 Book {selectedService.name} Now</Text>
            </TouchableOpacity>
          </KeyboardAvoidingView>
        )}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  // Header
  header: {
    borderBottomWidth: 1,
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 8 : 12,
    paddingBottom: 8,
  },
  pageTitle: { fontSize: 22, fontWeight: '900', letterSpacing: -0.5, marginBottom: 2 },
  pageSubtitle: { fontSize: 12, fontWeight: '500', marginBottom: 12 },
  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 12, borderWidth: 1.5,
    paddingHorizontal: 12, marginBottom: 10,
    paddingVertical: Platform.OS === 'ios' ? 10 : 2,
  },
  searchIcon: { fontSize: 15, marginRight: 8 },
  searchInput: { flex: 1, fontSize: 14, fontWeight: '500', paddingVertical: 8 },
  clearBtn: { padding: 6 },
  clearBtnText: { fontSize: 13, fontWeight: '700' },
  pillList: { gap: 6, paddingBottom: 6 },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1,
  },
  pillIcon: { fontSize: 13 },
  pillText: { fontSize: 12, fontWeight: '700' },

  // Loading
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { fontSize: 13, fontWeight: '500' },
  list: { padding: 4 },

  // Service card
  card: {
    borderRadius: 18, borderWidth: 1,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 3,
  },
  cardAccent: { height: 4, width: '100%' },
  featuredBadge: {
    position: 'absolute', top: 12, right: 12,
    backgroundColor: '#EF4444',
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
  },
  featuredBadgeText: { color: '#FFF', fontSize: 8, fontWeight: '800' },
  cardMain: {
    flexDirection: 'row', alignItems: 'flex-start',
    padding: 14, gap: 12,
  },
  catIconWrap: {
    width: 48, height: 48, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  catIcon: { fontSize: 24 },
  cardInfo: { flex: 1 },
  catPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 20, marginBottom: 4,
  },
  catPillText: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },
  cardName: { fontSize: 15, fontWeight: '800', lineHeight: 20, marginBottom: 4 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 1 },
  star: { fontSize: 12 },
  ratingLabel: { fontSize: 10, fontWeight: '600', marginLeft: 4 },
  priceBlock: { alignItems: 'flex-end', paddingTop: 2 },
  priceVal: { fontSize: 18, fontWeight: '900' },
  priceUnit: { fontSize: 10, fontWeight: '600', marginTop: 1 },
  cardDesc: { fontSize: 12, lineHeight: 17, paddingHorizontal: 14, marginBottom: 14 },
  ctaRow: {
    flexDirection: 'row', gap: 10,
    paddingHorizontal: 14, paddingBottom: 14,
  },
  ctaOutline: {
    flex: 1, height: 42, borderRadius: 10,
    borderWidth: 1.5, alignItems: 'center', justifyContent: 'center',
  },
  ctaOutlineText: { fontSize: 12, fontWeight: '700' },
  ctaFilled: {
    flex: 1.2, height: 42, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.2, shadowRadius: 6, elevation: 3,
  },
  ctaFilledText: { color: '#FFF', fontSize: 13, fontWeight: '800' },

  // Empty
  emptyWrap: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 32 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '800', marginBottom: 6 },
  emptySub: { fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  emptyReset: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  emptyResetText: { color: '#FFF', fontWeight: '700', fontSize: 14 },

  // Chat modal
  chatRoot: { flex: 1 },
  chatHeader: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: Platform.OS === 'ios' ? 52 : 14,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  chatHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  backBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', marginRight: 4 },
  backBtnText: { fontSize: 22, fontWeight: '700' },
  chatAvatar: {
    width: 38, height: 38, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  chatAvatarText: { fontSize: 20 },
  chatName: { fontSize: 14, fontWeight: '800' },
  onlineRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  onlineDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#22C55E', marginRight: 5 },
  onlineText: { fontSize: 11 },
  chatHeaderRight: { flexDirection: 'row', gap: 6 },
  chatQuickBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  chatQuickBtnText: { fontSize: 11, fontWeight: '700' },
  msgList: { padding: 16, paddingBottom: 24 },
  msgWrap: { flexDirection: 'row', marginBottom: 12 },
  msgLeft: { justifyContent: 'flex-start' },
  msgRight: { justifyContent: 'flex-end' },
  bubble: {
    maxWidth: '80%', padding: 12, borderRadius: 16,
    shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
  },
  bubbleText: { fontSize: 14, lineHeight: 20 },
  bubbleTime: { fontSize: 9, marginTop: 4, textAlign: 'right' },
  typingText: { fontSize: 12, fontStyle: 'italic' },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1,
    paddingBottom: Platform.OS === 'ios' ? 20 : 10,
  },
  chatInput: {
    flex: 1, height: 42, borderRadius: 21,
    paddingHorizontal: 16, fontSize: 14,
  },
  sendBtn: {
    height: 42, paddingHorizontal: 16, borderRadius: 21,
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnText: { color: '#FFF', fontWeight: '800', fontSize: 13 },
  chatBookBtn: {
    marginHorizontal: 14, marginBottom: Platform.OS === 'ios' ? 32 : 14,
    marginTop: 4, paddingVertical: 14,
    borderRadius: 14, alignItems: 'center',
  },
  chatBookBtnText: { color: '#FFF', fontSize: 15, fontWeight: '800' },
});
