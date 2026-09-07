import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
// The community SafeAreaView (not react-native's own) is required here - it
// reads real inset values from the SafeAreaProvider in App.tsx and supports
// the `edges` prop; react-native's built-in SafeAreaView is iOS-only and is
// a no-op on Android, which would leave content under the status bar.
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, fonts, withAlpha } from '../theme';
import { api, ApiError } from '../api/client';
import type { LikeEntry, ProfileViewEntry } from '../api/types';
import type { RootStackParamList } from '../navigation/RootNavigator';
import MainTabBar from '../components/MainTabBar';

const fallbackAvatar =
  'https://fwtngjyirchhhysukjxi.supabase.co/storage/v1/object/public/project-images/ed3e8af0-715b-43d1-9198-05dbe4ffa7eb/ae749811-2951-4d33-ac06-0148afbe8e5c.png';

type TabKey = 'received' | 'sent' | 'viewers';

function Icon({ name, size = 18, color = colors.foreground }: { name: React.ComponentProps<typeof Ionicons>['name']; size?: number; color?: string }) {
  return <Ionicons name={name} size={size} color={color} />;
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Şimdi';
  if (mins < 60) return `${mins} dk önce`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} sa önce`;
  const days = Math.floor(hours / 24);
  return `${days} gün önce`;
}

export default function BegenilerScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [tab, setTab] = useState<TabKey>('received');
  const [likers, setLikers] = useState<LikeEntry[]>([]);
  const [liked, setLiked] = useState<LikeEntry[]>([]);
  const [viewers, setViewers] = useState<ProfileViewEntry[]>([]);
  // Whether the "Beğenenler"/"Görüntüleyenler" lists should render unlocked
  // - comes straight from the backend's own hasActivePremium() check (see
  // backend/src/routes/discovery.js's /likes-received and /profile-views -
  // both compute the exact same value, so either response's `premium` is
  // equally authoritative), not derived client-side, so it can never drift
  // from what the server would actually allow when a like/pass is sent.
  const [premium, setPremium] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [decidingId, setDecidingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [receivedRes, sentRes, viewsRes] = await Promise.all([
        api.likesReceived(),
        api.likesSent(),
        api.profileViews(),
      ]);
      setLikers(receivedRes.likers);
      setPremium(receivedRes.premium);
      setLiked(sentRes.liked);
      setViewers(viewsRes.viewers);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Yüklenemedi, tekrar dene.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Reciprocating here always creates a match immediately - everyone on
  // this list, by construction, already liked/superliked ME (see the
  // backend route's comment) - so my own like is the second half of a
  // mutual pair the instant it lands.
  const handleDecide = async (item: LikeEntry, action: 'like' | 'pass') => {
    if (decidingId !== null) return;
    setDecidingId(item.id);
    try {
      const { match } = await api.swipe(item.id, action);
      setLikers((prev) => prev.filter((l) => l.id !== item.id));
      if (match) navigation.navigate('Match', { matchId: match.id });
    } catch (err) {
      if (err instanceof ApiError && err.status === 402) {
        navigation.navigate('Premium');
        return;
      }
      Alert.alert('Hata', err instanceof ApiError ? err.message : 'Bir şeyler ters gitti, tekrar dene.');
    } finally {
      setDecidingId(null);
    }
  };

  const list: Array<LikeEntry | ProfileViewEntry> = tab === 'received' ? likers : tab === 'sent' ? liked : viewers;
  const locked = (tab === 'received' || tab === 'viewers') && !premium;

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>ETKİLEŞİMLER</Text>
        <Text style={styles.title}>Beğeniler</Text>

        <View style={styles.segmented}>
          <Pressable
            style={[styles.segment, tab === 'received' && styles.segmentActive]}
            onPress={() => setTab('received')}
          >
            <Text style={[styles.segmentText, tab === 'received' && styles.segmentTextActive]}>
              Beğenenler{likers.length > 0 ? ` · ${likers.length}` : ''}
            </Text>
          </Pressable>
          <Pressable style={[styles.segment, tab === 'sent' && styles.segmentActive]} onPress={() => setTab('sent')}>
            <Text style={[styles.segmentText, tab === 'sent' && styles.segmentTextActive]}>
              Beğeniler{liked.length > 0 ? ` · ${liked.length}` : ''}
            </Text>
          </Pressable>
          <Pressable style={[styles.segment, tab === 'viewers' && styles.segmentActive]} onPress={() => setTab('viewers')}>
            <Text style={[styles.segmentText, tab === 'viewers' && styles.segmentTextActive]}>
              Görüntüleyenler{viewers.length > 0 ? ` · ${viewers.length}` : ''}
            </Text>
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {locked && list.length > 0 && (
          <Pressable style={styles.unlockBanner} onPress={() => navigation.navigate('Premium')}>
            <View style={styles.unlockIcon}>
              <Icon name="lock-closed" size={18} color={colors.primaryForeground} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.unlockTitle}>
                {list.length} kişi {tab === 'received' ? 'seni beğendi' : 'profilini görüntüledi'}
              </Text>
              <Text style={styles.unlockSubtitle}>
                {tab === 'received'
                  ? "Kimler olduğunu görmek ve beğenmek için Premium'a geç."
                  : "Kimler olduğunu görmek için Premium'a geç."}
              </Text>
            </View>
            <Icon name="chevron-forward" size={18} color={colors.primaryForeground} />
          </Pressable>
        )}

        {loading ? (
          <ActivityIndicator style={styles.centerState} color={colors.primary} size="large" />
        ) : error ? (
          <View style={styles.centerState}>
            <Icon name="alert-circle-outline" size={28} color={colors.mutedForeground} />
            <Text style={styles.emptyText}>{error}</Text>
            <Pressable style={styles.reloadButton} onPress={load}>
              <Text style={styles.reloadText}>Tekrar dene</Text>
            </Pressable>
          </View>
        ) : list.length === 0 ? (
          <View style={styles.centerState}>
            <Icon
              name={tab === 'received' ? 'heart-outline' : tab === 'sent' ? 'paper-plane-outline' : 'eye-outline'}
              size={28}
              color={colors.mutedForeground}
            />
            <Text style={styles.emptyText}>
              {tab === 'received'
                ? 'Henüz kimse seni beğenmedi. Alev Destesi’nde keşfedilir olmaya devam et.'
                : tab === 'sent'
                  ? 'Henüz kimseyi beğenmedin. Alev Destesi’nde keşfetmeye başla.'
                  : 'Henüz kimse profilini görüntülemedi.'}
            </Text>
          </View>
        ) : (
          <View style={styles.grid}>
            {list.map((item) => {
              // `list` mixes two shapes depending on `tab` (see its
              // definition above) - these casts are safe because each is
              // only read from inside a block already guarded by the
              // matching `tab` check below, never across tabs.
              const likeItem = tab !== 'viewers' ? (item as LikeEntry) : null;
              const viewItem = tab === 'viewers' ? (item as ProfileViewEntry) : null;
              return (
                <View key={item.id} style={styles.card}>
                  <Pressable
                    disabled={locked}
                    onPress={() => navigation.navigate('ViewProfile', { userId: item.id })}
                    style={styles.cardImageWrap}
                  >
                    <Image source={{ uri: item.avatarUrl || fallbackAvatar }} style={styles.cardImage} />
                    {likeItem?.superlike && !locked && (
                      <View style={styles.superBadge}>
                        <Icon name="star" size={11} color={colors.secondaryForeground} />
                      </View>
                    )}
                    {tab === 'sent' && likeItem && (
                      <View style={[styles.statusBadge, likeItem.matched ? styles.statusBadgeMatched : styles.statusBadgePending]}>
                        <Text style={styles.statusBadgeText}>{likeItem.matched ? 'Eşleştiniz' : 'Yanıt bekleniyor'}</Text>
                      </View>
                    )}
                    {viewItem && !locked && (
                      <View style={[styles.statusBadge, styles.statusBadgePending]}>
                        <Text style={styles.statusBadgeText}>{timeAgo(viewItem.viewedAt)}</Text>
                      </View>
                    )}
                    {locked && (
                      <View style={styles.lockOverlay}>
                        <Icon name="lock-closed" size={22} color={colors.foreground} />
                      </View>
                    )}
                  </Pressable>

                  <Text style={styles.cardName} numberOfLines={1}>
                    {locked ? 'Gizli Profil' : `${item.name}${item.age ? `, ${item.age}` : ''}`}
                  </Text>
                  {!locked && (
                    <Text style={styles.cardMeta} numberOfLines={1}>
                      %{item.compatibility} Vibe Match
                    </Text>
                  )}

                  {tab === 'received' && !locked && likeItem && (
                    <View style={styles.cardActions}>
                      <Pressable
                        accessibilityLabel={`${item.name} profilini geç`}
                        style={[styles.cardActionButton, styles.passButton]}
                        onPress={() => handleDecide(likeItem, 'pass')}
                        disabled={decidingId === item.id}
                      >
                        <Icon name="close" size={16} color={colors.mutedForeground} />
                      </Pressable>
                      <Pressable
                        accessibilityLabel={`${item.name} profilini beğen`}
                        style={[styles.cardActionButton, styles.likeButton]}
                        onPress={() => handleDecide(likeItem, 'like')}
                        disabled={decidingId === item.id}
                      >
                        {decidingId === item.id ? (
                          <ActivityIndicator size="small" color={colors.primaryForeground} />
                        ) : (
                          <Icon name="heart" size={16} color={colors.primaryForeground} />
                        )}
                      </Pressable>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      <MainTabBar active="Likes" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 4 },
  eyebrow: { color: colors.primary, fontFamily: fonts.body, fontSize: 12, fontWeight: '800', letterSpacing: 2 },
  title: { marginTop: 4, color: colors.foreground, fontFamily: fonts.heading, fontSize: 30, fontWeight: '800' },
  segmented: {
    marginTop: 18,
    flexDirection: 'row',
    gap: 6,
    padding: 5,
    borderRadius: 18,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  segment: { flex: 1, paddingVertical: 10, borderRadius: 14, alignItems: 'center' },
  segmentActive: { backgroundColor: colors.primary },
  segmentText: { color: colors.mutedForeground, fontFamily: fonts.body, fontSize: 13, fontWeight: '800' },
  segmentTextActive: { color: colors.primaryForeground },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 130, gap: 16 },
  unlockBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 20,
    backgroundColor: colors.primary,
  },
  unlockIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: withAlpha(colors.primaryForeground, 0.18),
  },
  flex: { flex: 1 },
  unlockTitle: { color: colors.primaryForeground, fontFamily: fonts.heading, fontSize: 15, fontWeight: '800' },
  unlockSubtitle: { marginTop: 2, color: withAlpha(colors.primaryForeground, 0.85), fontFamily: fonts.body, fontSize: 12, lineHeight: 16 },
  centerState: { alignItems: 'center', justifyContent: 'center', gap: 12, paddingVertical: 60, paddingHorizontal: 24 },
  emptyText: { color: colors.mutedForeground, fontFamily: fonts.body, fontSize: 13, textAlign: 'center', lineHeight: 19 },
  reloadButton: { paddingHorizontal: 18, paddingVertical: 11, borderRadius: 16, backgroundColor: colors.primary },
  reloadText: { color: colors.primaryForeground, fontFamily: fonts.heading, fontSize: 13, fontWeight: '800' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  card: { width: '47%' },
  cardImageWrap: {
    position: 'relative',
    aspectRatio: 0.82,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardImage: { width: '100%', height: '100%' },
  superBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.secondary,
  },
  statusBadge: { position: 'absolute', top: 8, right: 8, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 },
  statusBadgeMatched: { backgroundColor: withAlpha(colors.success, 0.9) },
  statusBadgePending: { backgroundColor: withAlpha(colors.background, 0.75) },
  statusBadgeText: { color: colors.foreground, fontFamily: fonts.body, fontSize: 9, fontWeight: '800' },
  lockOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: withAlpha(colors.background, 0.82),
  },
  cardName: { marginTop: 8, color: colors.foreground, fontFamily: fonts.heading, fontSize: 14, fontWeight: '700' },
  cardMeta: { marginTop: 1, color: colors.mutedForeground, fontFamily: fonts.body, fontSize: 11, fontWeight: '700' },
  cardActions: { marginTop: 8, flexDirection: 'row', gap: 8 },
  cardActionButton: { flex: 1, height: 38, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  passButton: { backgroundColor: colors.card, borderColor: colors.border },
  likeButton: { backgroundColor: colors.primary, borderColor: colors.primary },
});
