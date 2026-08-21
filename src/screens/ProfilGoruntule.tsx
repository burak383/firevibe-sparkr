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
// expo-av is deprecated (since SDK 53) and will be fully removed in SDK 55 -
// this project is on SDK 54, its last supported release. Before upgrading
// past SDK 54, this playback code needs to move to expo-audio.
import { Audio } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, fonts, withAlpha } from '../theme';
import { api, ApiError } from '../api/client';
import type { PublicProfile } from '../api/types';
import type { RootStackParamList } from '../navigation/RootNavigator';

const fallbackHeroImage =
  'https://fwtngjyirchhhysukjxi.supabase.co/storage/v1/object/public/project-images/ed3e8af0-715b-43d1-9198-05dbe4ffa7eb/b53d5af3-c38e-4374-a09b-ec26dabcf986.png';

// Plays the profile's real recorded voice note (see VibeKurulumu.tsx for
// where a user records one - `voiceNoteUrl` comes straight from the
// backend). Only rendered by the parent when the profile actually has one.
function VoiceNotePlayer({ name, voiceNoteUrl }: { name: string; voiceNoteUrl: string }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const soundRef = useRef<Audio.Sound | null>(null);

  useEffect(() => {
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
    <Pressable style={styles.voiceCard} onPress={togglePlayback}>
      <View style={styles.voicePlayButton}>
        <Ionicons name={isPlaying ? 'pause' : 'play'} size={18} color={colors.secondaryForeground} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.voiceTitle}>Voice Vibe</Text>
        <Text style={styles.voiceSubtitle}>{name}’in gece sesi</Text>
      </View>
    </Pressable>
  );
}

function TagChip({ label, tone }: { label: string; tone: 'primary' | 'secondary' | 'accent' }) {
  const toneStyle =
    tone === 'primary' ? styles.primaryTag : tone === 'secondary' ? styles.secondaryTag : styles.accentTag;
  const textColor =
    tone === 'primary' ? colors.primary : tone === 'secondary' ? colors.secondaryForeground : colors.accentForeground;
  return (
    <View style={[styles.tag, toneStyle]}>
      <Text style={[styles.tagText, { color: textColor }]}>{label}</Text>
    </View>
  );
}

type ViewProfileRoute = RouteProp<RootStackParamList, 'ViewProfile'>;

