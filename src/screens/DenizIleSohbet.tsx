import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, fonts } from '../theme';
import { useAuth } from '../context/AuthContext';
import { api, ApiError } from '../api/client';
import { pickAndUploadImage } from '../utils/media';
import type { Match, Message } from '../api/types';
import type { RootStackParamList } from '../navigation/RootNavigator';

const POLL_INTERVAL_MS = 2500;

const Icon = ({
  name,
  size = 20,
  color = colors.foreground,
}: {
  name: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  size?: number;
  color?: string;
}) => <MaterialCommunityIcons name={name} size={size} color={color} />;

const Avatar = ({
  uri,
  size = 32,
  online = false,
  style,
}: {
  uri: string;
  size?: number;
  online?: boolean;
  style?: object;
}) => (
  <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }, style]}>
    <Image source={{ uri }} style={styles.fill} />
    {online && <View style={styles.onlineIndicator} />}
  </View>
);

const Bubble = ({
  children,
  outgoing = false,
  style,
}: {
  children: React.ReactNode;
  outgoing?: boolean;
  style?: object;
}) => <View style={[styles.bubble, outgoing ? styles.outgoingBubble : styles.incomingBubble, style]}>{children}</View>;

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

export default function DenizChatScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'Chat'>>();
  const { user } = useAuth();
  const { matchId } = route.params;

  const [match, setMatch] = useState<Match | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [otherTyping, setOtherTyping] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [sendingImage, setSendingImage] = useState(false);
  const [text, setText] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scrollRef = useRef<ScrollView>(null);
  const lastMessageIdRef = useRef(0);

  const fetchMessages = useCallback(async () => {
    try {
      const res = await api.messages(matchId);
      setError(null); // a poll just succeeded - clear any earlier "sohbet yüklenemedi"/404 banner
      setMessages(res.messages);
      setOtherTyping(res.otherTyping);
      const lastId = res.messages[res.messages.length - 1]?.id ?? 0;
      if (lastId !== lastMessageIdRef.current) {
        lastMessageIdRef.current = lastId;
        requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
      }
    } catch (err) {
      // Silent on poll failures - avoid flooding the UI with transient network errors.
      if (err instanceof ApiError && err.status === 404) {
        setError('Bu eşleşme artık mevcut değil.');
      }
    }
  }, [matchId]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      (async () => {
        try {
          const [matchRes] = await Promise.all([api.match(matchId), fetchMessages()]);
          if (!cancelled) setMatch(matchRes.match);
        } catch (err) {
          if (!cancelled) setError(err instanceof ApiError ? err.message : 'Sohbet yüklenemedi.');
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();

      const interval = setInterval(fetchMessages, POLL_INTERVAL_MS);
      return () => {
        cancelled = true;
        clearInterval(interval);
      };
    }, [matchId, fetchMessages])
  );

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setText('');
    try {
      await api.sendMessage(matchId, trimmed);
      setError(null); // a send just succeeded - clear any earlier "mesaj gönderilemedi" banner
      await fetchMessages();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Mesaj gönderilemedi.');
      setText(trimmed);
    } finally {
      setSending(false);
    }
  };

  const handleSendImage = async () => {
    if (sendingImage) return;
    setSendingImage(true);
    try {
      const url = await pickAndUploadImage();
      if (url) {
        await api.sendMessage(matchId, '', url);
        await fetchMessages();
      }
    } catch (err) {
      Alert.alert('Hata', err instanceof ApiError ? err.message : 'Fotoğraf gönderilemedi, tekrar dene.');
    } finally {
      setSendingImage(false);
    }
  };

  const handleReport = () => {
    setMenuOpen(false);
    Alert.alert(
      'Şikayet et',
      `${other.name} kullanıcısını uygunsuz davranış nedeniyle şikayet etmek istediğine emin misin?`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Şikayet et',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.reportUser(other.id, 'Sohbet ekranından bildirildi');
              Alert.alert('Şikayet alındı', 'Ekibimiz en kısa sürede inceleyecek.');
            } catch (err) {
              Alert.alert('Hata', err instanceof ApiError ? err.message : 'Şikayet gönderilemedi, tekrar dene.');
            }
          },
        },
      ]
    );
  };

  const handleBlock = () => {
    setMenuOpen(false);
    Alert.alert(
      'Engelle',
      `${other.name} artık seni bulamayacak ve bu eşleşme kaldırılacak. Emin misin?`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Engelle',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.blockUser(other.id);
              navigation.navigate('Radar');
            } catch (err) {
              Alert.alert('Hata', err instanceof ApiError ? err.message : 'Engellenemedi, tekrar dene.');
            }
          },
        },
      ]
    );
  };

  const handleUnmatch = () => {
    setMenuOpen(false);
    Alert.alert('Eşleşmeyi kaldır', `${match?.otherUser.name ?? 'Bu kişi'} ile eşleşmeni kaldırmak istediğine emin misin?`, [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Kaldır',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.unmatch(matchId);
            navigation.navigate('Radar');
          } catch (err) {
            Alert.alert('Hata', err instanceof ApiError ? err.message : 'Eşleşme kaldırılamadı.');
          }
        },
      },
    ]);
  };

  if (loading || !match) {
    return (
      <SafeAreaView style={[styles.safeArea, styles.centerState]}>
        {error ? (
          <>
            <Text style={styles.errorCenterText}>{error}</Text>
            <Pressable style={styles.backToRadarButton} onPress={() => navigation.navigate('Radar')}>
              <Text style={styles.backToRadarText}>Vibe Radar’a dön</Text>
            </Pressable>
          </>
        ) : (
          <ActivityIndicator color={colors.primary} size="large" />
        )}
      </SafeAreaView>
    );
  }

  const other = match.otherUser;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />

      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <LinearGradient colors={[colors.card, colors.background, colors.background]} style={styles.header}>
          <View style={styles.headerRow}>
            <Pressable accessibilityLabel="Geri dön" style={styles.roundButton} onPress={() => navigation.navigate('Radar')}>
              <Icon name="arrow-left" color={colors.cardForeground} />
            </Pressable>

            <Pressable
              style={styles.headerIdentityPress}
              accessibilityLabel={`${other.name} profilini gör`}
              onPress={() => navigation.navigate('ViewProfile', { userId: other.id })}
            >
              <Avatar uri={other.avatarUrl} size={48} online style={styles.profileAvatar} />

              <View style={styles.headerIdentity}>
                <View style={styles.nameRow}>
                  <Text numberOfLines={1} style={styles.name}>
                    {other.name}
                  </Text>
                  <View style={styles.matchBadge}>
                    <Text style={styles.matchText}>%{match.compatibility} Vibe Match</Text>
                  </View>
                </View>
                <View style={styles.activeRow}>
                  <View style={styles.activeDot} />
                  <Text style={styles.activeText}>{otherTyping ? `${other.name} yazıyor...` : 'Aktif şimdi'}</Text>
                </View>
              </View>
            </Pressable>

            <Pressable accessibilityLabel="Daha fazla seçenek" style={styles.roundButton} onPress={() => setMenuOpen((v) => !v)}>
              <Icon name="dots-vertical" color={colors.mutedForeground} />
            </Pressable>
          </View>

          {menuOpen && (
            <View style={styles.optionsMenu}>
              <Text style={styles.menuTitle}>SOHBET SEÇENEKLERİ</Text>
              <Pressable
                style={styles.menuItem}
                onPress={() => {
                  setMenuOpen(false);
                  navigation.navigate('ViewProfile', { userId: other.id });
                }}
              >
                <Icon name="account-circle-outline" size={18} color={colors.secondary} />
                <Text style={[styles.menuLabel, { color: colors.secondary }]}>Profili Gör</Text>
              </Pressable>
              <Pressable style={styles.menuItem} onPress={handleReport}>
                <Icon name="flag-outline" size={18} color={colors.mutedForeground} />
                <Text style={styles.menuLabel}>Şikayet Et</Text>
              </Pressable>
              <Pressable style={styles.menuItem} onPress={handleBlock}>
                <Icon name="cancel" size={18} color={colors.mutedForeground} />
                <Text style={styles.menuLabel}>Engelle</Text>
              </Pressable>
              <Pressable style={styles.menuItem} onPress={handleUnmatch}>
                <Icon name="heart-off-outline" size={18} color={colors.destructive} />
                <Text style={[styles.menuLabel, { color: colors.destructive }]}>Eşleşmeyi Kaldır</Text>
              </Pressable>
            </View>
          )}
        </LinearGradient>

        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        >
          <View style={styles.dateDivider}>
            <View style={styles.divider} />
            <Text style={styles.dateLabel}>BU GECE · {(other.neighbourhood || other.city).toUpperCase()}</Text>
            <View style={styles.divider} />
          </View>

          <LinearGradient
            colors={[colors.secondary, colors.card, colors.card]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.icebreakerCard}
          >
            <View style={styles.icebreakerIcon}>
              <Icon name="creation" size={18} color={colors.secondaryForeground} />
            </View>
            <View style={styles.icebreakerBody}>
              <View style={styles.icebreakerTitleRow}>
                <Text style={styles.icebreakerTitle}>ICEBREAKER · ORTAK CEVAP</Text>
                <Icon name="pin-outline" size={17} color={colors.secondary} />
              </View>
              <Text style={styles.question}>“{match.icebreaker.question}”</Text>

              {match.icebreaker.answerMine ? (
                <View style={styles.answerRow}>
                  <View style={styles.initialAvatar}>
                    <Text style={styles.initialText}>{(user?.name ?? 'S')[0]}</Text>
                  </View>
                  <Text style={styles.mutedSmall}>Sen seçtin</Text>
                  <View style={styles.songBadge}>
                    <Text style={styles.songText}>{match.icebreaker.answerMine}</Text>
                  </View>
                </View>
              ) : null}

              {match.icebreaker.answerTheirs ? (
                <View style={styles.answerRow}>
                  <Avatar uri={other.avatarUrl} size={24} style={styles.smallAvatar} />
                  <Text style={styles.mutedSmall}>{other.name}</Text>
                  <Text style={styles.answerText}>{match.icebreaker.answerTheirs}</Text>
                </View>
              ) : null}
            </View>
          </LinearGradient>

          {messages.length === 0 && (
            <View style={styles.emptyState}>
              <Icon name="chat-outline" size={26} color={colors.mutedForeground} />
              <Text style={styles.emptyStateText}>Henüz mesaj yok. İlk kıvılcımı sen çak!</Text>
            </View>
          )}

          <View style={styles.messages}>
            {messages.map((message) => {
              const fromMe = message.senderId === user?.id;
              return (
                <View key={message.id} style={fromMe ? styles.outgoingRow : styles.incomingRow}>
                  {!fromMe && <Avatar uri={other.avatarUrl} />}
                  <Bubble outgoing={fromMe} style={message.imageUrl ? styles.imageBubble : undefined}>
                    {message.imageUrl ? (
                      <Image source={{ uri: message.imageUrl }} style={styles.messageImage} resizeMode="cover" />
                    ) : null}
                    {message.text ? (
                      <Text style={fromMe ? styles.outgoingText : styles.messageText}>{message.text}</Text>
                    ) : null}
                    <View style={fromMe ? styles.outgoingMeta : undefined}>
                      <Text style={fromMe ? styles.outgoingTime : styles.time}>{formatTime(message.createdAt)}</Text>
                      {fromMe && <Icon name="check-all" size={15} color={colors.primaryForeground} />}
                    </View>
                  </Bubble>
                </View>
              );
            })}
          </View>

          {otherTyping && (
            <View style={styles.typingRow}>
              <View style={styles.typingDot} />
              <Text style={styles.typingText}>{other.name} yazıyor...</Text>
              <View style={styles.typingDot} />
            </View>
          )}

          {error && (
            <View style={styles.inlineError}>
              <Icon name="alert-circle-outline" size={16} color={colors.destructive} />
              <Text style={styles.inlineErrorText}>{error}</Text>
            </View>
          )}
        </ScrollView>

        <View style={styles.composerDock}>
          <View style={styles.composer}>
            <Pressable
              accessibilityLabel="Galeri"
              style={styles.composerButton}
              onPress={handleSendImage}
              disabled={sendingImage}
            >
              {sendingImage ? (
                <ActivityIndicator size="small" color={colors.mutedForeground} />
              ) : (
                <Icon name="image-plus" color={colors.mutedForeground} />
              )}
            </Pressable>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Bir şeyler yaz..."
              placeholderTextColor={colors.mutedForeground}
              style={styles.textInput}
              multiline
              onSubmitEditing={handleSend}
            />
            <Pressable
              accessibilityLabel="Gönder"
              style={[styles.sendButton, (!text.trim() || sending) && styles.sendButtonDisabled]}
              onPress={handleSend}
              disabled={!text.trim() || sending}
            >
              {sending ? <ActivityIndicator size="small" color={colors.secondaryForeground} /> : <Icon name="send" size={18} color={colors.secondaryForeground} />}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  centerState: { alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 24 },
  errorCenterText: { color: colors.mutedForeground, fontFamily: fonts.body, fontSize: 14, textAlign: 'center' },
  backToRadarButton: { paddingHorizontal: 18, paddingVertical: 12, borderRadius: 16, backgroundColor: colors.primary },
  backToRadarText: { color: colors.primaryForeground, fontFamily: fonts.heading, fontSize: 14, fontWeight: '800' },
  screen: { flex: 1, backgroundColor: colors.background },
  fill: { width: '100%', height: '100%' },
  header: {
    minHeight: 108,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  roundButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  profileAvatar: { borderWidth: 2, borderColor: colors.primary },
  avatar: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.muted,
  },
  onlineIndicator: {
    position: 'absolute',
    right: -1,
    bottom: -1,
    width: 13,
    height: 13,
    borderRadius: 7,
    backgroundColor: colors.success,
    borderWidth: 2,
    borderColor: colors.card,
  },
  headerIdentityPress: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerIdentity: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { color: colors.foreground, fontFamily: fonts.heading, fontSize: 18, fontWeight: '700' },
  matchBadge: { backgroundColor: colors.accent, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3 },
  matchText: { color: colors.accentForeground, fontFamily: fonts.body, fontSize: 10, fontWeight: '700' },
  activeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  activeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.success },
  activeText: { color: colors.success, fontFamily: fonts.body, fontSize: 12, fontWeight: '600' },
  optionsMenu: {
    position: 'absolute',
    top: 64,
    right: 16,
    zIndex: 5,
    width: 208,
    padding: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  menuTitle: {
    color: colors.mutedForeground,
    fontFamily: fonts.body,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.4,
    paddingHorizontal: 12,
    paddingBottom: 8,
    paddingTop: 3,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 10 },
  menuLabel: { fontFamily: fonts.body, fontSize: 14, fontWeight: '600', color: colors.foreground },
  content: { padding: 20, paddingBottom: 24, gap: 20 },
  dateDivider: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  divider: { width: 40, height: 1, backgroundColor: colors.border },
  dateLabel: { color: colors.mutedForeground, fontFamily: fonts.body, fontSize: 10, fontWeight: '700', letterSpacing: 1.5 },
  icebreakerCard: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.secondary,
    overflow: 'hidden',
  },
  icebreakerIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.secondary, alignItems: 'center', justifyContent: 'center' },
  icebreakerBody: { flex: 1 },
  icebreakerTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  icebreakerTitle: { color: colors.secondaryForeground, fontFamily: fonts.body, fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  question: { color: colors.cardForeground, fontFamily: fonts.heading, fontSize: 16, fontWeight: '700', marginTop: 8 },
  answerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  initialAvatar: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  initialText: { color: colors.primaryForeground, fontFamily: fonts.body, fontSize: 10, fontWeight: '700' },
  smallAvatar: { borderColor: colors.accent },
  mutedSmall: { color: colors.mutedForeground, fontFamily: fonts.body, fontSize: 12 },
  songBadge: { backgroundColor: colors.accent, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5 },
  songText: { color: colors.accentForeground, fontFamily: fonts.body, fontSize: 12, fontWeight: '700' },
  answerText: { flex: 1, color: colors.cardForeground, fontFamily: fonts.body, fontSize: 12, fontWeight: '600' },
  emptyState: { alignItems: 'center', gap: 8, paddingVertical: 12 },
  emptyStateText: { color: colors.mutedForeground, fontFamily: fonts.body, fontSize: 12, textAlign: 'center' },
  messages: { gap: 12 },
  incomingRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  outgoingRow: { alignItems: 'flex-end' },
  bubble: { maxWidth: '82%', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 20 },
  imageBubble: { padding: 6 },
  messageImage: { width: 200, height: 200, borderRadius: 16, marginBottom: 4 },
  incomingBubble: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderBottomLeftRadius: 6 },
  outgoingBubble: { backgroundColor: colors.primary, borderBottomRightRadius: 6 },
  messageText: { color: colors.cardForeground, fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  outgoingText: { color: colors.primaryForeground, fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  time: { color: colors.mutedForeground, fontFamily: fonts.body, fontSize: 10, fontWeight: '600', textAlign: 'right', marginTop: 6 },
  outgoingMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 5, marginTop: 6, opacity: 0.75 },
  outgoingTime: { color: colors.primaryForeground, fontFamily: fonts.body, fontSize: 10, fontWeight: '600' },
  typingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 4 },
  typingDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.secondary },
  typingText: { color: colors.secondary, fontFamily: fonts.body, fontSize: 12, fontWeight: '600' },
  inlineError: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: colors.destructive, backgroundColor: colors.card },
  inlineErrorText: { flex: 1, color: colors.destructive, fontFamily: fonts.body, fontSize: 12, fontWeight: '700' },
  composerDock: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12, backgroundColor: colors.background, borderTopWidth: 1, borderTopColor: colors.border },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 8, borderRadius: 22, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  composerButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.muted },
  textInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    paddingHorizontal: 8,
    paddingVertical: 10,
    color: colors.foreground,
    fontFamily: fonts.body,
    fontSize: 14,
  },
  sendButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.secondary },
  sendButtonDisabled: { opacity: 0.5 },
});
