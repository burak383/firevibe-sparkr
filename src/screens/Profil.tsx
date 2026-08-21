import React, { useEffect, useState } from 'react';
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
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { colors, fonts } from '../theme';
import { useAuth } from '../context/AuthContext';
import { api, ApiError } from '../api/client';
import { pickAndUploadImage } from '../utils/media';
import { detectCityFromLocation, LocationError } from '../utils/location';
import { MUSIC_TAGS, VIBE_TAG_OPTIONS } from '../constants/tags';
import RangeSlider from '../components/RangeSlider';
import type { RootStackParamList } from '../navigation/RootNavigator';

const fallbackProfileImage =
  'https://fwtngjyirchhhysukjxi.supabase.co/storage/v1/object/public/project-images/ed3e8af0-715b-43d1-9198-05dbe4ffa7eb/e583923e-9907-495c-ade3-99d457d123d9.png';

function Icon({
  name,
  size = 20,
  color = colors.foreground,
}: {
  name: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  size?: number;
  color?: string;
}) {
  return <MaterialCommunityIcons name={name} size={size} color={color} />;
}

function Section({ children, style }: { children: React.ReactNode; style?: object }) {
  return <View style={[styles.section, style]}>{children}</View>;
}

function SectionHeading({
  eyebrow,
  title,
  action,
  onAction,
  icon,
  iconColor = colors.primary,
}: {
  eyebrow: string;
  title: string;
  action?: string;
  onAction?: () => void;
  icon?: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  iconColor?: string;
}) {
  return (
    <View style={styles.headingRow}>
      <View>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {action ? (
        <Pressable hitSlop={8} onPress={onAction}>
          <Text style={styles.actionText}>{action}</Text>
        </Pressable>
      ) : icon ? (
        <Icon name={icon} size={21} color={iconColor} />
      ) : null}
    </View>
  );
}

// A tappable pill from a fixed pool (see src/constants/tags.ts) - tapping
// toggles it on/off. Replaces the old "type your own tag into a text
// prompt" flow: free text meant two people's "aynı" tag could never
// actually match since matching/compatibility code compares tags by exact
// string, and it let people type anything with no moderation at all.
function SelectableTag({
  children,
  selected,
  backgroundColor,
  textColor,
  onPress,
}: {
  children: React.ReactNode;
  selected: boolean;
  backgroundColor: string;
  textColor: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.tag, { backgroundColor, borderColor: backgroundColor }]}>
      {selected && <Icon name="check" size={12} color={textColor} />}
      <Text style={[styles.tagText, { color: textColor }]}>{children}</Text>
    </Pressable>
  );
}

