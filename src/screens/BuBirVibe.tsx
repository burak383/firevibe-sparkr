import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, fonts, withAlpha } from '../theme';
import { useAuth } from '../context/AuthContext';
import { api, ApiError } from '../api/client';
import type { Match } from '../api/types';
import type { RootStackParamList } from '../navigation/RootNavigator';

const Icon = ({
  name,
  size = 20,
  color = colors.foreground,
}: {
  name: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  size?: number;
  color?: string;
}) => <MaterialCommunityIcons name={name} size={size} color={color} />;

const PortraitCard = ({
  name,
  image,
  rotation,
  side,
}: {
  name: string;
  image: string;
  rotation: `${number}deg`;
  side: 'left' | 'right';
}) => (
  <View
    style={[styles.portraitCard, side === 'left' ? styles.leftPortrait : styles.rightPortrait, { transform: [{ rotate: rotation }] }]}
  >
    <View style={styles.portraitClip}>
      <Image source={{ uri: image }} style={styles.portrait} resizeMode="cover" />
    </View>
    <View style={[styles.nameBadge, side === 'left' ? styles.leftNameBadge : styles.rightNameBadge]}>
      <Text style={styles.nameText}>{name}</Text>
    </View>
  </View>
);

export default function VibeMatchScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'Match'>>();
  const { user } = useAuth();
  const { matchId } = route.params;

  const [match, setMatch] = useState<Match | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { match: fetched } = await api.match(matchId);
        if (!cancelled) setMatch(fetched);
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Eşleşme yüklenemedi.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [matchId]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.safeArea, styles.centerState]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </SafeAreaView>
    );
  }

  if (error || !match) {
    return (
      <SafeAreaView style={[styles.safeArea, styles.centerState]}>
        <Text style={styles.errorText}>{error ?? 'Eşleşme bulunamadı.'}</Text>
        <TouchableOpacity style={styles.continueButton} onPress={() => navigation.navigate('Deck')}>
          <Text style={styles.continueButtonText}>Alev Destesi’ne dön</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const other = match.otherUser;

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <View style={[styles.glow, styles.orangeGlow]} />
          <View style={[styles.glow, styles.purpleGlow]} />
          <View style={[styles.glow, styles.pinkGlow]} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <TouchableOpacity
              accessibilityLabel="Kaydırmaya devam et"
              style={styles.iconButton}
              activeOpacity={0.8}
              onPress={() => navigation.navigate('Deck')}
            >
              <Icon name="arrow-left" color={colors.cardForeground} />
            </TouchableOpacity>

            <View style={styles.vibePill}>
              <Icon name="fire" size={15} color={colors.primary} />
              <Text style={styles.vibePillText}>KARŞILIKLI VIBE</Text>
            </View>

            <TouchableOpacity
              accessibilityLabel="Güvenlik seçenekleri"
              style={styles.iconButton}
              activeOpacity={0.8}
              onPress={() =>
                Alert.alert(
                  'Güvenlik seçenekleri',
                  `${other.name} ile eşleşmeni engelleyebilir, şikâyet edebilir ya da kaldırabilirsin. Bu seçeneklere sohbet ekranındaki (···) menüsünden ulaşabilirsin.`
                )
              }
            >
              <Icon name="shield-check" color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          <View style={styles.intro}>
            <Text style={styles.eyebrow}>ALEVLER BULUŞTU</Text>
            <Text style={styles.title}>Bu bir Vibe!</Text>
            <Text style={styles.subtitle}>
              Sen ve {other.name} <Text style={styles.score}>%{match.compatibility}</Text> uyumlusunuz.
            </Text>
          </View>

          <View style={styles.portraitsArea}>
            <PortraitCard
              name={user?.name ?? 'Sen'}
              rotation="-7deg"
              side="left"
              image={
                user?.avatarUrl ||
                'https://fwtngjyirchhhysukjxi.supabase.co/storage/v1/object/public/project-images/ed3e8af0-715b-43d1-9198-05dbe4ffa7eb/1266e1c0-f4d1-417b-8b15-c9df5b9d0413.png'
              }
            />
            <PortraitCard name={other.name} rotation="7deg" side="right" image={other.avatarUrl} />

            <View style={styles.flameHalo} />
            <View style={styles.flameButton}>
              <Icon name="fire" size={30} color={colors.primaryForeground} />
            </View>
          </View>

          <View style={styles.tags}>
            {other.musicTags[0] && (
              <View style={[styles.tag, styles.primaryTag]}>
                <Icon name="music-note" size={15} color={colors.primary} />
                <Text style={[styles.tagText, { color: colors.primary }]}>Ortak parça zevki</Text>
              </View>
            )}
            <View style={[styles.tag, styles.accentTag]}>
              <Icon name="party-popper" size={15} color={colors.accentForeground} />
              <Text style={[styles.tagText, { color: colors.accentForeground }]}>{other.mood} modu</Text>
            </View>
            <View style={[styles.tag, styles.secondaryTag]}>
              <Icon name="moon-waning-crescent" size={15} color={colors.secondaryForeground} />
              <Text style={[styles.tagText, { color: colors.secondaryForeground }]}>Gece Modu</Text>
            </View>
          </View>

          <View style={styles.questionCard}>
            <View style={styles.questionHeader}>
              <View style={styles.sparkleIcon}>
                <Icon name="auto-fix" size={21} color={colors.secondary} />
              </View>
              <View style={styles.questionCopy}>
                <Text style={styles.questionEyebrow}>İLK KIVILCIM</Text>
                <Text style={styles.questionTitle}>{match.icebreaker.question}</Text>
              </View>
            </View>

            <View style={styles.answers}>
              {match.icebreaker.answerTheirs ? (
                <View style={[styles.answer, styles.selectedAnswer]}>
                  <Text style={styles.answerSelectedText}>
                    {other.name}: {match.icebreaker.answerTheirs}
                  </Text>
                  <Icon name="check-circle" size={19} color={colors.primary} />
                </View>
              ) : (
                <View style={[styles.answer, styles.unselectedAnswer]}>
                  <Text style={styles.answerMutedText}>{other.name} henüz cevaplamadı</Text>
                  <Icon name="circle-outline" size={19} color={colors.mutedForeground} />
                </View>
              )}

              <TouchableOpacity
                style={styles.customAnswer}
                activeOpacity={0.8}
                onPress={() => navigation.replace('Chat', { matchId: match.id })}
              >
                <Icon name="pencil-outline" size={17} color={colors.secondaryForeground} />
                <Text style={styles.customAnswerText}>Sohbette cevapla</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.safetyNote}>
            <Icon name="handshake-outline" size={16} color={colors.success} />
            <Text style={styles.safetyText}>
              Güvenli bağlantılar için saygılı kal. Bir şey ters gelirse{' '}
              <Text style={styles.safetyStrong}>şikâyet rehberine</Text> ulaşabilirsin.
            </Text>
          </View>
        </ScrollView>

        <LinearGradient
          pointerEvents="box-none"
          colors={[withAlpha(colors.background, 0), withAlpha(colors.background, 0.96), colors.background]}
          style={styles.bottomActions}
        >
          <TouchableOpacity
            style={styles.messageButton}
            activeOpacity={0.85}
            onPress={() => navigation.replace('Chat', { matchId: match.id })}
          >
            <Icon name="message-text-outline" size={21} color={colors.primaryForeground} />
            <Text style={styles.messageButtonText}>Hemen Yaz</Text>
            <Icon name="arrow-top-right" size={21} color={colors.primaryForeground} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.continueButton} activeOpacity={0.8} onPress={() => navigation.navigate('Deck')}>
            <Text style={styles.continueButtonText}>Kaydırmaya Devam Et</Text>
            <Icon name="chevron-down" size={19} color={colors.mutedForeground} />
          </TouchableOpacity>
        </LinearGradient>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centerState: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingHorizontal: 24,
  },
  errorText: {
    color: colors.mutedForeground,
    fontFamily: fonts.body,
    fontSize: 14,
    textAlign: 'center',
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 190,
  },
  header: {
    zIndex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: withAlpha(colors.card, 0.88),
    elevation: 5,
  },
  vibePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: withAlpha(colors.primary, 0.3),
    backgroundColor: withAlpha(colors.card, 0.84),
  },
  vibePillText: {
    color: colors.primary,
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  intro: {
    alignItems: 'center',
    marginTop: 20,
  },
  eyebrow: {
    color: colors.primary,
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2.4,
  },
  title: {
    marginTop: 7,
    color: colors.foreground,
    fontFamily: fonts.heading,
    fontSize: 42,
    fontWeight: '800',
    letterSpacing: -2.2,
  },
  subtitle: {
    marginTop: 9,
    color: colors.mutedForeground,
    fontFamily: fonts.body,
    fontSize: 14,
  },
  score: {
    color: colors.primary,
    fontFamily: fonts.heading,
    fontSize: 20,
    fontWeight: '800',
  },
  portraitsArea: {
    width: '100%',
    height: 224,
    maxWidth: 340,
    alignSelf: 'center',
    marginTop: 27,
  },
  portraitCard: {
    position: 'absolute',
    top: 8,
    width: 160,
    height: 160,
    padding: 6,
    borderRadius: 30,
    borderWidth: 1,
    backgroundColor: colors.card,
    elevation: 12,
  },
  leftPortrait: {
    left: 0,
    borderColor: withAlpha(colors.primary, 0.65),
    shadowColor: colors.primary,
  },
  rightPortrait: {
    right: 0,
    borderColor: withAlpha(colors.secondary, 0.7),
    shadowColor: colors.secondary,
  },
  portraitClip: {
    flex: 1,
    overflow: 'hidden',
    borderRadius: 24,
  },
  portrait: {
    width: '100%',
    height: '100%',
  },
  nameBadge: {
    position: 'absolute',
    bottom: -13,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 15,
    borderWidth: 1,
    backgroundColor: colors.card,
    elevation: 5,
  },
  leftNameBadge: {
    left: 16,
    borderColor: withAlpha(colors.primary, 0.4),
  },
  rightNameBadge: {
    right: 16,
    borderColor: withAlpha(colors.secondary, 0.5),
  },
  nameText: {
    color: colors.cardForeground,
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: '800',
  },
  flameHalo: {
    position: 'absolute',
    top: 81,
    left: '50%',
    width: 96,
    height: 96,
    marginLeft: -48,
    borderRadius: 48,
    borderWidth: 1,
    borderColor: withAlpha(colors.primary, 0.3),
  },
  flameButton: {
    position: 'absolute',
    top: 60,
    left: '50%',
    width: 56,
    height: 56,
    marginLeft: -28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 28,
    borderWidth: 4,
    borderColor: colors.background,
    backgroundColor: colors.primary,
    elevation: 10,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginTop: 5,
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
  primaryTag: {
    borderColor: withAlpha(colors.primary, 0.35),
    backgroundColor: withAlpha(colors.primary, 0.15),
  },
  accentTag: {
    borderColor: withAlpha(colors.accent, 0.4),
    backgroundColor: withAlpha(colors.accent, 0.15),
  },
  secondaryTag: {
    borderColor: withAlpha(colors.secondary, 0.45),
    backgroundColor: withAlpha(colors.secondary, 0.15),
  },
  tagText: {
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: '800',
  },
  questionCard: {
    marginTop: 24,
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    elevation: 8,
  },
  questionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  sparkleIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: withAlpha(colors.secondary, 0.2),
  },
  questionCopy: {
    flex: 1,
  },
  questionEyebrow: {
    color: colors.secondary,
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.6,
  },
  questionTitle: {
    marginTop: 4,
    color: colors.foreground,
    fontFamily: fonts.heading,
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 24,
  },
  answers: {
    gap: 8,
    marginTop: 16,
  },
  answer: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
  selectedAnswer: {
    borderColor: withAlpha(colors.primary, 0.6),
    backgroundColor: withAlpha(colors.primary, 0.1),
  },
  unselectedAnswer: {
    borderColor: colors.border,
    backgroundColor: withAlpha(colors.muted, 0.6),
  },
  answerSelectedText: {
    flex: 1,
    color: colors.foreground,
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: '800',
  },
  answerMutedText: {
    color: colors.mutedForeground,
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: '600',
  },
  customAnswer: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: withAlpha(colors.secondary, 0.6),
    backgroundColor: withAlpha(colors.secondary, 0.1),
  },
  customAnswerText: {
    color: colors.secondaryForeground,
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: '800',
  },
  safetyNote: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 12,
    marginTop: 16,
  },
  safetyText: {
    flex: 1,
    color: colors.mutedForeground,
    fontFamily: fonts.body,
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
  },
  safetyStrong: {
    color: colors.foreground,
    fontWeight: '800',
  },
  bottomActions: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    left: 0,
    paddingHorizontal: 20,
    paddingTop: 42,
    paddingBottom: 24,
  },
  messageButton: {
    height: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 20,
    backgroundColor: colors.primary,
    elevation: 10,
  },
  messageButtonText: {
    color: colors.primaryForeground,
    fontFamily: fonts.heading,
    fontSize: 18,
    fontWeight: '800',
  },
  continueButton: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  continueButtonText: {
    color: colors.mutedForeground,
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: '800',
  },
  glow: {
    position: 'absolute',
    borderRadius: 200,
    opacity: 0.16,
  },
  orangeGlow: {
    top: 70,
    left: -100,
    width: 290,
    height: 290,
    backgroundColor: colors.primary,
  },
  purpleGlow: {
    top: 130,
    right: -110,
    width: 320,
    height: 320,
    backgroundColor: colors.secondary,
    opacity: 0.2,
  },
  pinkGlow: {
    top: 280,
    left: '30%',
    width: 230,
    height: 230,
    backgroundColor: colors.accent,
    opacity: 0.12,
  },
});
