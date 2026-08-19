import React, { useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, fonts, withAlpha } from '../theme';
import { useAuth } from '../context/AuthContext';
import { api, ApiError } from '../api/client';
import { pickAndUploadImage } from '../utils/media';
import type { RootStackParamList } from '../navigation/RootNavigator';
import MainTabBar from '../components/MainTabBar';

const fallbackProfileImage =
  'https://fwtngjyirchhhysukjxi.supabase.co/storage/v1/object/public/project-images/ed3e8af0-715b-43d1-9198-05dbe4ffa7eb/ae749811-2951-4d33-ac06-0148afbe8e5c.png';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

function Icon({ name, color = colors.foreground, size = 20 }: { name: IconName; color?: string; size?: number }) {
  return <Ionicons name={name} size={size} color={color} />;
}

function Section({ children, style }: { children: React.ReactNode; style?: object }) {
  return <View style={[styles.section, style]}>{children}</View>;
}

function SectionHeader({
  eyebrow,
  title,
  action,
  actionIcon,
  onAction,
}: {
  eyebrow: string;
  title: string;
  action?: string;
  actionIcon?: IconName;
  onAction?: () => void;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.flex}>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {action && (
        <Pressable style={styles.headerAction} onPress={onAction}>
          {actionIcon && <Icon name={actionIcon} size={16} color={colors.primary} />}
          <Text style={styles.actionText}>{action}</Text>
        </Pressable>
      )}
    </View>
  );
}

function Pill({
  children,
  backgroundColor,
  color,
  borderColor,
}: {
  children: string;
  backgroundColor: string;
  color: string;
  borderColor?: string;
}) {
  return (
    <View style={[styles.pill, { backgroundColor, borderColor }]}>
      <Text style={[styles.pillText, { color }]}>{children}</Text>
    </View>
  );
}

const MOODS: { icon: IconName; label: string }[] = [
  { icon: 'moon-outline', label: 'Chill' },
  { icon: 'musical-notes-outline', label: 'Party' },
  { icon: 'chatbubbles-outline', label: 'Deep Talk' },
  { icon: 'flash-outline', label: 'Adrenaline' },
];

