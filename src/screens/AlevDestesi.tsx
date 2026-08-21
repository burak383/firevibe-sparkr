import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { LinearGradient } from 'expo-linear-gradient';
// expo-av is deprecated (since SDK 53) and will be fully removed in SDK 55 -
// this project is on SDK 54, its last supported release. Before upgrading
// past SDK 54, this playback code needs to move to expo-audio.
import { Audio } from 'expo-av';
import { Feather, Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, fonts, withAlpha } from '../theme';
import { api, ApiError } from '../api/client';
import type { DeckUser, FireHour, SwipeStatus } from '../api/types';
import type { RootStackParamList } from '../navigation/RootNavigator';
import MainTabBar from '../components/MainTabBar';
import { useAuth } from '../context/AuthContext';

const fallbackHeroImage =
  'https://fwtngjyirchhhysukjxi.supabase.co/storage/v1/object/public/project-images/ed3e8af0-715b-43d1-9198-05dbe4ffa7eb/b53d5af3-c38e-4374-a09b-ec26dabcf986.png';

const waveHeights = [
  8, 15, 21, 12, 18, 7, 19, 13, 22, 10, 17, 8, 20, 14, 18, 9, 22, 13, 19, 11, 16, 8, 21, 14, 18, 10, 20, 12, 17, 8, 22,
  14, 19, 10, 16, 8, 20, 13, 18, 9, 21, 14, 17, 11, 20, 8, 16, 12,
];

function VibeMatch({ score }: { score: number }) {
  const radius = 46;
  const circumference = 2 * Math.PI * radius;
  const progress = circumference * Math.min(1, Math.max(0, score / 100));

  return (
    <View style={styles.matchCircle}>
      <Svg width={92} height={92} viewBox="0 0 108 108" style={styles.matchSvg}>
        <Circle cx="54" cy="54" r={radius} fill="none" stroke={colors.muted} strokeWidth="7" />
        <Circle
          cx="54"
          cy="54"
          r={radius}
          fill="none"
          stroke={colors.chart1}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={circumference - progress}
        />
      </Svg>
      <View style={styles.matchContent}>
        <Text style={styles.matchValue}>{score}%</Text>
        <Text style={styles.matchLabel}>VIBE MATCH</Text>
      </View>
    </View>
  );
}

// Plays a candidate's real recorded voice note (see VibeKurulumu.tsx /
// Profil.tsx for where users record one - `voiceNoteUrl` comes straight
// from the backend, nothing here is fabricated). Only rendered by the
// parent when the candidate actually has one.
function VoiceVibe({ name, voiceNoteUrl }: { name: string; voiceNoteUrl: string }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const soundRef = useRef<Audio.Sound | null>(null);

  useEffect(() => {
    // Unload whenever we move to a different candidate's voice note, or the
    // screen unmounts, so playback can't leak across candidates.
    return () => {
      soundRef.current?.unloadAsync().catch(() => {});
      soundRef.current = null;
    };
  }, [voiceNoteUrl]);

  const togglePlayback = async () => {
    if (isPlaying) {
      await soundRef.current?.stopAsync().catch(() => {});
      await soundRef.current?.unloadAsync().catch(() => {});
      soundRef.current = null;
      setIsPlaying(false);
      return;
    }
    try {
      const { sound } = await Audio.Sound.createAsync({ uri: voiceNoteUrl }, { shouldPlay: true });
      soundRef.current = sound;
      setIsPlaying(true);
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) setIsPlaying(false);
      });
    } catch {
      Alert.alert('Hata', 'Ses kaydı oynatılamadı.');
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.voiceRow}>
        <View style={styles.voiceAvatar}>
          <Image source={{ uri: fallbackHeroImage }} style={styles.image} />
          <LinearGradient
            colors={[withAlpha(colors.background, 0), withAlpha(colors.background, 0.55)]}
            style={StyleSheet.absoluteFill}
          />
        </View>

        <View style={styles.voiceDetails}>
          <View style={styles.voiceHeader}>
            <Text style={styles.voiceTitle}>Voice Vibe</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${name}'in Voice Vibe kaydını ${isPlaying ? 'durdur' : 'oynat'}`}
              onPress={togglePlayback}
              style={styles.playButton}
            >
              <Ionicons name={isPlaying ? 'pause' : 'play'} size={16} color={colors.secondaryForeground} />
            </Pressable>
          </View>

          <Text numberOfLines={1} style={styles.voiceQuote}>
            {name}’in gece sesi
          </Text>

          <View accessibilityLabel={`${name}'in ses dalgası`} style={styles.waveform}>
            {waveHeights.map((height, index) => (
              <View
                key={`${height}-${index}`}
                style={[
                  styles.waveBar,
                  {
                    height,
                    backgroundColor: isPlaying && index < waveHeights.length * 0.58 ? colors.secondary : colors.border,
                  },
                ]}
              />
            ))}
          </View>
        </View>
      </View>
    </View>
  );
}