export default function EditProfileScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'EditProfile'>>();
  const { user, updateUser } = useAuth();

  const [name, setName] = useState(user?.name ?? '');
  const [city, setCity] = useState(user?.city ?? '');
  const [neighbourhood, setNeighbourhood] = useState(user?.neighbourhood ?? '');
  const [detectingLocation, setDetectingLocation] = useState(false);
  const [bio, setBio] = useState(user?.bio ?? '');
  const [vibeTags, setVibeTags] = useState<string[]>(user?.vibeTags ?? []);
  const [musicTags, setMusicTags] = useState<string[]>(user?.musicTags ?? []);
  const [ageRangeMin, setAgeRangeMin] = useState(user?.ageRangeMin ?? 18);
  const [ageRangeMax, setAgeRangeMax] = useState(user?.ageRangeMax ?? 50);
  const [visible, setVisible] = useState(user?.visible ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingField, setSavingField] = useState<string | null>(null);

  const [blockedListOpen, setBlockedListOpen] = useState(false);
  const [blockedList, setBlockedList] = useState<{ blockId: number; user: { id: number; name: string } }[]>([]);
  const [loadingBlocked, setLoadingBlocked] = useState(false);
  const [unblockingId, setUnblockingId] = useState<number | null>(null);

  // Cross-platform replacement for Alert.prompt (iOS-only). Used for tag
  // adding and for the quick age-range / radius editors below.
  const [prompt, setPrompt] = useState<{
    title: string;
    message?: string;
    placeholder?: string;
    keyboardType?: 'default' | 'numeric';
    initialValue?: string;
    onSubmit: (value: string) => void;
  } | null>(null);
  const [promptValue, setPromptValue] = useState('');

  if (!user) return null;

  const openPrompt = (config: NonNullable<typeof prompt>) => {
    setPrompt(config);
    setPromptValue(config.initialValue ?? '');
  };
  const closePrompt = () => setPrompt(null);
  const submitPrompt = () => {
    if (!prompt) return;
    const value = promptValue.trim();
    if (value) prompt.onSubmit(value);
    closePrompt();
  };

  // Both tag pools are fixed lists now (see src/constants/tags.ts) - tapping
  // a pill toggles membership instead of typing free text into a prompt.
  const toggleVibeTag = (tag: string) => {
    setVibeTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  };
  const toggleMusicTag = (tag: string) => {
    setMusicTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  };

  const saveField = async (patch: Record<string, unknown>, key: string) => {
    setSavingField(key);
    try {
      await updateUser(patch);
    } catch (err) {
      Alert.alert('Hata', err instanceof ApiError ? err.message : 'Kaydedilemedi, tekrar dene.');
    } finally {
      setSavingField(null);
    }
  };

  // Drag-slider replacement for the old "type min-max as text" flow (see
  // RangeSlider below in the render). onChange keeps the on-screen label
  // live while dragging; onChangeEnd is the point where we actually persist
  // to the backend, so a single drag doesn't fire dozens of API calls.
  const handleAgeRangeChange = (min: number, max: number) => {
    setAgeRangeMin(min);
    setAgeRangeMax(max);
  };
  const handleAgeRangeCommit = (min: number, max: number) => {
    setAgeRangeMin(min);
    setAgeRangeMax(max);
    saveField({ ageRangeMin: min, ageRangeMax: max }, 'ageRange');
  };

  const editRadius = () => {
    openPrompt({
      title: 'Keşif mesafesi',
      message: 'Kaç km çapındaki kişileri görmek istersin?',
      placeholder: '12',
      keyboardType: 'numeric',
      initialValue: String(user.discoveryRadiusKm),
      onSubmit: (value) => {
        const km = Number(value.replace(/[^0-9]/g, ''));
        if (!Number.isFinite(km) || km < 1 || km > 200) {
          Alert.alert('Geçersiz değer', 'Lütfen 1-200 arası bir mesafe gir.');
          return;
        }
        saveField({ discoveryRadiusKm: km }, 'radius');
      },
    });
  };

  const changePhoto = async () => {
    setSavingField('avatar');
    try {
      const url = await pickAndUploadImage({ aspect: [1, 1] });
      if (url) await updateUser({ avatarUrl: url });
    } catch (err) {
      Alert.alert('Hata', err instanceof ApiError ? err.message : 'Fotoğraf yüklenemedi, tekrar dene.');
    } finally {
      setSavingField(null);
    }
  };

  const addGalleryPhoto = async () => {
    setSavingField('gallery');
    try {
      const url = await pickAndUploadImage({ aspect: [3, 4] });
      if (url) await updateUser({ gallery: [...user.gallery, url] });
    } catch (err) {
      Alert.alert('Hata', err instanceof ApiError ? err.message : 'Fotoğraf yüklenemedi, tekrar dene.');
    } finally {
      setSavingField(null);
    }
  };

  const openBlockedList = async () => {
    setBlockedListOpen(true);
    setLoadingBlocked(true);
    try {
      const { blocked } = await api.blockedUsers();
      setBlockedList(blocked);
    } catch (err) {
      Alert.alert('Hata', err instanceof ApiError ? err.message : 'Liste yüklenemedi, tekrar dene.');
    } finally {
      setLoadingBlocked(false);
    }
  };

  // Lets other screens (BenimVibeM's "Engellenen kişiler" row) deep-link
  // straight into the real blocked-users list instead of faking one.
  useEffect(() => {
    if (route.params?.openBlockedList) openBlockedList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.params?.openBlockedList]);

  const handleUnblock = async (userId: number) => {
    setUnblockingId(userId);
    try {
      await api.unblockUser(userId);
      setBlockedList((prev) => prev.filter((entry) => entry.user.id !== userId));
    } catch (err) {
      Alert.alert('Hata', err instanceof ApiError ? err.message : 'Engel kaldırılamadı, tekrar dene.');
    } finally {
      setUnblockingId(null);
    }
  };

  // Fills the "Şehir" (and "Semt") fields from the device's real GPS
  // position - see src/utils/location.ts. Only updates local form state;
  // the user still has to hit "Kaydet" like any other field, and can edit
  // the detected value by hand afterwards if it's slightly off.
  const handleDetectLocation = async () => {
    setDetectingLocation(true);
    setError(null);
    try {
      const detected = await detectCityFromLocation();
      setCity(detected.city);
      if (detected.neighbourhood) setNeighbourhood(detected.neighbourhood);
    } catch (err) {
      Alert.alert('Konum bulunamadı', err instanceof LocationError ? err.message : 'Bir şeyler ters gitti, tekrar dene.');
    } finally {
      setDetectingLocation(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Adını boş bırakamazsın.');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await updateUser({
        name: name.trim(),
        city: city.trim(),
        neighbourhood: neighbourhood.trim(),
        bio: bio.slice(0, 120),
        vibeTags,
        musicTags,
        visible,
      });
      navigation.goBack();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Kaydedilemedi, tekrar dene.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.headerGlowPrimary} />
          <View style={styles.headerGlowSecondary} />
          <View style={styles.headerNav}>
            <Pressable
              accessibilityLabel="Geri dön"
              style={styles.headerButton}
              onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('MyVibe'))}
            >
              <Icon name="arrow-left" size={22} color={colors.cardForeground} />
            </Pressable>

            <View style={styles.headerTitleWrap}>
              <Text style={styles.headerEyebrow}>HESABIN</Text>
              <Text style={styles.headerTitle}>Profilini düzenle</Text>
            </View>

            <Pressable
              accessibilityLabel="Yardım"
              style={styles.headerButton}
              onPress={() => Alert.alert('Yardım', 'Bilgilerini güncelle ve Değişiklikleri Kaydet’e dokun.')}
            >
              <Icon name="help-circle-outline" size={22} color={colors.mutedForeground} />
            </Pressable>
          </View>
          <Text style={styles.headerDescription}>
            Geceye nasıl karıştığını anlat. Değişikliklerin Vibe Radar’da hemen görünür.
          </Text>
        </View>

        <Section>
          <View style={styles.profileRow}>
            <View style={styles.avatarWrap}>
              <Image
                source={{ uri: user.avatarUrl || fallbackProfileImage }}
                style={styles.avatar}
                resizeMode="cover"
                accessibilityLabel={`${user.name}'in profil fotoğrafı`}
              />
              {user.verified && (
                <View style={styles.verifiedBadge}>
                  <Icon name="check" size={18} color={colors.successForeground} />
                </View>
              )}
            </View>

            <View style={styles.profileInfo}>
              <View style={styles.nameRow}>
                <Text style={styles.profileName}>
                  {user.name}
                  {user.age ? `, ${user.age}` : ''}
                </Text>
                {user.verified && <Icon name="check-decagram" size={19} color={colors.secondary} />}
              </View>
              <Text style={styles.caption}>
                {user.verified ? 'Profilin doğrulandı' : 'Profilin doğrulanmadı'} · {user.city}
              </Text>
              <Pressable style={styles.primarySmallButton} onPress={changePhoto} disabled={savingField === 'avatar'}>
                {savingField === 'avatar' ? (
                  <ActivityIndicator size="small" color={colors.primaryForeground} />
                ) : (
                  <Icon name="camera-outline" size={17} color={colors.primaryForeground} />
                )}
                <Text style={styles.primaryButtonText}>Fotoğrafı değiştir</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.verificationNotice}>
            <Icon name="shield-check-outline" size={19} color={colors.success} />
            <Text style={styles.noticeText}>
              <Text style={styles.successText}>{user.verified ? 'Doğrulanmış profil' : 'Doğrulanmamış profil'}</Text> ·
              {' '}
              {user.verified
                ? 'Topluluğa gerçek bir insan olduğunu gösteriyorsun.'
                : 'Bir selfie çekerek doğrulanmış rozetini aç.'}
            </Text>
            {!user.verified && (
              <Pressable
                accessibilityLabel="Profilini doğrula"
                style={styles.verifyLink}
                onPress={() => navigation.navigate('SelfieVerify')}
              >
                <Text style={styles.verifyLinkText}>Doğrula</Text>
              </Pressable>
            )}
          </View>
        </Section>

        <Section>
          <SectionHeading eyebrow="TEMEL BİLGİLER" title="Seni biraz tanıyalım" icon="creation" />

          <View style={styles.form}>
            <Text style={styles.label}>Adın</Text>
            <View style={styles.inputWrap}>
              <Icon name="account-outline" size={19} color={colors.primary} />
              <TextInput
                value={name}
                onChangeText={setName}
                style={styles.input}
                accessibilityLabel="Adın"
                placeholderTextColor={colors.mutedForeground}
              />
            </View>

            <Text style={styles.label}>Kısa biyografi</Text>
            <View style={styles.bioWrap}>
              <TextInput
                value={bio}
                onChangeText={setBio}
                multiline
                textAlignVertical="top"
                maxLength={120}
                style={styles.bioInput}
                accessibilityLabel="Kısa biyografi"
                placeholder="Kendinden birkaç cümleyle bahset..."
                placeholderTextColor={colors.mutedForeground}
              />
              <Text style={styles.characterCount}>{bio.length} / 120</Text>
            </View>

            <View style={styles.twoColumns}>
              <View style={styles.column}>
                <View style={styles.labelRow}>
                  <Text style={styles.label}>Şehir</Text>
                  <Pressable
                    accessibilityLabel="Konumu kullanarak şehri bul"
                    onPress={handleDetectLocation}
                    disabled={detectingLocation}
                    style={styles.detectLocationLink}
                  >
                    {detectingLocation ? (
                      <ActivityIndicator size="small" color={colors.secondary} />
                    ) : (
                      <>
                        <Icon name="crosshairs-gps" size={13} color={colors.secondary} />
                        <Text style={styles.detectLocationText}>Konumu bul</Text>
                      </>
                    )}
                  </Pressable>
                </View>
                <View style={styles.inputWrap}>
                  <Icon name="map-marker-outline" size={18} color={colors.secondary} />
                  <TextInput
                    value={city}
                    onChangeText={setCity}
                    style={styles.input}
                    accessibilityLabel="Şehir"
                    placeholderTextColor={colors.mutedForeground}
                  />
                </View>
              </View>

              <View style={styles.column}>
                <Text style={styles.label}>Yaş</Text>
                <View style={[styles.inputWrap, styles.disabledInput]}>
                  <Icon name="cake-variant-outline" size={18} color={colors.mutedForeground} />
                  <Text style={styles.disabledText}>{user.age ? `${user.age} yaş` : 'Belirtilmedi'}</Text>
                </View>
              </View>
            </View>

            <Text style={styles.label}>Semt</Text>
            <View style={styles.inputWrap}>
              <Icon name="map-outline" size={18} color={colors.secondary} />
              <TextInput
                value={neighbourhood}
                onChangeText={setNeighbourhood}
                style={styles.input}
                accessibilityLabel="Semt"
                placeholder="ör. Kadıköy"
                placeholderTextColor={colors.mutedForeground}
              />
            </View>
          </View>
        </Section>

        <Section>
          <SectionHeading eyebrow="GECE İMZAN" title="Vibe etiketlerin" />
          <Text style={styles.tagHint}>Sana uyanları seç, istediğin kadar işaretleyebilirsin.</Text>
          <View style={styles.tags}>
            {VIBE_TAG_OPTIONS.map((tag, i) => {
              const selected = vibeTags.includes(tag);
              return (
                <SelectableTag
                  key={tag}
                  selected={selected}
                  backgroundColor={selected ? [colors.primary, colors.secondary, colors.accent][i % 3] : colors.muted}
                  textColor={
                    selected
                      ? [colors.primaryForeground, colors.secondaryForeground, colors.accentForeground][i % 3]
                      : colors.mutedForeground
                  }
                  onPress={() => toggleVibeTag(tag)}
                >
                  {tag}
                </SelectableTag>
              );
            })}
          </View>
        </Section>

        <Section>
          <SectionHeading eyebrow="SESİN" title="Bu gece ne çalıyor?" />
          <Text style={styles.tagHint}>Sana uyanları seç, istediğin kadar işaretleyebilirsin.</Text>
          <View style={styles.tags}>
            {MUSIC_TAGS.map((tag, i) => {
              const selected = musicTags.includes(tag);
              return (
                <SelectableTag
                  key={tag}
                  selected={selected}
                  backgroundColor={selected ? [colors.primary, colors.secondary, colors.muted][i % 3] : colors.muted}
                  textColor={
                    selected
                      ? [colors.primaryForeground, colors.secondaryForeground, colors.mutedForeground][i % 3]
                      : colors.mutedForeground
                  }
                  onPress={() => toggleMusicTag(tag)}
                >
                  {tag}
                </SelectableTag>
              );
            })}
          </View>

          <View style={styles.moodCard}>
            <View>
              <Text style={styles.moodEyebrow}>AKTİF RUH HALİN</Text>
              <Text style={styles.moodTitle}>{user.mood}</Text>
            </View>
            <Pressable style={styles.activePill} onPress={() => navigation.navigate('MyVibe')}>
              <Text style={styles.activePillText}>Değiştir</Text>
            </Pressable>
          </View>
        </Section>

        <Section>
          <SectionHeading
            eyebrow="PROFİL GALERİSİ"
            title="Geceden kareler"
            action={savingField === 'gallery' ? 'Yükleniyor...' : 'Ekle'}
            onAction={savingField === 'gallery' ? undefined : addGalleryPhoto}
          />
          {user.gallery.length > 0 ? (
            <View style={styles.gallery}>
              {user.gallery.map((uri) => (
                <View key={uri} style={styles.galleryItem}>
                  <Image source={{ uri }} style={styles.galleryImage} resizeMode="cover" />
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.helperText}>Galerin boş. Birkaç fotoğraf eklemek eşleşme şansını artırır.</Text>
          )}
        </Section>

        <Section>
          <SectionHeading eyebrow="KEŞİF AYARLARI" title="Seni kimler görsün?" icon="tune-variant" />

          <View style={styles.rangeCard}>
            <View style={styles.rangeHeader}>
              <View style={[styles.tileIcon, { backgroundColor: colors.primary }]}>
                <Icon name="account-group-outline" size={17} color={colors.foreground} />
              </View>
              <Text style={styles.rangeLabel}>Yaş aralığı</Text>
              {savingField === 'ageRange' ? (
                <ActivityIndicator size="small" color={colors.foreground} />
              ) : (
                <Text style={styles.rangeValue}>
                  {ageRangeMin}–{ageRangeMax}
                </Text>
              )}
            </View>
            <RangeSlider
              min={18}
              max={50}
              valueMin={ageRangeMin}
              valueMax={ageRangeMax}
              onChange={handleAgeRangeChange}
              onChangeEnd={handleAgeRangeCommit}
            />
            <View style={styles.rangeBounds}>
              <Text style={styles.rangeBoundText}>18</Text>
              <Text style={styles.rangeBoundText}>50</Text>
            </View>
          </View>

          <View style={styles.twoColumns}>
            <InfoTile
              icon="map-marker-outline"
              color={colors.secondary}
              label="Mesafe"
              value={`${user.discoveryRadiusKm} km`}
              onPress={editRadius}
              busy={savingField === 'radius'}
            />
          </View>

          <View style={styles.visibilityCard}>
            <View style={styles.visibilityIcon}>
              <Icon name="eye-outline" size={19} color={colors.success} />
            </View>
            <View style={styles.visibilityText}>
              <Text style={styles.itemTitle}>Profil görünürlüğü</Text>
              <Text style={styles.caption}>{visible ? 'Vibe Radar’da görünür' : 'Gizlendi'}</Text>
            </View>
            <Pressable onPress={() => setVisible((v) => !v)} style={[styles.switchTrack, !visible && styles.switchTrackOff]}>
              <View style={[styles.switchThumb, !visible && styles.switchThumbOff]} />
            </Pressable>
          </View>
        </Section>

        <Section>
          <SettingRow icon="phone-check-outline" color={colors.success} title="Telefon doğrulaması" subtitle={user.contact} badge={user.phoneVerified ? 'Doğrulandı' : undefined} />
          <View style={styles.separator} />
          <SettingRow
            icon="shield-outline"
            color={colors.secondary}
            title="Güvenlik merkezi"
            subtitle="KVKK, topluluk ilkeleri ve hesap silme"
            onPress={() => navigation.navigate('Security')}
          />
          <View style={styles.separator} />

          <Text style={styles.eyebrow}>HASSAS KONTROLLER</Text>
          <View style={styles.controlList}>
            <ControlRow icon="cancel" title="Engellenenler" onPress={openBlockedList} />
            <ControlRow icon="flag-outline" title="Şikâyet ve destek" />
          </View>
          <Text style={styles.footerNote}>Gizlilik Merkezi · Topluluk İlkeleri · KVKK Aydınlatma Metni</Text>
        </Section>

        {error && (
          <View style={styles.errorBox}>
            <Icon name="alert-circle-outline" size={16} color={colors.destructive} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}
      </ScrollView>

      <View style={styles.bottomBar}>
        <Pressable style={[styles.saveButton, saving && styles.disabledButton]} onPress={handleSave} disabled={saving}>
          {saving ? (
            <ActivityIndicator color={colors.primaryForeground} />
          ) : (
            <>
              <Icon name="check" size={21} color={colors.primaryForeground} />
              <Text style={styles.saveButtonText}>Değişiklikleri Kaydet</Text>
            </>
          )}
        </Pressable>
      </View>

      <Modal visible={!!prompt} transparent animationType="fade" onRequestClose={closePrompt}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalBackdrop}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{prompt?.title}</Text>
            {prompt?.message ? <Text style={styles.modalMessage}>{prompt.message}</Text> : null}
            <TextInput
              value={promptValue}
              onChangeText={setPromptValue}
              placeholder={prompt?.placeholder}
              placeholderTextColor={colors.mutedForeground}
              keyboardType={prompt?.keyboardType === 'numeric' ? 'numbers-and-punctuation' : 'default'}
              autoFocus
              style={styles.modalInput}
              onSubmitEditing={submitPrompt}
            />
            <View style={styles.modalActions}>
              <Pressable style={styles.modalCancelButton} onPress={closePrompt}>
                <Text style={styles.modalCancelText}>Vazgeç</Text>
              </Pressable>
              <Pressable style={styles.modalSubmitButton} onPress={submitPrompt}>
                <Text style={styles.modalSubmitText}>Ekle</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={blockedListOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setBlockedListOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Engellenenler</Text>
            {loadingBlocked ? (
              <ActivityIndicator style={styles.blockedLoading} color={colors.primary} />
            ) : blockedList.length === 0 ? (
              <Text style={styles.modalMessage}>Kimseyi engellemedin.</Text>
            ) : (
              <View style={styles.blockedList}>
                {blockedList.map((entry) => (
                  <View key={entry.blockId} style={styles.blockedRow}>
                    <Text style={styles.blockedName}>{entry.user.name}</Text>
                    <Pressable
                      style={styles.blockedUnblockButton}
                      onPress={() => handleUnblock(entry.user.id)}
                      disabled={unblockingId === entry.user.id}
                    >
                      {unblockingId === entry.user.id ? (
                        <ActivityIndicator size="small" color={colors.primary} />
                      ) : (
                        <Text style={styles.blockedUnblockText}>Kaldır</Text>
                      )}
                    </Pressable>
                  </View>
                ))}
              </View>
            )}
            <Pressable style={styles.modalCancelButton} onPress={() => setBlockedListOpen(false)}>
              <Text style={styles.modalCancelText}>Kapat</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function InfoTile({
  icon,
  color,
  label,
  value,
  onPress,
  busy,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  color: string;
  label: string;
  value: string;
  onPress?: () => void;
  busy?: boolean;
}) {
  const content = (
    <>
      <View style={[styles.tileIcon, { backgroundColor: color }]}>
        <Icon name={icon} size={17} color={colors.foreground} />
      </View>
      <Text style={styles.tileLabel}>{label}</Text>
      {busy ? (
        <ActivityIndicator style={styles.tileSpinner} color={colors.foreground} />
      ) : (
        <Text style={styles.tileValue}>{value}</Text>
      )}
    </>
  );

  if (!onPress) {
    return <View style={styles.infoTile}>{content}</View>;
  }

  return (
    <Pressable style={styles.infoTile} onPress={onPress} disabled={busy}>
      {content}
    </Pressable>
  );
}

function SettingRow({
  icon,
  color,
  title,
  subtitle,
  badge,
  onPress,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  color: string;
  title: string;
  subtitle: string;
  badge?: string;
  // Optional on purpose: a row with no onPress renders as plain info (no
  // chevron) instead of pretending to be tappable - see "Telefon
  // doğrulaması" below, which is status-only.
  onPress?: () => void;
}) {
  const content = (
    <>
      <View style={[styles.settingIcon, { backgroundColor: color }]}>
        <Icon name={icon} size={20} color={colors.foreground} />
      </View>
      <View style={styles.settingContent}>
        <Text style={styles.itemTitle}>{title}</Text>
        <Text style={styles.caption}>{subtitle}</Text>
      </View>
      {badge ? (
        <View style={[styles.statusBadge, { backgroundColor: colors.success }]}>
          <Text style={styles.statusText}>{badge}</Text>
        </View>
      ) : onPress ? (
        <Icon name="chevron-right" size={21} color={colors.mutedForeground} />
      ) : null}
    </>
  );
  return onPress ? (
    <Pressable style={styles.settingRow} onPress={onPress}>
      {content}
    </Pressable>
  ) : (
    <View style={styles.settingRow}>{content}</View>
  );
}

function ControlRow({
  icon,
  title,
  onPress,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  title: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      style={styles.controlRow}
      onPress={onPress ?? (() => Alert.alert(title, 'Bu demoda henüz bağlı değil.'))}
    >
      <View style={styles.controlTitle}>
        <Icon name={icon} size={19} color={colors.mutedForeground} />
        <Text style={styles.controlText}>{title}</Text>
      </View>
      <Icon name="chevron-right" size={20} color={colors.mutedForeground} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingBottom: 118,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 27,
    overflow: 'hidden',
  },
  headerGlowPrimary: {
    position: 'absolute',
    width: 190,
    height: 190,
    borderRadius: 95,
    right: -75,
    top: -70,
    backgroundColor: colors.primary,
    opacity: 0.13,
  },
  headerGlowSecondary: {
    position: 'absolute',
    width: 175,
    height: 175,
    borderRadius: 88,
    left: -80,
    top: 90,
    backgroundColor: colors.secondary,
    opacity: 0.12,
  },
  headerNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerTitleWrap: {
    alignItems: 'center',
  },
  headerEyebrow: {
    color: colors.primary,
    fontFamily: fonts.body,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2,
  },
  headerTitle: {
    color: colors.foreground,
    fontFamily: fonts.heading,
    fontSize: 20,
    fontWeight: '800',
    marginTop: 4,
  },
  headerDescription: {
    color: colors.mutedForeground,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 24,
    maxWidth: 310,
  },
  section: {
    marginHorizontal: 20,
    marginBottom: 20,
    padding: 16,
    borderRadius: 20,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  profileRow: {
    flexDirection: 'row',
    gap: 16,
  },
  avatarWrap: {
    width: 112,
    height: 112,
    position: 'relative',
  },
  avatar: {
    width: 112,
    height: 112,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  verifiedBadge: {
    position: 'absolute',
    right: -7,
    bottom: -7,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.success,
    borderWidth: 4,
    borderColor: colors.card,
  },
  profileInfo: {
    flex: 1,
    minWidth: 0,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  profileName: {
    color: colors.foreground,
    fontFamily: fonts.heading,
    fontSize: 25,
    fontWeight: '800',
  },
  caption: {
    color: colors.mutedForeground,
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 18,
  },
  primarySmallButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 15,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 22,
    backgroundColor: colors.primary,
  },
  primaryButtonText: {
    color: colors.primaryForeground,
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: '800',
  },
  verificationNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: colors.muted,
  },
  noticeText: {
    flex: 1,
    color: colors.mutedForeground,
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 17,
  },
  successText: {
    color: colors.success,
    fontWeight: '800',
  },
  verifyLink: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 14,
    backgroundColor: colors.primary,
  },
  verifyLinkText: {
    color: colors.primaryForeground,
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: '800',
  },
  headingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  eyebrow: {
    color: colors.mutedForeground,
    fontFamily: fonts.body,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  sectionTitle: {
    color: colors.foreground,
    fontFamily: fonts.heading,
    fontSize: 19,
    fontWeight: '800',
    marginTop: 4,
  },
  actionText: {
    color: colors.primary,
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: '800',
  },
  form: {
    marginTop: 16,
    gap: 7,
  },
  label: {
    color: colors.mutedForeground,
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: '800',
    marginTop: 6,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  detectLocationLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 20,
  },
  detectLocationText: {
    color: colors.secondary,
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: '700',
  },
  inputWrap: {
    minHeight: 49,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: colors.input,
    borderWidth: 1,
    borderColor: colors.border,
  },
  input: {
    flex: 1,
    color: colors.foreground,
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: '700',
    paddingVertical: 0,
  },
  bioWrap: {
    minHeight: 96,
    paddingHorizontal: 14,
    paddingTop: 11,
    borderRadius: 16,
    backgroundColor: colors.input,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bioInput: {
    height: 62,
    color: colors.foreground,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    padding: 0,
  },
  characterCount: {
    color: colors.mutedForeground,
    fontFamily: fonts.body,
    fontSize: 10,
    textAlign: 'right',
  },
  twoColumns: {
    flexDirection: 'row',
    gap: 12,
  },
  column: {
    flex: 1,
  },
  disabledInput: {
    backgroundColor: colors.muted,
  },
  disabledText: {
    color: colors.mutedForeground,
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: '700',
  },
  tagHint: {
    marginTop: 10,
    color: colors.mutedForeground,
    fontFamily: fonts.body,
    fontSize: 12,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1,
  },
  tagText: {
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: '800',
  },
  moodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    padding: 12,
    borderRadius: 16,
    backgroundColor: colors.muted,
  },
  moodEyebrow: {
    color: colors.mutedForeground,
    fontFamily: fonts.body,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.3,
  },
  moodTitle: {
    color: colors.secondaryForeground,
    fontFamily: fonts.heading,
    fontSize: 16,
    fontWeight: '800',
    marginTop: 4,
  },
  activePill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: colors.secondary,
  },
  activePillText: {
    color: colors.secondaryForeground,
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: '800',
  },
  gallery: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
  },
  galleryItem: {
    flex: 1,
    height: 128,
    overflow: 'hidden',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  galleryImage: {
    width: '100%',
    height: '100%',
  },
  helperText: {
    color: colors.mutedForeground,
    fontFamily: fonts.body,
    fontSize: 12,
    marginTop: 12,
  },
  rangeCard: {
    marginTop: 16,
    marginBottom: 12,
    padding: 14,
    borderRadius: 16,
    backgroundColor: colors.muted,
  },
  rangeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rangeLabel: {
    flex: 1,
    color: colors.mutedForeground,
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: '800',
  },
  rangeValue: {
    color: colors.foreground,
    fontFamily: fonts.heading,
    fontSize: 17,
    fontWeight: '800',
  },
  rangeBounds: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -4,
    paddingHorizontal: 2,
  },
  rangeBoundText: {
    color: colors.mutedForeground,
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: '700',
  },
  infoTile: {
    flex: 1,
    padding: 12,
    borderRadius: 16,
    backgroundColor: colors.muted,
  },
  tileIcon: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
  },
  tileLabel: {
    color: colors.mutedForeground,
    fontFamily: fonts.body,
    fontSize: 12,
    marginTop: 8,
  },
  tileValue: {
    color: colors.foreground,
    fontFamily: fonts.heading,
    fontSize: 21,
    fontWeight: '800',
    marginTop: 2,
  },
  tileSpinner: {
    marginTop: 6,
    alignSelf: 'flex-start',
  },
  visibilityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    padding: 12,
    borderRadius: 16,
    backgroundColor: colors.muted,
    borderWidth: 1,
    borderColor: colors.success,
  },
  visibilityIcon: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: colors.success,
  },
  visibilityText: {
    flex: 1,
    marginLeft: 12,
  },
  itemTitle: {
    color: colors.foreground,
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: '800',
  },
  switchTrack: {
    width: 48,
    height: 28,
    justifyContent: 'center',
    padding: 4,
    borderRadius: 15,
    backgroundColor: colors.success,
  },
  switchTrackOff: {
    backgroundColor: colors.muted,
  },
  switchThumb: {
    alignSelf: 'flex-end',
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.foreground,
  },
  switchThumbOff: {
    alignSelf: 'flex-start',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  settingIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  settingContent: {
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
  },
  statusText: {
    color: colors.successForeground,
    fontFamily: fonts.body,
    fontSize: 10,
    fontWeight: '800',
  },
  separator: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 16,
  },
  controlList: {
    marginTop: 4,
  },
  controlRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  controlTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  controlText: {
    color: colors.foreground,
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: '800',
  },
  footerNote: {
    color: colors.mutedForeground,
    fontFamily: fonts.body,
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
    marginTop: 12,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 20,
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
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 24,
    backgroundColor: colors.background,
  },
  saveButton: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 20,
    backgroundColor: colors.primary,
  },
  disabledButton: {
    opacity: 0.7,
  },
  saveButtonText: {
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
  modalMessage: {
    color: colors.mutedForeground,
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 6,
  },
  modalInput: {
    marginTop: 16,
    height: 49,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: colors.input,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.foreground,
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: '700',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
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
  blockedLoading: {
    marginTop: 20,
  },
  blockedList: {
    marginTop: 16,
    gap: 10,
  },
  blockedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: colors.muted,
  },
  blockedName: {
    color: colors.foreground,
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: '700',
  },
  blockedUnblockButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  blockedUnblockText: {
    color: colors.primary,
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: '800',
  },
});
