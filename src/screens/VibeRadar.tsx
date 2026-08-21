import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
// The community SafeAreaView (not react-native's own) is required here - it
// reads real inset values from the SafeAreaProvider in App.tsx and supports
// the `edges` prop; react-native's built-in SafeAreaView is iOS-only and is
// a no-op on Android, which would leave content under the status bar.
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../theme';
import { api, ApiError } from '../api/client';
import type { FireHour, Match, PublicProfile } from '../api/types';
import type { RootStackParamList } from '../navigation/RootNavigator';
import MainTabBar from '../components/MainTabBar';

function Icon({
  name,
  size = 21,
  color = theme.colors.foreground,
}: {
  name: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  size?: number;
  color?: string;
}) {
  return <MaterialCommunityIcons name={name} size={size} color={color} />;
}

function Avatar({
  uri,
  size,
  ringColor,
  featured = false,
}: {
  uri: string;
  size: number;
  ringColor: string;
  featured?: boolean;
}) {
  return (
    <View
      style={[styles.avatarRing, { width: size + 8, height: size + 8, borderColor: ringColor }, featured && styles.featuredRing]}
    >
      <View style={[styles.avatarClip, { width: size, height: size }]}>
        <Image source={{ uri }} style={styles.image} />
      </View>
      <View style={styles.onlineDot} />
      {featured && <View style={styles.sparkDot} />}
    </View>
  );
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Şimdi';
  if (mins < 60) return `${mins} dk`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} sa`;
  return new Date(iso).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' });
}

export default function VibeRadarScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [matches, setMatches] = useState<Match[]>([]);
  const [nearby, setNearby] = useState<PublicProfile[]>([]);
  const [fireHour, setFireHour] = useState<FireHour | null>(null);
  const [activeCount, setActiveCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [matchesRes, nearbyRes, fireHourRes] = await Promise.all([api.matches(), api.nearby(), api.fireHour()]);
      setMatches(matchesRes.matches);
      setNearby(nearbyRes.nearby.slice(0, 4));
      setActiveCount(nearbyRes.activeCount);
      setFireHour(fireHourRes);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Vibe Radar yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Real actions for the "bir satıra uzun bas" helper text below - unmatch,
  // block and report all hit the real backend (same endpoints DenizIleSohbet
  // uses from its "..." menu). There's no "mute" feature anywhere in this
  // app, so it's intentionally left out of both the menu and the helper text.
  const handleMatchLongPress = (match: Match) => {
    Alert.alert(match.otherUser.name, 'Ne yapmak istersin?', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Eşleşmeyi kaldır',
        style: 'destructive',
        onPress: () => {
          Alert.alert('Eşleşmeyi kaldır', `${match.otherUser.name} ile eşleşmeni kaldırmak istediğine emin misin?`, [
            { text: 'Vazgeç', style: 'cancel' },
            {
              text: 'Kaldır',
              style: 'destructive',
              onPress: async () => {
                try {
                  await api.unmatch(match.id);
                  setMatches((prev) => prev.filter((m) => m.id !== match.id));
                } catch (err) {
                  Alert.alert('Hata', err instanceof ApiError ? err.message : 'Eşleşme kaldırılamadı.');
                }
              },
            },
          ]);
        },
      },
      {
        text: 'Engelle',
        style: 'destructive',
        onPress: () => {
          Alert.alert('Engelle', `${match.otherUser.name} artık seni bulamayacak ve bu eşleşme kaldırılacak. Emin misin?`, [
            { text: 'Vazgeç', style: 'cancel' },
            {
              text: 'Engelle',
              style: 'destructive',
              onPress: async () => {
                try {
                  await api.blockUser(match.otherUser.id);
                  setMatches((prev) => prev.filter((m) => m.id !== match.id));
                } catch (err) {
                  Alert.alert('Hata', err instanceof ApiError ? err.message : 'Engellenemedi, tekrar dene.');
                }
              },
            },
          ]);
        },
      },
      {
        text: 'Şikayet et',
        onPress: () => {
          Alert.alert('Şikayet et', `${match.otherUser.name} kullanıcısını uygunsuz davranış nedeniyle şikayet etmek istediğine emin misin?`, [
            { text: 'Vazgeç', style: 'cancel' },
            {
              text: 'Şikayet et',
              style: 'destructive',
              onPress: async () => {
                try {
                  await api.reportUser(match.otherUser.id, 'Vibe Radar listesinden bildirildi');
                  Alert.alert('Şikayet alındı', 'Ekibimiz en kısa sürede inceleyecek.');
                } catch (err) {
                  Alert.alert('Hata', err instanceof ApiError ? err.message : 'Şikayet gönderilemedi, tekrar dene.');
                }
              },
            },
          ]);
        },
      },
    ]);
  };

  const fireHourWindow = fireHour ? `${fireHour.windowStart}–${fireHour.windowEnd}` : '21:00–22:00';
  const fireHourText = fireHour
    ? fireHour.isLive
      ? `${fireHourWindow} · Şu an canlı (${fireHour.minutesLeft} dk kaldı)`
      : `${fireHourWindow} · ${fireHour.minutesToStart} dk sonra başlıyor`
    : fireHourWindow;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.headerGlowPrimary} />
          <View style={styles.headerGlowSecondary} />
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.brand}>SparkR</Text>
              <Text style={styles.title}>Vibe Radar</Text>
            </View>
            <Pressable
              accessibilityLabel="Radar ayarları"
              style={styles.iconButton}
              onPress={() => navigation.navigate('EditProfile')}
            >
              <Icon name="tune-variant" color={theme.colors.mutedForeground} />
            </Pressable>
          </View>

          <View style={styles.radarCard}>
            <View style={styles.cardHeader}>
              <View>
                <Text style={styles.overline}>ŞU AN ÇEVRENDE</Text>
                <Text style={styles.cardTitle}>Taze kıvılcımlar</Text>
              </View>
              <View style={styles.activePill}>
                <View style={styles.activeDot} />
                <Text style={styles.activeText}>{activeCount} aktif</Text>
              </View>
            </View>

            {loading ? (
              <ActivityIndicator style={{ marginTop: 20 }} color={theme.colors.primary} />
            ) : (
              <View style={styles.peopleRow}>
                {nearby.map((person, i) => (
                  <Pressable
                    key={person.id}
                    style={styles.person}
                    onPress={() => navigation.navigate('ViewProfile', { userId: person.id })}
                  >
                    <Avatar
                      uri={person.avatarUrl}
                      size={68}
                      ringColor={[theme.colors.primary, theme.colors.secondary, theme.colors.accent][i % 3]}
                      featured={i === 0}
                    />
                    <Text style={styles.personName}>{person.name}</Text>
                    <Text style={[styles.personLabel, { color: [theme.colors.primary, theme.colors.secondary, theme.colors.accent][i % 3] }]}>
                      {person.mood}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        </View>

        <View style={styles.main}>
          <View style={styles.fireCard}>
            <View style={styles.fireGlow} />
            <View style={styles.fireContent}>
              <View style={styles.fireImagePlaceholder}>
                <Icon name="fire" size={28} color={theme.colors.primary} />
              </View>
              <View style={styles.fireDetails}>
                <View style={styles.fireLabelRow}>
                  <View style={styles.fireDot} />
                  <Text style={styles.fireLabel}>FIRE HOUR</Text>
                </View>
                <Text style={styles.fireTitle}>{fireHourText}</Text>
                <Text style={styles.mutedText}>{fireHour?.activeNearby ?? 46} yakın kişi aktif</Text>
              </View>
            </View>
            <View style={styles.fireAction}>
              <Pressable
                style={styles.primaryButton}
                onPress={() => Alert.alert('Fire Hour', 'Fire Hour’a katıldın! Bu saatte keşif önceliğin artar.')}
              >
                <Icon name="radar" size={19} color={theme.colors.primaryForeground} />
                <Text style={styles.primaryButtonText}>Radara Katıl</Text>
                <Icon name="arrow-top-right" size={18} color={theme.colors.primaryForeground} />
              </Pressable>
            </View>
          </View>

          <View>
            <View style={styles.sectionHeading}>
              <View>
                <Text style={styles.overline}>SOHBETLER</Text>
                <Text style={styles.sectionTitle}>Akışta olanlar</Text>
              </View>
              <Pressable style={styles.allButton} onPress={load} accessibilityLabel="Sohbetleri yenile">
                <Text style={styles.allButtonText}>Tümü · Yenile</Text>
              </Pressable>
            </View>

            {loading ? (
              <ActivityIndicator color={theme.colors.primary} />
            ) : matches.length === 0 ? (
              <View style={styles.emptyMatches}>
                <Icon name="chat-outline" size={28} color={theme.colors.mutedForeground} />
                <Text style={styles.emptyMatchesText}>
                  Henüz eşleşmen yok. Alev Destesi’nde birini beğen, sohbet burada başlasın.
                </Text>
              </View>
            ) : (
              <View style={styles.conversationCard}>
                {matches.map((match, index) => (
                  <Pressable
                    key={match.id}
                    onPress={() => navigation.navigate('Chat', { matchId: match.id })}
                    onLongPress={() => handleMatchLongPress(match)}
                    style={[styles.conversation, index < matches.length - 1 && styles.conversationBorder]}
                  >
                    <Pressable
                      accessibilityLabel={`${match.otherUser.name} profilini gör`}
                      onPress={() => navigation.navigate('ViewProfile', { userId: match.otherUser.id })}
                    >
                      <Avatar
                        uri={match.otherUser.avatarUrl}
                        size={54}
                        ringColor={[theme.colors.primary, theme.colors.secondary, theme.colors.accent][index % 3]}
                      />
                    </Pressable>
                    <View style={styles.conversationBody}>
                      <View style={styles.conversationTop}>
                        <Text style={styles.conversationName}>{match.otherUser.name}</Text>
                        <Text style={[styles.time, { color: index === 0 ? theme.colors.primary : theme.colors.mutedForeground }]}>
                          {match.lastMessage ? timeAgo(match.lastMessage.createdAt) : `%${match.compatibility} Vibe Match`}
                        </Text>
                      </View>
                      <Text numberOfLines={1} style={styles.message}>
                        {match.lastMessage
                          ? `${match.lastMessage.fromMe ? 'Sen: ' : ''}${match.lastMessage.text ?? 'Bir fotoğraf gönderdi'}`
                          : `Icebreaker: “${match.icebreaker.question}”`}
                      </Text>
                    </View>
                    <View style={styles.moreButton}>
                      <Icon name="chevron-right" size={20} color={theme.colors.mutedForeground} />
                    </View>
                  </Pressable>
                ))}
              </View>
            )}
            <Text style={styles.helperText}>Bir satıra uzun basınca eşleşmeyi kaldır, engelle veya şikayet et.</Text>
          </View>

          {error && (
            <View style={styles.errorBanner}>
              <Icon name="alert-circle-outline" size={16} color={theme.colors.destructive} />
              <Text style={styles.errorBannerText}>{error}</Text>
            </View>
          )}
        </View>
      </ScrollView>

      <MainTabBar active="Radar" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.background },
  content: { paddingBottom: 125 },
  header: { paddingHorizontal: 20, paddingTop: 22, paddingBottom: 24, overflow: 'hidden' },
  headerGlowPrimary: { position: 'absolute', right: -64, top: -40, width: 190, height: 190, borderRadius: 100, backgroundColor: theme.colors.primary, opacity: 0.14 },
  headerGlowSecondary: { position: 'absolute', left: -70, top: 95, width: 175, height: 175, borderRadius: 100, backgroundColor: theme.colors.secondary, opacity: 0.12 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { color: theme.colors.primary, fontFamily: theme.fonts.body, fontSize: 12, fontWeight: '800', letterSpacing: 2.2, textTransform: 'uppercase' },
  title: { marginTop: 3, color: theme.colors.foreground, fontFamily: theme.fonts.heading, fontSize: 30, fontWeight: '700' },
  iconButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border },
  radarCard: { marginTop: 23, padding: 16, borderRadius: 20, backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  overline: { color: theme.colors.mutedForeground, fontFamily: theme.fonts.body, fontSize: 11, fontWeight: '800', letterSpacing: 1.4 },
  cardTitle: { marginTop: 4, color: theme.colors.cardForeground, fontFamily: theme.fonts.heading, fontSize: 20, fontWeight: '700' },
  activePill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 20, backgroundColor: theme.colors.muted },
  activeDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.success },
  activeText: { color: theme.colors.success, fontFamily: theme.fonts.body, fontSize: 11, fontWeight: '800' },
  peopleRow: { marginTop: 21, flexDirection: 'row', justifyContent: 'space-around' },
  person: { alignItems: 'center' },
  avatarRing: { borderWidth: 1, borderRadius: 100, padding: 3, position: 'relative' },
  featuredRing: { borderWidth: 2 },
  avatarClip: { borderRadius: 100, overflow: 'hidden', borderWidth: 2, borderColor: theme.colors.background },
  image: { width: '100%', height: '100%' },
  onlineDot: { position: 'absolute', right: -1, bottom: -1, width: 16, height: 16, borderRadius: 8, backgroundColor: theme.colors.success, borderWidth: 2, borderColor: theme.colors.card },
  sparkDot: { position: 'absolute', top: -8, alignSelf: 'center', width: 12, height: 12, borderRadius: 6, backgroundColor: theme.colors.primary },
  personName: { marginTop: 8, color: theme.colors.cardForeground, fontFamily: theme.fonts.body, fontSize: 14, fontWeight: '800' },
  personLabel: { marginTop: 2, fontFamily: theme.fonts.body, fontSize: 10, fontWeight: '700' },
  main: { paddingHorizontal: 20, gap: 24 },
  fireCard: { overflow: 'hidden', borderRadius: 20, backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.primary },
  fireGlow: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: theme.colors.primary, opacity: 0.08 },
  fireContent: { padding: 16, flexDirection: 'row', gap: 14 },
  fireImagePlaceholder: { width: 92, height: 82, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.muted },
  fireDetails: { flex: 1, justifyContent: 'center' },
  fireLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  fireDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: theme.colors.primary },
  fireLabel: { color: theme.colors.primary, fontFamily: theme.fonts.body, fontSize: 11, fontWeight: '800', letterSpacing: 1.3 },
  fireTitle: { marginTop: 5, color: theme.colors.cardForeground, fontFamily: theme.fonts.heading, fontSize: 17, fontWeight: '700' },
  mutedText: { marginTop: 4, color: theme.colors.mutedForeground, fontFamily: theme.fonts.body, fontSize: 12 },
  fireAction: { padding: 12, borderTopWidth: 1, borderTopColor: theme.colors.border },
  primaryButton: { height: 48, borderRadius: 16, backgroundColor: theme.colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  primaryButtonText: { color: theme.colors.primaryForeground, fontFamily: theme.fonts.heading, fontSize: 14, fontWeight: '800' },
  sectionHeading: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle: { marginTop: 4, color: theme.colors.foreground, fontFamily: theme.fonts.heading, fontSize: 24, fontWeight: '700' },
  allButton: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: theme.colors.muted },
  allButtonText: { color: theme.colors.mutedForeground, fontFamily: theme.fonts.body, fontSize: 12, fontWeight: '800' },
  conversationCard: { overflow: 'hidden', borderRadius: 20, backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border },
  conversation: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  conversationBorder: { borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  conversationBody: { flex: 1, minWidth: 0 },
  conversationTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  conversationName: { color: theme.colors.cardForeground, fontFamily: theme.fonts.heading, fontSize: 16, fontWeight: '700' },
  time: { fontFamily: theme.fonts.body, fontSize: 11, fontWeight: '800' },
  message: { marginTop: 5, color: theme.colors.mutedForeground, fontFamily: theme.fonts.body, fontSize: 13 },
  moreButton: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  helperText: { marginTop: 11, color: theme.colors.mutedForeground, textAlign: 'center', fontFamily: theme.fonts.body, fontSize: 11 },
  emptyMatches: { padding: 24, borderRadius: 20, backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border, alignItems: 'center', gap: 10 },
  emptyMatchesText: { color: theme.colors.mutedForeground, fontFamily: theme.fonts.body, fontSize: 13, textAlign: 'center', lineHeight: 19 },
  errorBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.destructive, backgroundColor: theme.colors.card },
  errorBannerText: { flex: 1, color: theme.colors.destructive, fontFamily: theme.fonts.body, fontSize: 12, fontWeight: '700' },
});
