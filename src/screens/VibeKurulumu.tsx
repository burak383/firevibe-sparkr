import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
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
// past SDK 54, this recording code needs to move to expo-audio.
import { Audio } from 'expo-av';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { theme } from '../theme';
import { useAuth } from '../context/AuthContext';
import { ApiError } from '../api/client';
import { uploadRecordingUri } from '../utils/media';
import { MUSIC_TAGS, VIBE_TAG_OPTIONS, DEFAULT_VIBE_TAGS } from '../constants/tags';

const colors = theme.colors;
const fonts = theme.fonts;

const profileImage =
  'https://fwtngjyirchhhysukjxi.supabase.co/storage/v1/object/public/project-images/ed3e8af0-715b-43d1-9198-05dbe4ffa7eb/ef985216-c4fd-4cde-868a-9d55b419d2fb.png';

const moodImages = [
  {
    label: 'Chill',
    uri: 'https://fwtngjyirchhhysukjxi.supabase.co/storage/v1/object/public/project-images/ed3e8af0-715b-43d1-9198-05dbe4ffa7eb/0f785c0b-7f3c-442e-93a0-e09cbfafea6c.png',
  },
  {
    label: 'Party',
    uri: 'https://fwtngjyirchhhysukjxi.supabase.co/storage/v1/object/public/project-images/ed3e8af0-715b-43d1-9198-05dbe4ffa7eb/f4a53cdf-0e5e-41e9-b724-f6b505ca8540.png',
  },
  {
    label: 'Deep Talk',
    uri: 'https://fwtngjyirchhhysukjxi.supabase.co/storage/v1/object/public/project-images/ed3e8af0-715b-43d1-9198-05dbe4ffa7eb/e364dfad-8394-45e4-a155-1036ace05475.png',
  },
  {
    label: 'Adrenaline',
    uri: 'https://fwtngjyirchhhysukjxi.supabase.co/storage/v1/object/public/project-images/ed3e8af0-715b-43d1-9198-05dbe4ffa7eb/2868adf7-eb8b-4e10-9bac-743a168b42f5.png',
  },
] as const;


const IconButton = ({
  icon,
  color = colors.cardForeground,
  onPress,
  label,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  color?: string;
  onPress?: () => void;
  label: string;
}) => (
  <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.iconButton}>
    <MaterialCommunityIcons name={icon} size={22} color={color} />
  </Pressable>
);

const SectionHeader = ({
  eyebrow,
  title,
  action,
  onAction,
}: {
  eyebrow: string;
  title: string;
  action?: string;
  onAction?: () => void;
}) => (
  <View style={styles.sectionHeader}>
    <View>
      <Text style={styles.eyebrow}>{eyebrow}</Text>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
    {action ? (
      <Pressable accessibilityRole="button" onPress={onAction}>
        <Text style={styles.action}>{action}</Text>
      </Pressable>
    ) : null}
  </View>
);

const Pill = ({
  children,
  backgroundColor,
  color,
  outlined = false,
}: {
  children: string;
  backgroundColor: string;
  color: string;
  outlined?: boolean;
}) => (
  <View style={[styles.pill, { backgroundColor, borderColor: color }, outlined && styles.outlinedPill]}>
    <Text style={[styles.pillText, { color }]}>{children}</Text>
  </View>
);

const Waveform = () => (
  <View style={styles.waveform} accessibilityLabel="Ses dalgası">
    {Array.from({ length: 42 }).map((_, index) => (
      <View key={index} style={[styles.waveBar, { height: [5, 10, 17, 11, 21, 14, 8, 19, 12, 6][index % 10] }]} />
    ))}
  </View>
);