export default function PersonalVibeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user, logout, updateUser } = useAuth();
  const [changingMood, setChangingMood] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  if (!user) return null;

  const handleMoodChange = async (mood: string) => {
    if (mood === user.mood || changingMood) return;
    setChangingMood(true);
    try {
      await updateUser({ mood });
    } catch (err) {
      Alert.alert('Hata', err instanceof ApiError ? err.message : 'Mod değiştirilemedi, tekrar dene.');
    } finally {
      setChangingMood(false);
    }
  };

  const addGalleryPhoto = async () => {
    setUploadingPhoto(true);
    try {
      const url = await pickAndUploadImage({ aspect: [3, 4] });
      if (url) await updateUser({ gallery: [...user.gallery, url] });
    } catch (err) {
      Alert.alert('Hata', err instanceof ApiError ? err.message : 'Fotoğraf yüklenemedi, tekrar dene.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleDelete = () => {
    Alert.alert('Hesabı sil', 'Bu işlem geri alınamaz. Hesabını ve tüm eşleşmelerini silmek istediğine emin misin?', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Hesabı sil',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteAccount();
            await logout();
          } catch (err) {
            Alert.alert('Hata', err instanceof ApiError ? err.message : 'Hesap silinemedi, tekrar dene.');
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <LinearGradient colors={[withAlpha(colors.accent, 0.2), colors.background, colors.background]} style={styles.hero}>
          <View style={[styles.glow, styles.primaryGlow]} />
          <View style={[styles.glow, styles.secondaryGlow]} />

          <View style={styles.topBar}>
            <View>
              <Text style={styles.heroEyebrow}>KİŞİSEL VIBE</Text>
              <Text style={styles.heroTitle}>Benim Vibe’ım</Text>
            </View>
            <Pressable
              style={styles.roundButton}
              accessibilityLabel="Ayarlar"
              onPress={() => navigation.navigate('EditProfile')}
            >
              <Icon name="settings-outline" color={colors.mutedForeground} />
            </Pressable>
          </View>

          <View style={styles.profileCard}>
            <View style={styles.profileImageWrap}>
              <Image source={{ uri: user.avatarUrl || fallbackProfileImage }} style={styles.profileImage} />
              <LinearGradient colors={[withAlpha(colors.background, 0), withAlpha(colors.background, 0.9)]} style={StyleSheet.absoluteFill} />
              <Pressable
                style={styles.cameraButton}
                accessibilityLabel="Profil fotoğrafını değiştir"
                onPress={() => navigation.navigate('EditProfile')}
              >
                <Icon name="camera-outline" color={colors.foreground} size={19} />
              </Pressable>
              <View style={styles.profileOverlay}>
                <View style={styles.profileDetails}>
                  <View style={styles.nameRow}>
                    <Text style={styles.profileName}>
                      {user.name}
                      {user.age ? `, ${user.age}` : ''}
                    </Text>
                    {user.verified && <Icon name="checkmark-circle" color={colors.secondary} size={21} />}
                  </View>
                  <Text style={styles.profileSubtitle}>
                    {user.bio || `${user.neighbourhood || user.city}'de iyi bir vibe arıyor.`}
                  </Text>
                </View>
                <View style={styles.verified}>
                  <View style={styles.onlineDot} />
                  <Text style={styles.verifiedText}>{user.verified ? 'Doğrulandı' : 'Doğrulanmadı'}</Text>
                </View>
              </View>
            </View>
            <View style={styles.completionRow}>
              <View style={styles.progressTrack}>
                <LinearGradient
                  colors={[colors.primary, colors.accent, colors.secondary]}
                  style={[styles.progress, { flex: user.bio ? 1 : 0.6 }]}
                />
              </View>
              <Text style={styles.completionText}>Vibe’in %{user.bio ? 100 : 60} hazır</Text>
            </View>
          </View>

          <Pressable style={styles.primaryButton} onPress={() => navigation.navigate('EditProfile')}>
            <Icon name="sparkles-outline" color={colors.primaryForeground} size={20} />
            <Text style={styles.primaryButtonText}>Vibe’ımı ve keşif tercihlerimi düzenle</Text>
            <Icon name="arrow-up-outline" color={colors.primaryForeground} size={18} />
          </Pressable>
        </LinearGradient>

        <Section style={styles.liveSection}>
          <View style={styles.sectionHeader}>
            <View style={styles.flex}>
              <Text style={[styles.eyebrow, { color: colors.secondary }]}>CANLI DURUMUN</Text>
              <Text style={styles.sectionTitle}>Şu an: {user.mood}</Text>
              <Text style={styles.description}>Seçtiğin mod, keşifteki rozetini anında değiştirir.</Text>
            </View>
            <View style={[styles.iconBubble, { backgroundColor: withAlpha(colors.secondary, 0.2) }]}>
              <Icon name="pulse-outline" color={colors.secondary} />
            </View>
          </View>
          <View style={styles.modeGrid}>
            {MOODS.map((mode) => {
              const active = mode.label === user.mood;
              return (
                <Pressable
                  key={mode.label}
                  style={[
                    styles.modeItem,
                    { backgroundColor: active ? withAlpha(colors.secondary, 0.2) : colors.muted },
                    active && { borderWidth: 1, borderColor: colors.secondary },
                  ]}
                  onPress={() => handleMoodChange(mode.label)}
                  disabled={changingMood}
                >
                  <Icon name={mode.icon} color={active ? colors.secondaryForeground : colors.mutedForeground} size={19} />
                  <Text style={[styles.modeLabel, { color: active ? colors.secondaryForeground : colors.mutedForeground }]}>
                    {mode.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Section>

        <Section>
          <SectionHeader eyebrow="MÜZİK DNA’M" title="Kayıttan kalan izler" action="Düzenle" onAction={() => navigation.navigate('EditProfile')} />
          <View style={styles.pills}>
            {user.musicTags.length > 0 ? (
              user.musicTags.map((tag, i) => (
                <Pill key={tag} backgroundColor={[colors.primary, colors.secondary, colors.muted][i % 3]} color={[colors.primaryForeground, colors.secondaryForeground, colors.mutedForeground][i % 3]}>
                  {tag}
                </Pill>
              ))
            ) : (
              <Text style={styles.emptyHint}>Henüz müzik etiketi eklemedin.</Text>
            )}
          </View>
          {!!user.favoriteTrack && (
            <View style={styles.favorite}>
              <View style={[styles.albumIcon, { backgroundColor: withAlpha(colors.accent, 0.2) }]}>
                <Icon name="disc-outline" color={colors.accent} size={22} />
              </View>
              <View style={styles.flex}>
                <Text style={styles.smallLabel}>FAVORİ PARÇA</Text>
                <Text style={styles.favoriteTitle} numberOfLines={1}>
                  {user.favoriteTrack}
                </Text>
              </View>
            </View>
          )}
        </Section>

        <Section>
          <SectionHeader eyebrow="VIBE ETİKETLERİM" title="Beni burada bulursun" action="Düzenle" actionIcon="pencil-outline" onAction={() => navigation.navigate('EditProfile')} />
          <View style={styles.pills}>
            {user.vibeTags.length > 0 ? (
              user.vibeTags.map((tag, i) => (
                <Pill
                  key={tag}
                  backgroundColor={withAlpha([colors.primary, colors.secondary, colors.accent][i % 3], 0.15)}
                  color={[colors.primary, colors.secondaryForeground, colors.accentForeground][i % 3]}
                  borderColor={withAlpha([colors.primary, colors.secondary, colors.accent][i % 3], 0.35)}
                >
                  {tag}
                </Pill>
              ))
            ) : (
              <Text style={styles.emptyHint}>Henüz vibe etiketi eklemedin.</Text>
            )}
          </View>
        </Section>

        <Section>
          <SectionHeader eyebrow="PROFİL GALERİSİ" title="Gecelerimden kareler" />
          <Pressable
            style={styles.addButton}
            accessibilityLabel="Galeriye fotoğraf ekle"
            onPress={addGalleryPhoto}
            disabled={uploadingPhoto}
          >
            {uploadingPhoto ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Icon name="add" color={colors.primary} size={20} />
            )}
          </Pressable>
          {user.gallery.length > 0 ? (
            <View style={styles.gallery}>
              {user.gallery.map((uri) => (
                <Image key={uri} source={{ uri }} style={styles.galleryImage} />
              ))}
            </View>
          ) : (
            <Text style={styles.emptyHint}>Galerin boş. Bir kaç fotoğraf ekleyerek profilini zenginleştir.</Text>
          )}
        </Section>

        <Section>
          <SectionHeader eyebrow="KEŞİF TERCİHLERİ" title="Yakınındaki kıvılcımlar" action="Düzenle" onAction={() => navigation.navigate('EditProfile')} />
          <View style={styles.preferenceGrid}>
            {[
              ['people-outline', 'Yaş aralığı', `${user.ageRangeMin}–${user.ageRangeMax} yaş`, colors.primary],
              ['location-outline', 'Keşif çapı', `${user.discoveryRadiusKm} km`, colors.secondary],
              ['moon-outline', 'Öncelik', 'Gece Modu', colors.accent],
              ['notifications-outline', 'Bildirimler', 'Fire Hour açık', colors.success],
            ].map(([icon, label, value, tint]) => (
              <View style={styles.preference} key={label as string}>
                <View style={[styles.preferenceIcon, { backgroundColor: withAlpha(tint as string, 0.15) }]}>
                  <Icon name={icon as IconName} color={tint as string} size={17} />
                </View>
                <Text style={styles.preferenceLabel}>{label}</Text>
                <Text style={styles.preferenceValue}>{value}</Text>
              </View>
            ))}
          </View>
        </Section>

        <Section>
          <Text style={styles.eyebrow}>GÜVENLİK VE KONTROL</Text>
          {[
            ['shield-checkmark-outline', 'Güvenlik Merkezi', 'Hesabın ve deneyimin senin kontrolünde.'],
            ['flag-outline', 'Şikâyet geçmişi', 'Gönderdiğin şikayetler şu an bu demoda listelenmiyor.'],
          ].map(([icon, title, subtitle]) => (
            <Pressable
              style={styles.securityRow}
              key={title}
              onPress={() => Alert.alert(title, subtitle)}
            >
              <View style={styles.securityIcon}>
                <Icon name={icon as IconName} color={colors.mutedForeground} size={19} />
              </View>
              <View style={styles.flex}>
                <Text style={styles.securityTitle}>{title}</Text>
                <Text style={styles.securitySubtitle}>{subtitle}</Text>
              </View>
              <Icon name="chevron-forward" color={colors.mutedForeground} size={18} />
            </Pressable>
          ))}
          <Pressable
            style={styles.securityRow}
            onPress={() => navigation.navigate('EditProfile', { openBlockedList: true })}
          >
            <View style={styles.securityIcon}>
              <Icon name="person-remove-outline" color={colors.mutedForeground} size={19} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.securityTitle}>Engellenen kişiler</Text>
              <Text style={styles.securitySubtitle}>Engellediğin kişileri görüntüle ve dilersen engeli kaldır.</Text>
            </View>
            <Icon name="chevron-forward" color={colors.mutedForeground} size={18} />
          </Pressable>
          <View style={styles.locationNotice}>
            <Icon name="locate-outline" color={colors.success} size={17} />
            <View style={styles.flex}>
              <Text style={styles.locationTitle}>Konum izni açık</Text>
              <Text style={styles.locationText}>
                Konumun yalnızca yakınındaki Vibe’ları göstermek için kullanılır; tam konumun asla paylaşılmaz.
              </Text>
            </View>
          </View>
          <Pressable style={styles.deleteButton} onPress={handleDelete}>
            <Icon name="trash-outline" color={colors.mutedForeground} size={17} />
            <Text style={styles.deleteText}>Hesabı Sil</Text>
          </Pressable>
          <Pressable style={styles.logoutButton} onPress={() => logout()}>
            <Icon name="log-out-outline" color={colors.mutedForeground} size={17} />
            <Text style={styles.deleteText}>Çıkış yap</Text>
          </Pressable>
        </Section>
      </ScrollView>

      <MainTabBar active="MyVibe" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingBottom: 110,
  },
  hero: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 28,
    overflow: 'hidden',
  },
  glow: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
  },
  primaryGlow: {
    right: -100,
    top: -55,
    backgroundColor: withAlpha(colors.primary, 0.12),
  },
  secondaryGlow: {
    left: -110,
    top: 150,
    backgroundColor: withAlpha(colors.secondary, 0.12),
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroEyebrow: {
    color: colors.primary,
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2,
  },
  heroTitle: {
    marginTop: 4,
    color: colors.foreground,
    fontFamily: fonts.heading,
    fontSize: 30,
    fontWeight: '800',
  },
  roundButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: withAlpha(colors.card, 0.85),
  },
  profileCard: {
    marginTop: 24,
    overflow: 'hidden',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  profileImageWrap: {
    height: 330,
  },
  profileImage: {
    width: '100%',
    height: '100%',
  },
  cameraButton: {
    position: 'absolute',
    right: 16,
    top: 16,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: withAlpha(colors.background, 0.6),
  },
  profileOverlay: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  profileDetails: {
    flex: 1,
    marginRight: 8,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  profileName: {
    color: colors.foreground,
    fontFamily: fonts.heading,
    fontSize: 30,
    fontWeight: '800',
  },
  profileSubtitle: {
    marginTop: 4,
    color: withAlpha(colors.foreground, 0.75),
    fontFamily: fonts.body,
    fontSize: 13,
  },
  verified: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 18,
    backgroundColor: withAlpha(colors.success, 0.2),
  },
  onlineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.success,
  },
  verifiedText: {
    color: colors.foreground,
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: '800',
  },
  completionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  progressTrack: {
    flex: 1,
    height: 8,
    overflow: 'hidden',
    borderRadius: 4,
    backgroundColor: colors.muted,
  },
  progress: {
    flex: 1,
  },
  completionText: {
    color: colors.primary,
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: '800',
  },
  primaryButton: {
    position: 'relative',
    marginTop: 16,
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: colors.primary,
  },
  primaryButtonText: {
    color: colors.primaryForeground,
    fontFamily: fonts.heading,
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
  },
  section: {
    position: 'relative',
    marginHorizontal: 20,
    marginTop: 20,
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  liveSection: {
    borderColor: withAlpha(colors.secondary, 0.5),
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  flex: {
    flex: 1,
  },
  eyebrow: {
    color: colors.mutedForeground,
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  sectionTitle: {
    marginTop: 4,
    color: colors.foreground,
    fontFamily: fonts.heading,
    fontSize: 20,
    fontWeight: '800',
  },
  description: {
    marginTop: 5,
    color: colors.mutedForeground,
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 19,
  },
  iconBubble: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  modeGrid: {
    marginTop: 16,
    flexDirection: 'row',
    gap: 8,
  },
  modeItem: {
    flex: 1,
    minHeight: 72,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
  },
  modeLabel: {
    marginTop: 5,
    fontFamily: fonts.body,
    fontSize: 10,
    fontWeight: '800',
    textAlign: 'center',
  },
  headerAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingTop: 4,
  },
  actionText: {
    color: colors.primary,
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: '800',
  },
  pills: {
    marginTop: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 18,
    borderWidth: 1,
  },
  pillText: {
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: '800',
  },
  emptyHint: {
    color: colors.mutedForeground,
    fontFamily: fonts.body,
    fontSize: 12,
  },
  favorite: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 16,
    backgroundColor: colors.muted,
  },
  albumIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  smallLabel: {
    color: colors.mutedForeground,
    fontFamily: fonts.body,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  favoriteTitle: {
    marginTop: 3,
    color: colors.foreground,
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: '800',
  },
  addButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: colors.muted,
  },
  gallery: {
    marginTop: 16,
    flexDirection: 'row',
    gap: 8,
  },
  galleryImage: {
    flex: 1,
    height: 112,
    borderRadius: 16,
  },
  preferenceGrid: {
    marginTop: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  preference: {
    width: '47%',
    padding: 12,
    borderRadius: 16,
    backgroundColor: colors.muted,
  },
  preferenceIcon: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
  },
  preferenceLabel: {
    marginTop: 9,
    color: colors.mutedForeground,
    fontFamily: fonts.body,
    fontSize: 12,
  },
  preferenceValue: {
    marginTop: 2,
    color: colors.foreground,
    fontFamily: fonts.heading,
    fontSize: 17,
    fontWeight: '800',
  },
  securityRow: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  securityIcon: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: colors.muted,
  },
  securityTitle: {
    color: colors.foreground,
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: '800',
  },
  securitySubtitle: {
    marginTop: 3,
    color: colors.mutedForeground,
    fontFamily: fonts.body,
    fontSize: 11,
  },
  locationNotice: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: withAlpha(colors.success, 0.25),
    backgroundColor: withAlpha(colors.success, 0.1),
  },
  locationTitle: {
    color: colors.success,
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: '800',
  },
  locationText: {
    marginTop: 4,
    color: colors.mutedForeground,
    fontFamily: fonts.body,
    fontSize: 11,
    lineHeight: 16,
  },
  deleteButton: {
    marginTop: 16,
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.muted,
  },
  logoutButton: {
    marginTop: 10,
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  deleteText: {
    color: colors.mutedForeground,
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: '800',
  },
});