export default function ProfilGoruntuleScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<ViewProfileRoute>();
  const { userId } = route.params;

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { user } = await api.userProfile(userId);
      setProfile(user);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Profil yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleReport = () => {
    if (!profile) return;
    Alert.alert('Şikayet et', `${profile.name} kullanıcısını uygunsuz davranış nedeniyle şikayet etmek istediğine emin misin?`, [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Şikayet et',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.reportUser(profile.id, 'Profil sayfasından bildirildi');
            Alert.alert('Şikayet alındı', 'Ekibimiz en kısa sürede inceleyecek.');
          } catch (err) {
            Alert.alert('Hata', err instanceof ApiError ? err.message : 'Şikayet gönderilemedi, tekrar dene.');
          }
        },
      },
    ]);
  };

  const handleBlock = () => {
    if (!profile) return;
    Alert.alert('Engelle', `${profile.name} artık seni bulamayacak ve varsa aranızdaki eşleşme kaldırılacak. Emin misin?`, [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Engelle',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.blockUser(profile.id);
            navigation.goBack();
          } catch (err) {
            Alert.alert('Hata', err instanceof ApiError ? err.message : 'Engellenemedi, tekrar dene.');
          }
        },
      },
    ]);
  };

  const openOptions = () => {
    if (!profile) return;
    Alert.alert(profile.name, 'Ne yapmak istersin?', [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Engelle', style: 'destructive', onPress: handleBlock },
      { text: 'Şikayet et', onPress: handleReport },
    ]);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.headerBar}>
        <Pressable accessibilityLabel="Geri dön" style={styles.roundButton} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {profile?.name ?? 'Profil'}
        </Text>
        <Pressable accessibilityLabel="Daha fazla seçenek" style={styles.roundButton} onPress={openOptions}>
          <Ionicons name="ellipsis-horizontal" size={20} color={colors.foreground} />
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : !profile ? (
        <View style={styles.centerState}>
          <Ionicons name="alert-circle-outline" size={32} color={colors.mutedForeground} />
          <Text style={styles.errorText}>{error ?? 'Profil bulunamadı.'}</Text>
          <Pressable style={styles.reloadButton} onPress={load}>
            <Ionicons name="refresh" size={16} color={colors.primaryForeground} />
            <Text style={styles.reloadText}>Tekrar dene</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Image source={{ uri: profile.avatarUrl || fallbackHeroImage }} style={styles.heroImage} />

          <View style={styles.body}>
            <View style={styles.nameRow}>
              <Text style={styles.name}>
                {profile.name}
                {profile.age != null ? `, ${profile.age}` : ''}
              </Text>
              {profile.verified && <Ionicons name="checkmark-circle" size={20} color={colors.secondary} />}
            </View>

            <View style={styles.metaRow}>
              <Ionicons name="location-outline" size={14} color={colors.mutedForeground} />
              <Text style={styles.metaText}>
                {(profile.neighbourhood || profile.city) + ` · ${profile.distanceKm.toFixed(1)} km uzakta`}
              </Text>
            </View>

            {profile.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}

            {profile.voiceNoteUrl ? <VoiceNotePlayer name={profile.name} voiceNoteUrl={profile.voiceNoteUrl} /> : null}

            {profile.favoriteTrack ? (
              <View style={styles.trackRow}>
                <Ionicons name="musical-notes-outline" size={15} color={colors.secondary} />
                <Text style={styles.trackText}>{profile.favoriteTrack}</Text>
              </View>
            ) : null}

            {(profile.musicTags.length > 0 || profile.vibeTags.length > 0) && (
              <View style={styles.tags}>
                {[...profile.musicTags, ...profile.vibeTags].map((tag, i) => (
                  <TagChip key={`${tag}-${i}`} label={tag} tone={(['primary', 'secondary', 'accent'] as const)[i % 3]} />
                ))}
              </View>
            )}

            {profile.gallery.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.gallery}>
                {profile.gallery.map((uri, i) => (
                  <Image key={`${uri}-${i}`} source={{ uri }} style={styles.galleryImage} />
                ))}
              </ScrollView>
            )}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  roundButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerTitle: {
    flex: 1,
    marginHorizontal: 12,
    textAlign: 'center',
    color: colors.foreground,
    fontFamily: fonts.heading,
    fontSize: 16,
    fontWeight: '700',
  },
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 32 },
  errorText: { color: colors.mutedForeground, fontFamily: fonts.body, fontSize: 13, textAlign: 'center' },
  reloadButton: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 18,
    backgroundColor: colors.primary,
  },
  reloadText: { color: colors.primaryForeground, fontFamily: fonts.heading, fontSize: 14, fontWeight: '800' },
  content: { paddingBottom: 48 },
  heroImage: { width: '100%', height: 380, resizeMode: 'cover', backgroundColor: colors.card },
  body: { paddingHorizontal: 20, paddingTop: 18, gap: 14 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { color: colors.foreground, fontFamily: fonts.heading, fontSize: 26, fontWeight: '700' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { color: colors.mutedForeground, fontFamily: fonts.body, fontSize: 13 },
  bio: { color: withAlpha(colors.foreground, 0.85), fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  voiceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  voicePlayButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.secondary,
  },
  voiceTitle: { color: colors.foreground, fontFamily: fonts.body, fontSize: 13, fontWeight: '700' },
  voiceSubtitle: { marginTop: 2, color: colors.mutedForeground, fontFamily: fonts.body, fontSize: 12 },
  trackRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  trackText: { color: colors.mutedForeground, fontFamily: fonts.body, fontSize: 13 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 18, borderWidth: 1 },
  primaryTag: { borderColor: withAlpha(colors.primary, 0.4), backgroundColor: withAlpha(colors.primary, 0.2) },
  secondaryTag: { borderColor: withAlpha(colors.secondary, 0.5), backgroundColor: withAlpha(colors.secondary, 0.25) },
  accentTag: { borderColor: withAlpha(colors.accent, 0.5), backgroundColor: withAlpha(colors.accent, 0.25) },
  tagText: { fontFamily: fonts.body, fontSize: 11, fontWeight: '700' },
  gallery: { marginTop: 4 },
  galleryImage: { width: 120, height: 160, borderRadius: 16, marginRight: 10, backgroundColor: colors.card },
});