export default function SparkRScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user, refreshUser } = useAuth();
  const [deck, setDeck] = useState<DeckUser[]>([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fireHour, setFireHour] = useState<FireHour | null>(null);
  const [activeCount, setActiveCount] = useState(0);
  // Seeded from the AuthContext user (kept fresh across app restarts /
  // other screens) and then updated directly from each swipe response, so
  // the badge below doesn't need an extra round trip after every like.
  const [swipeStatus, setSwipeStatus] = useState<SwipeStatus | null>(user?.swipeStatus ?? null);

  useEffect(() => {
    if (user?.swipeStatus) setSwipeStatus(user.swipeStatus);
  }, [user?.swipeStatus]);

  const loadDeck = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [{ deck: candidates }, fireHourRes, nearbyRes] = await Promise.all([
        api.deck(),
        api.fireHour(),
        api.nearby(),
      ]);
      setDeck(candidates);
      setIndex(0);
      setFireHour(fireHourRes);
      setActiveCount(nearbyRes.activeCount);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Keşif akışı yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Mirrors the real Fire Hour window/countdown shown on VibeRadar - nothing
  // here is fabricated, it's the same GET /api/radar/fire-hour data.
  const fireHourText = fireHour
    ? fireHour.isLive
      ? `${fireHour.windowStart} · Canlı${fireHour.minutesLeft != null ? ` · ${fireHour.minutesLeft} dk` : ''}`
      : `${fireHour.windowStart} · ${fireHour.minutesToStart ?? '–'} dk`
    : '21:00';

  useFocusEffect(
    useCallback(() => {
      loadDeck();
    }, [loadDeck])
  );

  const current = deck[index];

  const handleSwipe = async (action: 'like' | 'pass' | 'superlike') => {
    if (!current || acting) return;
    setActing(true);
    try {
      const { match, swipeStatus: freshStatus } = await api.swipe(current.id, action);
      setError(null); // clear any earlier failed-swipe banner now that one worked
      if (freshStatus) setSwipeStatus(freshStatus); // like/superlike - keeps the "X/10 kaldı" badge accurate without a refetch
      setIndex((prev) => prev + 1);
      if (match) {
        navigation.navigate('Match', { matchId: match.id });
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 402) {
        // Daily free-like limit reached - straight to the paywall instead
        // of showing this as a generic error banner.
        refreshUser().catch(() => {}); // picks up the just-hit remaining:0 status for when they come back
        navigation.navigate('Premium');
        return;
      }
      setError(err instanceof ApiError ? err.message : 'Bir şeyler ters gitti, tekrar dene.');
    } finally {
      setActing(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : !current ? (
        <View style={styles.centerState}>
          <Ionicons name="flame-outline" size={40} color={colors.mutedForeground} />
          <Text style={styles.emptyTitle}>Bu gece için kıvılcım kalmadı</Text>
          <Text style={styles.emptyText}>
            {error ?? 'Yakınındaki herkesi gördün. Biraz sonra tekrar bak ya da keşif çapını genişlet.'}
          </Text>
          <Pressable style={styles.reloadButton} onPress={loadDeck}>
            <Ionicons name="refresh" size={18} color={colors.primaryForeground} />
            <Text style={styles.reloadText}>Yenile</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.hero}>
            <Image source={{ uri: current.avatarUrl || fallbackHeroImage }} style={styles.heroImage} />

            <LinearGradient
              colors={[withAlpha(colors.background, 0.9), withAlpha(colors.background, 0.1), colors.background]}
              locations={[0, 0.48, 1]}
              style={StyleSheet.absoluteFill}
            />
            <LinearGradient
              colors={[withAlpha(colors.accent, 0.1), withAlpha(colors.background, 0), withAlpha(colors.secondary, 0.2)]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={StyleSheet.absoluteFill}
            />

            <View style={styles.heroHeader}>
              <View style={styles.brandRow}>
                <View style={styles.brandIcon}>
                  <Feather name="zap" size={25} color={colors.primaryForeground} />
                </View>
                <View>
                  <Text style={styles.brandName}>SparkR</Text>
                  <View style={styles.modeRow}>
                    <View style={styles.orangeDot} />
                    <Text style={styles.modeText}>Gece Modu</Text>
                  </View>
                </View>
              </View>

              <View style={styles.fireHour}>
                <Text style={styles.fireHourLabel}>FIRE HOUR</Text>
                <Text style={styles.fireHourValue}>{fireHourText}</Text>
              </View>
            </View>

            <View style={styles.statusRow}>
              <View style={styles.nearbyPill}>
                <View style={styles.greenDot} />
                <Text style={styles.nearbyText}>Yakınında {activeCount} kişi şu an alevde</Text>
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Keşif ayarları"
                style={styles.iconButton}
                onPress={() => navigation.navigate('EditProfile')}
              >
                <Feather name="sliders" size={19} color={colors.foreground} />
              </Pressable>
            </View>

            {swipeStatus && !swipeStatus.premium && (
              <View style={styles.limitRow}>
                <Pressable style={styles.limitPill} onPress={() => navigation.navigate('Premium')}>
                  <Feather name="zap" size={13} color={colors.primary} />
                  <Text style={styles.limitText}>{swipeStatus.remaining ?? 0}/10 beğeni kaldı · Premium'a geç</Text>
                </Pressable>
              </View>
            )}

            <View style={styles.profileMeta}>
              <View style={styles.distancePill}>
                <Text style={styles.distanceText}>{current.distanceKm.toFixed(1)} km uzakta</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Profili geç"
                style={styles.moreButton}
                onPress={() => handleSwipe('pass')}
              >
                <Ionicons name="ellipsis-horizontal" size={21} color={colors.foreground} />
              </Pressable>
            </View>

            <View style={styles.profileSummary}>
              <View style={styles.profileInfo}>
                <View style={styles.nameRow}>
                  <Text style={styles.profileName}>
                    {current.name}, {current.age ?? '—'}
                  </Text>
                  {current.verified && <Ionicons name="checkmark-circle" size={20} color={colors.secondary} />}
                </View>
                <Text style={styles.bio}>{current.bio || `${current.neighbourhood || current.city}'de gecenin iyi tarafını arıyor.`}</Text>

                <View style={styles.tags}>
                  {[...current.musicTags.slice(0, 1), ...current.vibeTags.slice(0, 2)].map((tag, i) => (
                    <View key={`${tag}-${i}`} style={[styles.tag, [styles.primaryTag, styles.secondaryTag, styles.accentTag][i % 3]]}>
                      <Text
                        style={[
                          styles.tagText,
                          { color: [colors.primary, colors.secondaryForeground, colors.accentForeground][i % 3] },
                        ]}
                      >
                        {tag}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>

              <VibeMatch score={current.compatibility} />
            </View>

            <Pressable
              style={styles.openProfileButton}
              onPress={() => navigation.navigate('ViewProfile', { userId: current.id })}
            >
              <Ionicons name="chevron-up" size={17} color={colors.secondary} />
              <Text style={styles.openProfileText}>Profili aç · ortak sinyalleri gör</Text>
            </Pressable>
          </View>

          <View style={styles.main}>
            {current.voiceNoteUrl ? (
              <VoiceVibe key={current.id} name={current.name} voiceNoteUrl={current.voiceNoteUrl} />
            ) : null}

            {error && (
              <View style={styles.errorBanner}>
                <Ionicons name="alert-circle-outline" size={16} color={colors.destructive} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <View style={styles.actionsRow}>
              <Pressable
                style={[styles.actionButton, styles.passButton]}
                onPress={() => handleSwipe('pass')}
                disabled={acting}
                accessibilityLabel={`${current.name} profilini geç`}
              >
                <Ionicons name="close" size={26} color={colors.mutedForeground} />
              </Pressable>
              <Pressable
                style={[styles.actionButton, styles.superButton]}
                onPress={() => handleSwipe('superlike')}
                disabled={acting}
                accessibilityLabel={`${current.name} profiline Super Vibe gönder`}
              >
                <Ionicons name="star" size={22} color={colors.secondaryForeground} />
              </Pressable>
              <Pressable
                style={[styles.actionButton, styles.likeButton]}
                onPress={() => handleSwipe('like')}
                disabled={acting}
                accessibilityLabel={`${current.name} profilini beğen`}
              >
                {acting ? <ActivityIndicator color={colors.primaryForeground} /> : <Ionicons name="flame" size={26} color={colors.primaryForeground} />}
              </Pressable>
            </View>
          </View>
        </ScrollView>
      )}

      <MainTabBar active="Deck" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  emptyTitle: {
    color: colors.foreground,
    fontFamily: fonts.heading,
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  emptyText: {
    color: colors.mutedForeground,
    fontFamily: fonts.body,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
  },
  reloadButton: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 18,
    backgroundColor: colors.primary,
  },
  reloadText: {
    color: colors.primaryForeground,
    fontFamily: fonts.heading,
    fontSize: 14,
    fontWeight: '800',
  },
  content: {
    paddingBottom: 200,
    backgroundColor: colors.background,
  },
  hero: {
    height: 620,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: colors.background,
  },
  heroImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  heroHeader: {
    position: 'relative',
    zIndex: 2,
    paddingHorizontal: 20,
    paddingTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  brandIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  brandName: {
    color: colors.foreground,
    fontFamily: fonts.heading,
    fontSize: 16,
    fontWeight: '700',
  },
  modeRow: {
    marginTop: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  orangeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
  modeText: {
    color: colors.primary,
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: '700',
  },
  fireHour: {
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: withAlpha(colors.primary, 0.3),
    backgroundColor: withAlpha(colors.card, 0.9),
  },
  fireHourLabel: {
    color: colors.mutedForeground,
    fontFamily: fonts.body,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  fireHourValue: {
    marginTop: 2,
    color: colors.primary,
    fontFamily: fonts.heading,
    fontSize: 14,
    fontWeight: '700',
  },
  statusRow: {
    position: 'relative',
    zIndex: 2,
    marginTop: 16,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  nearbyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: withAlpha(colors.success, 0.3),
    backgroundColor: withAlpha(colors.card, 0.85),
  },
  greenDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.success,
  },
  nearbyText: {
    color: colors.success,
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: '700',
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: withAlpha(colors.card, 0.85),
  },
  limitRow: {
    position: 'relative',
    zIndex: 2,
    marginTop: 8,
    paddingHorizontal: 20,
  },
  limitPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: withAlpha(colors.primary, 0.3),
    backgroundColor: withAlpha(colors.card, 0.85),
  },
  limitText: {
    color: colors.primary,
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: '700',
  },
  profileMeta: {
    position: 'absolute',
    zIndex: 2,
    top: 158,
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  distancePill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: withAlpha(colors.card, 0.8),
  },
  distanceText: {
    color: colors.mutedForeground,
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: '700',
  },
  moreButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: withAlpha(colors.background, 0.7),
  },
  profileSummary: {
    position: 'absolute',
    zIndex: 2,
    bottom: 76,
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 14,
  },
  profileInfo: {
    flex: 1,
    minWidth: 0,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  profileName: {
    color: colors.foreground,
    fontFamily: fonts.heading,
    fontSize: 36,
    fontWeight: '700',
  },
  bio: {
    marginTop: 4,
    color: withAlpha(colors.foreground, 0.8),
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: '500',
  },
  tags: {
    marginTop: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tag: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 18,
    borderWidth: 1,
  },
  primaryTag: {
    borderColor: withAlpha(colors.primary, 0.4),
    backgroundColor: withAlpha(colors.primary, 0.2),
  },
  secondaryTag: {
    borderColor: withAlpha(colors.secondary, 0.5),
    backgroundColor: withAlpha(colors.secondary, 0.25),
  },
  accentTag: {
    borderColor: withAlpha(colors.accent, 0.5),
    backgroundColor: withAlpha(colors.accent, 0.25),
  },
  tagText: {
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: '700',
  },
  matchCircle: {
    width: 92,
    height: 92,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 46,
    backgroundColor: withAlpha(colors.background, 0.75),
  },
  matchSvg: {
    position: 'absolute',
    transform: [{ rotate: '-90deg' }],
  },
  matchContent: {
    alignItems: 'center',
  },
  matchValue: {
    color: colors.primary,
    fontFamily: fonts.heading,
    fontSize: 24,
    fontWeight: '700',
  },
  matchLabel: {
    marginTop: 1,
    color: colors.mutedForeground,
    fontFamily: fonts.body,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.7,
  },
  openProfileButton: {
    position: 'absolute',
    zIndex: 2,
    bottom: 20,
    left: 20,
    right: 20,
    height: 44,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: withAlpha(colors.card, 0.9),
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  openProfileText: {
    color: colors.foreground,
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: '700',
  },
  main: {
    zIndex: 3,
    marginTop: -1,
    paddingHorizontal: 20,
    gap: 16,
  },
  card: {
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  voiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  voiceAvatar: {
    width: 48,
    height: 48,
    overflow: 'hidden',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: withAlpha(colors.secondary, 0.5),
  },
  image: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  voiceDetails: {
    flex: 1,
    minWidth: 0,
  },
  voiceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  voiceTitle: {
    color: colors.foreground,
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: '700',
  },
  playButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.secondary,
  },
  voiceQuote: {
    marginTop: 2,
    color: colors.mutedForeground,
    fontFamily: fonts.body,
    fontSize: 11,
  },
  waveform: {
    height: 22,
    marginTop: 5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  waveBar: {
    width: 2,
    minHeight: 3,
    borderRadius: 2,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.destructive,
    backgroundColor: colors.card,
  },
  errorText: {
    flex: 1,
    color: colors.destructive,
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: '700',
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
    paddingVertical: 8,
  },
  actionButton: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 32,
    borderWidth: 1,
  },
  passButton: {
    width: 58,
    height: 58,
    backgroundColor: colors.card,
    borderColor: colors.border,
  },
  superButton: {
    width: 50,
    height: 50,
    backgroundColor: colors.secondary,
    borderColor: colors.secondary,
  },
  likeButton: {
    width: 68,
    height: 68,
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
});