export default function SparkRProfileScreen() {
  const { user, completeVibeSetup, updateUser, logout } = useAuth();

  const [selectedMood, setSelectedMood] = useState<string>('Deep Talk');
  const [selectedMusic, setSelectedMusic] = useState<string[]>(['Alt Pop', 'Techno']);
  const [selectedVibe, setSelectedVibe] = useState<string[]>(DEFAULT_VIBE_TAGS);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Google/Apple sign-in accounts never collect a birth date at
  // signup (see routes/auth.js's comments on each of those three routes) -
  // `age` stays null until this screen collects it, right here, as the
  // last gate before onboarding can complete. See
  // backend/src/routes/users.js's vibe-setup handler for where this is
  // actually enforced (18+ check, same as the direct-registration flow).
  const needsBirthDate = !!user && user.age == null;
  const [birthDateInput, setBirthDateInput] = useState('');

  const [editingProfile, setEditingProfile] = useState(false);
  const [editName, setEditName] = useState(user?.name ?? '');
  const [editBio, setEditBio] = useState(user?.bio ?? '');
  const [savingProfile, setSavingProfile] = useState(false);

  const [ageRangeMin, setAgeRangeMin] = useState(24);
  const [ageRangeMax, setAgeRangeMax] = useState(34);
  const [discoveryRadiusKm, setDiscoveryRadiusKm] = useState(12);
  const [editingRadar, setEditingRadar] = useState(false);
  const [radarRangeInput, setRadarRangeInput] = useState('24-34');
  const [radarRadiusInput, setRadarRadiusInput] = useState('12');

  const openRadarEditor = () => {
    setRadarRangeInput(`${ageRangeMin}-${ageRangeMax}`);
    setRadarRadiusInput(String(discoveryRadiusKm));
    setEditingRadar(true);
  };

  const [isRecording, setIsRecording] = useState(false);
  const [uploadingVoice, setUploadingVoice] = useState(false);
  const [isPlayingVoice, setIsPlayingVoice] = useState(false);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);

  useEffect(() => {
    return () => {
      recordingRef.current?.stopAndUnloadAsync().catch(() => {});
      soundRef.current?.unloadAsync().catch(() => {});
    };
  }, []);

  const startRecording = async () => {
    if (isPlayingVoice) {
      // Stop any in-progress playback of the existing note before recording
      // a new one, so they can't run concurrently.
      await soundRef.current?.stopAsync().catch(() => {});
      await soundRef.current?.unloadAsync().catch(() => {});
      soundRef.current = null;
      setIsPlayingVoice(false);
    }
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('İzin gerekli', 'Sesli Vibe kaydı için mikrofon iznine ihtiyacımız var.');
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      recordingRef.current = recording;
      setIsRecording(true);
    } catch {
      Alert.alert('Hata', 'Kayıt başlatılamadı. Mikrofon iznini kontrol et.');
    }
  };

  const stopRecording = async () => {
    const recording = recordingRef.current;
    if (!recording) return;
    setIsRecording(false);
    setUploadingVoice(true);
    try {
      await recording.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      recordingRef.current = null;
      const uri = recording.getURI();
      if (!uri) return;
      const url = await uploadRecordingUri(uri);
      await updateUser({ voiceNoteUrl: url });
    } catch (err) {
      Alert.alert('Hata', err instanceof ApiError ? err.message : 'Ses kaydı yüklenemedi, tekrar dene.');
    } finally {
      setUploadingVoice(false);
    }
  };

  const togglePlayback = async () => {
    if (!user?.voiceNoteUrl) return;
    if (isPlayingVoice) {
      // Stop and fully unload so the next press starts a clean playback
      // instead of getting stuck (a stopped Sound doesn't fire
      // didJustFinish, so isPlayingVoice must be reset here too).
      await soundRef.current?.stopAsync().catch(() => {});
      await soundRef.current?.unloadAsync().catch(() => {});
      soundRef.current = null;
      setIsPlayingVoice(false);
      return;
    }
    try {
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }
      const { sound } = await Audio.Sound.createAsync({ uri: user.voiceNoteUrl }, { shouldPlay: true });
      soundRef.current = sound;
      setIsPlayingVoice(true);
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) setIsPlayingVoice(false);
      });
    } catch {
      Alert.alert('Hata', 'Ses kaydı oynatılamadı.');
    }
  };

  const saveRadarEdit = () => {
    const [minStr, maxStr] = radarRangeInput.split(/[^0-9]+/).filter(Boolean);
    const min = Number(minStr);
    const max = Number(maxStr);
    const radius = Number(radarRadiusInput.replace(/[^0-9]/g, ''));
    if (!Number.isFinite(min) || !Number.isFinite(max) || min < 18 || max > 99 || min >= max) {
      Alert.alert('Geçersiz aralık', 'Lütfen 18-99 arası, küçükten büyüğe bir aralık gir (ör. 22-35).');
      return;
    }
    if (!Number.isFinite(radius) || radius < 1 || radius > 200) {
      Alert.alert('Geçersiz değer', 'Lütfen 1-200 arası bir mesafe gir.');
      return;
    }
    setAgeRangeMin(min);
    setAgeRangeMax(max);
    setDiscoveryRadiusKm(radius);
    setEditingRadar(false);
  };

  const toggleMusicTag = (tag: string) => {
    setSelectedMusic((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  };

  const toggleVibeTag = (tag: string) => {
    setSelectedVibe((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  };

  const openProfileEditor = () => {
    setEditName(user?.name ?? '');
    setEditBio(user?.bio ?? '');
    setEditingProfile(true);
  };

  const saveProfileEdit = async () => {
    if (!editName.trim()) return;
    setSavingProfile(true);
    try {
      await updateUser({ name: editName.trim(), bio: editBio.slice(0, 120) });
      setEditingProfile(false);
    } catch (err) {
      Alert.alert('Hata', err instanceof ApiError ? err.message : 'Kaydedilemedi, tekrar dene.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleLeave = () => {
    Alert.alert('Kurulumdan çık', 'Vibe kurulumunu daha sonra tamamlayabilirsin. Çıkış yapmak istiyor musun?', [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Çıkış yap', style: 'destructive', onPress: () => logout() },
    ]);
  };

  const handleIgnite = async () => {
    setError(null);
    if (needsBirthDate && !birthDateInput.trim()) {
      setError('Devam etmek için doğum tarihini girmelisin.');
      return;
    }
    setSubmitting(true);
    try {
      await completeVibeSetup({
        mood: selectedMood,
        musicTags: selectedMusic,
        vibeTags: selectedVibe,
        ageRangeMin,
        ageRangeMax,
        discoveryRadiusKm,
        favoriteTrack: user?.favoriteTrack || '',
        // Only sent (and only matters) once - see backend/src/routes/users.js's
        // vibe-setup handler, which ignores this entirely once age is
        // already verified.
        ...(needsBirthDate ? { birthDate: birthDateInput.trim() } : {}),
      });
      // RootNavigator swaps to the main app automatically once onboardingComplete is true.
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Vibe kaydedilemedi. Tekrar dene.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <LinearGradient
          colors={[colors.muted, colors.background, colors.background]}
          locations={[0, 0.62, 1]}
          style={styles.hero}
        >
          <View style={styles.glowPrimary} />
          <View style={styles.glowSecondary} />

          <View style={styles.topBar}>
            <IconButton icon="arrow-left" label="Geri dön" onPress={handleLeave} />
            <View style={styles.stepBadge}>
              <Text style={styles.stepText}>5 / 5 · SON DOKUNUŞ</Text>
            </View>
            <IconButton
              icon="help-circle-outline"
              color={colors.mutedForeground}
              label="Yardım"
              onPress={() =>
                Alert.alert(
                  'Vibe kurulumu',
                  'Modunu ve müzik zevkini seç; Alevi Yak’a bastığında profilin Vibe Radar’da görünmeye başlar.'
                )
              }
            />
          </View>

          <View style={styles.intro}>
            <View style={styles.flameMark}>
              <MaterialCommunityIcons name="fire" size={34} color={colors.primaryForeground} />
            </View>
            <View style={styles.introCopy}>
              <Text style={styles.brand}>SparkR</Text>
              <Text style={styles.heroTitle}>Müziğinle eşleş.</Text>
              <Text style={styles.heroDescription}>
                {user ? `${user.name}, vibe profilin hazır.` : 'Vibe profilin hazır.'} Keşfe çıkmadan önce son bir bakış.
              </Text>
            </View>
          </View>

          <View style={styles.progress}>
            {Array.from({ length: 5 }).map((_, index) => (
              <View key={index} style={styles.progressItem} />
            ))}
          </View>
        </LinearGradient>

        <View style={styles.content}>
          <View style={styles.card}>
            <LinearGradient
              colors={[colors.primary, colors.accent, colors.secondary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.cardAccent}
            />
            <View style={styles.cardInner}>
              <View style={styles.profileTop}>
                <View>
                  <View style={styles.avatarFrame}>
                    <Image
                      source={{ uri: user?.avatarUrl || profileImage }}
                      style={styles.avatar}
                      accessibilityLabel={`${user?.name ?? 'Profil'} fotoğrafı`}
                    />
                  </View>
                  <View style={styles.verifiedAvatar}>
                    <MaterialCommunityIcons name="check" size={17} color={colors.successForeground} />
                  </View>
                </View>
                <Pressable style={styles.editButton} onPress={openProfileEditor}>
                  <MaterialCommunityIcons name="pencil" size={15} color={colors.mutedForeground} />
                  <Text style={styles.editText}>Düzenle</Text>
                </Pressable>
              </View>

              <View style={styles.profileDetails}>
                <View style={styles.nameRow}>
                  <Text style={styles.profileName}>
                    {user?.name ?? 'Sen'}
                    {user?.age ? `, ${user.age}` : ''}
                  </Text>
                  <MaterialCommunityIcons name="check-decagram" size={21} color={colors.secondary} />
                </View>
                <Text style={styles.mutedText}>{user?.bio || 'Kendinden birkaç cümleyle bahset...'}</Text>
                <View style={styles.pillRow}>
                  {selectedVibe.map((tag, index) => (
                    <Pill
                      key={tag}
                      backgroundColor={[colors.primary, colors.secondary, colors.accent][index % 3]}
                      color={[colors.primaryForeground, colors.secondaryForeground, colors.accentForeground][index % 3]}
                    >
                      {tag}
                    </Pill>
                  ))}
                </View>
              </View>

              <View style={styles.voiceCard}>
                <View style={styles.voiceIcon}>
                  <MaterialCommunityIcons
                    name={isRecording ? 'record-circle' : 'waveform'}
                    size={19}
                    color={isRecording ? colors.destructive : colors.secondary}
                  />
                </View>
                <View style={styles.voiceContent}>
                  <Text style={styles.voiceTitle}>
                    {isRecording
                      ? 'Kaydediliyor...'
                      : uploadingVoice
                      ? 'Yükleniyor...'
                      : user?.voiceNoteUrl
                      ? 'Voice Vibe hazır'
                      : 'Henüz sesli Vibe’ın yok'}
                  </Text>
                  <Waveform />
                </View>
                {uploadingVoice ? (
                  <View style={styles.playButton}>
                    <ActivityIndicator size="small" color={colors.secondaryForeground} />
                  </View>
                ) : (
                  <Pressable
                    style={[styles.playButton, isRecording && styles.recordingButton]}
                    accessibilityLabel={
                      isRecording ? 'Kaydı durdur' : user?.voiceNoteUrl ? "Voice Vibe'ı dinle" : 'Kayda başla'
                    }
                    onPress={isRecording ? stopRecording : user?.voiceNoteUrl ? togglePlayback : startRecording}
                  >
                    <MaterialCommunityIcons
                      name={isRecording ? 'stop' : user?.voiceNoteUrl ? (isPlayingVoice ? 'pause' : 'play') : 'microphone'}
                      size={18}
                      color={colors.secondaryForeground}
                    />
                  </Pressable>
                )}
              </View>
              {user?.voiceNoteUrl && !isRecording && !uploadingVoice && (
                <Pressable onPress={startRecording} style={styles.reRecordLink}>
                  <Text style={styles.reRecordText}>Yeniden kaydet</Text>
                </Pressable>
              )}
            </View>
          </View>

          <View style={styles.card}>
            <View style={styles.cardPadding}>
              <SectionHeader eyebrow="Müzik dünyaların" title="Bu gece ne çalıyor?" />
              <View style={styles.pillRow}>
                {MUSIC_TAGS.map((tag) => {
                  const selected = selectedMusic.includes(tag);
                  return (
                    <Pressable key={tag} onPress={() => toggleMusicTag(tag)}>
                      <Pill
                        backgroundColor={selected ? colors.primary : colors.muted}
                        color={selected ? colors.primaryForeground : colors.mutedForeground}
                      >
                        {tag}
                      </Pill>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </View>

          <View style={styles.card}>
            <View style={styles.cardPadding}>
              <SectionHeader eyebrow="Gece imzan" title="Vibe etiketlerin" />
              <View style={styles.pillRow}>
                {VIBE_TAG_OPTIONS.map((tag) => {
                  const selected = selectedVibe.includes(tag);
                  return (
                    <Pressable key={tag} onPress={() => toggleVibeTag(tag)}>
                      <Pill
                        backgroundColor={selected ? colors.secondary : colors.muted}
                        color={selected ? colors.secondaryForeground : colors.mutedForeground}
                      >
                        {tag}
                      </Pill>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </View>

          <View style={styles.card}>
            <View style={styles.cardPadding}>
              <View style={styles.sectionHeader}>
                <View>
                  <Text style={styles.eyebrow}>Şu anki modun</Text>
                  <Text style={styles.sectionTitle}>{selectedMood}</Text>
                  <Text style={styles.smallDescription}>Vibe Match, enerjine yakın insanları önce gösterir.</Text>
                </View>
              </View>

              <View style={styles.moodGrid}>
                {moodImages.map((mood) => {
                  const selected = mood.label === selectedMood;
                  return (
                    <Pressable
                      key={mood.label}
                      onPress={() => setSelectedMood(mood.label)}
                      style={[styles.moodItem, selected && styles.selectedMood]}
                    >
                      <Image source={{ uri: mood.uri }} style={styles.moodImage} />
                      <Text style={[styles.moodLabel, selected && { color: colors.secondaryForeground }]}>
                        {mood.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </View>

          <View style={styles.card}>
            <View style={styles.cardPadding}>
              <SectionHeader eyebrow="Keşif ayarların" title="Yakınındaki kıvılcımlar" action="Düzenle" onAction={openRadarEditor} />
              <View style={styles.statsRow}>
                <StatCard icon="account-group-outline" label="Yaş aralığı" value={`${ageRangeMin}–${ageRangeMax}`} color={colors.primary} />
                <StatCard icon="map-marker-outline" label="Keşif çapı" value={`${discoveryRadiusKm} km`} color={colors.secondary} />
              </View>
              <View style={styles.privacyNote}>
                <MaterialCommunityIcons name="shield-check-outline" size={18} color={colors.success} />
                <Text style={styles.privacyText}>
                  Konumun yalnızca yakınındaki Vibe’ları göstermek için kullanılır. Tam konumun asla paylaşılmaz.
                </Text>
              </View>
            </View>
          </View>

          {needsBirthDate && (
            <View style={styles.card}>
              <View style={styles.cardPadding}>
                <SectionHeader eyebrow="Son adım" title="Doğum tarihin" />
                <Text style={styles.smallDescription}>
                  Google/Apple hesabınla giriş yaptığın için doğum tarihini paylaşmadılar - SparkR’a
                  yalnızca 18 yaşından büyükler katılabilir, bu yüzden devam etmeden önce bunu bizden gizleyemezsin.
                </Text>
                <TextInput
                  value={birthDateInput}
                  onChangeText={setBirthDateInput}
                  placeholder="GG/AA/YYYY"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="numbers-and-punctuation"
                  style={[styles.modalInput, { marginTop: 12 }]}
                />
              </View>
            </View>
          )}

          <View style={styles.card}>
            <View style={styles.cardPadding}>
              <View style={styles.phoneRow}>
                <View style={styles.phoneIcon}>
                  <MaterialCommunityIcons name="shield-check-outline" size={21} color={colors.primary} />
                </View>
                <View style={styles.phoneCopy}>
                  <Text style={styles.phoneTitle}>Hesabın güvende</Text>
                  <Text style={styles.smallDescription}>Bilgilerin şifrelenerek saklanır, topluluğumuzu güvenli tutuyoruz.</Text>
                </View>
              </View>
              {error && (
                <View style={styles.errorRow}>
                  <MaterialCommunityIcons name="alert-circle-outline" size={16} color={colors.destructive} />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              )}
              <Text style={styles.legalText}>
                Alevi yakarak KVKK Aydınlatma Metni’ni, Konum Kullanımı’nı ve Topluluk İlkeleri’ni kabul edersin.
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          style={[
            styles.primaryButton,
            (submitting || (needsBirthDate && !birthDateInput.trim())) && styles.disabledButton,
          ]}
          accessibilityRole="button"
          onPress={handleIgnite}
          disabled={submitting || (needsBirthDate && !birthDateInput.trim())}
        >
          {submitting ? (
            <ActivityIndicator color={colors.primaryForeground} />
          ) : (
            <>
              <MaterialCommunityIcons name="fire" size={22} color={colors.primaryForeground} />
              <Text style={styles.primaryButtonText}>Alevi Yak</Text>
              <MaterialCommunityIcons name="arrow-right" size={22} color={colors.primaryForeground} />
            </>
          )}
        </Pressable>
      </View>

      <Modal visible={editingProfile} transparent animationType="fade" onRequestClose={() => setEditingProfile(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalBackdrop}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Profilini düzenle</Text>
            <Text style={styles.modalLabel}>Adın</Text>
            <TextInput
              value={editName}
              onChangeText={setEditName}
              style={styles.modalInput}
              placeholderTextColor={colors.mutedForeground}
            />
            <Text style={styles.modalLabel}>Kısa biyografi</Text>
            <TextInput
              value={editBio}
              onChangeText={setEditBio}
              multiline
              maxLength={120}
              style={[styles.modalInput, styles.modalTextarea]}
              placeholder="Kendinden birkaç cümleyle bahset..."
              placeholderTextColor={colors.mutedForeground}
            />
            <View style={styles.modalActions}>
              <Pressable style={styles.modalCancelButton} onPress={() => setEditingProfile(false)}>
                <Text style={styles.modalCancelText}>Vazgeç</Text>
              </Pressable>
              <Pressable style={styles.modalSubmitButton} onPress={saveProfileEdit} disabled={savingProfile}>
                {savingProfile ? (
                  <ActivityIndicator color={colors.primaryForeground} />
                ) : (
                  <Text style={styles.modalSubmitText}>Kaydet</Text>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={editingRadar} transparent animationType="fade" onRequestClose={() => setEditingRadar(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalBackdrop}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Keşif ayarların</Text>
            <Text style={styles.modalLabel}>Yaş aralığı (ör. 22-35)</Text>
            <TextInput
              value={radarRangeInput}
              onChangeText={setRadarRangeInput}
              keyboardType="numbers-and-punctuation"
              style={styles.modalInput}
              placeholderTextColor={colors.mutedForeground}
            />
            <Text style={styles.modalLabel}>Keşif çapı (km)</Text>
            <TextInput
              value={radarRadiusInput}
              onChangeText={setRadarRadiusInput}
              keyboardType="numbers-and-punctuation"
              style={styles.modalInput}
              placeholderTextColor={colors.mutedForeground}
            />
            <View style={styles.modalActions}>
              <Pressable style={styles.modalCancelButton} onPress={() => setEditingRadar(false)}>
                <Text style={styles.modalCancelText}>Vazgeç</Text>
              </Pressable>
              <Pressable style={styles.modalSubmitButton} onPress={saveRadarEdit}>
                <Text style={styles.modalSubmitText}>Kaydet</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <View style={styles.statCard}>
      <View style={[styles.statIcon, { backgroundColor: color, opacity: 0.9 }]}>
        <MaterialCommunityIcons name={icon} size={17} color={colors.foreground} />
      </View>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingBottom: 125,
  },
  hero: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 28,
    overflow: 'hidden',
  },
  glowPrimary: {
    position: 'absolute',
    right: -65,
    top: -15,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: colors.primary,
    opacity: 0.14,
  },
  glowSecondary: {
    position: 'absolute',
    left: -75,
    top: 90,
    width: 165,
    height: 165,
    borderRadius: 83,
    backgroundColor: colors.secondary,
    opacity: 0.14,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  stepBadge: {
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  stepText: {
    color: colors.primaryForeground,
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  intro: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 28,
    gap: 16,
  },
  flameMark: {
    width: 56,
    height: 56,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  introCopy: {
    flex: 1,
  },
  brand: {
    color: colors.primary,
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 2.5,
    textTransform: 'uppercase',
  },
  heroTitle: {
    marginTop: 3,
    color: colors.foreground,
    fontFamily: fonts.heading,
    fontSize: 29,
    fontWeight: '800',
  },
  heroDescription: {
    marginTop: 3,
    color: colors.mutedForeground,
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 20,
  },
  progress: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 25,
  },
  progressItem: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
  content: {
    paddingHorizontal: 20,
    gap: 18,
    marginTop: 18,
  },
  card: {
    overflow: 'hidden',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  cardAccent: {
    height: 25,
    opacity: 0.35,
  },
  cardInner: {
    padding: 16,
    paddingTop: 0,
  },
  cardPadding: {
    padding: 16,
  },
  profileTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  avatarFrame: {
    width: 112,
    height: 112,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: colors.muted,
  },
  avatar: {
    width: '100%',
    height: '100%',
  },
  verifiedAvatar: {
    position: 'absolute',
    right: -8,
    bottom: -8,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: colors.card,
    backgroundColor: colors.success,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 18,
    backgroundColor: colors.muted,
  },
  editText: {
    color: colors.mutedForeground,
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: '800',
  },
  profileDetails: {
    marginTop: 17,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  profileName: {
    color: colors.foreground,
    fontFamily: fonts.heading,
    fontSize: 24,
    fontWeight: '800',
  },
  mutedText: {
    marginTop: 4,
    color: colors.mutedForeground,
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 19,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 18,
  },
  outlinedPill: {
    borderWidth: 1,
  },
  pillText: {
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: '800',
  },
  voiceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    marginTop: 16,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  voiceIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.secondary,
  },
  voiceContent: {
    flex: 1,
  },
  voiceTitle: {
    color: colors.foreground,
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: '800',
  },
  waveform: {
    height: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 3,
  },
  waveBar: {
    width: 2,
    borderRadius: 2,
    backgroundColor: colors.chart3,
  },
  playButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.secondary,
  },
  recordingButton: {
    backgroundColor: colors.destructive,
  },
  reRecordLink: {
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  reRecordText: {
    color: colors.primary,
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: '800',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  eyebrow: {
    color: colors.mutedForeground,
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  sectionTitle: {
    marginTop: 4,
    color: colors.foreground,
    fontFamily: fonts.heading,
    fontSize: 18,
    fontWeight: '800',
  },
  action: {
    color: colors.primary,
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: '800',
    marginTop: 4,
  },
  smallDescription: {
    marginTop: 4,
    color: colors.mutedForeground,
    fontFamily: fonts.body,
    fontSize: 11,
    lineHeight: 17,
  },
  moodGrid: {
    flexDirection: 'row',
    gap: 7,
    marginTop: 16,
  },
  moodItem: {
    flex: 1,
    padding: 6,
    borderRadius: 16,
    backgroundColor: colors.muted,
  },
  selectedMood: {
    borderWidth: 2,
    borderColor: colors.secondary,
    backgroundColor: colors.secondary,
  },
  moodImage: {
    width: '100%',
    height: 54,
    borderRadius: 11,
  },
  moodLabel: {
    marginTop: 6,
    color: colors.mutedForeground,
    fontFamily: fonts.body,
    fontSize: 9,
    fontWeight: '800',
    textAlign: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  statCard: {
    flex: 1,
    padding: 12,
    borderRadius: 16,
    backgroundColor: colors.muted,
  },
  statIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statLabel: {
    marginTop: 9,
    color: colors.mutedForeground,
    fontFamily: fonts.body,
    fontSize: 11,
  },
  statValue: {
    marginTop: 1,
    color: colors.foreground,
    fontFamily: fonts.heading,
    fontSize: 20,
    fontWeight: '800',
  },
  privacyNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.success,
    backgroundColor: colors.success,
    opacity: 0.9,
  },
  privacyText: {
    flex: 1,
    color: colors.mutedForeground,
    fontFamily: fonts.body,
    fontSize: 11,
    lineHeight: 17,
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  phoneIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    opacity: 0.9,
  },
  phoneCopy: {
    flex: 1,
  },
  phoneTitle: {
    color: colors.foreground,
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: '800',
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.destructive,
  },
  errorText: {
    flex: 1,
    color: colors.destructive,
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: '700',
  },
  legalText: {
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    color: colors.mutedForeground,
    fontFamily: fonts.body,
    fontSize: 10,
    lineHeight: 15,
  },
  footer: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    left: 0,
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 22,
    backgroundColor: colors.background,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    paddingVertical: 16,
    borderRadius: 20,
    backgroundColor: colors.primary,
  },
  disabledButton: {
    opacity: 0.7,
  },
  primaryButtonText: {
    color: colors.primaryForeground,
    fontFamily: fonts.heading,
    fontSize: 18,
    fontWeight: '800',
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    padding: 20,
    borderRadius: 22,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalTitle: {
    color: colors.foreground,
    fontFamily: fonts.heading,
    fontSize: 18,
    fontWeight: '800',
  },
  modalLabel: {
    marginTop: 14,
    marginBottom: 6,
    color: colors.mutedForeground,
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: '800',
  },
  modalInput: {
    minHeight: 46,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.foreground,
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: '700',
  },
  modalTextarea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  modalCancelButton: {
    flex: 1,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: colors.muted,
  },
  modalCancelText: {
    color: colors.mutedForeground,
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: '800',
  },
  modalSubmitButton: {
    flex: 1,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: colors.primary,
  },
  modalSubmitText: {
    color: colors.primaryForeground,
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: '800',
  },
});
