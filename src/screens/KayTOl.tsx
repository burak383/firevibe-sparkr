import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { FontAwesome5, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, fonts } from '../theme';
import { useAuth } from '../context/AuthContext';
import { ApiError } from '../api/client';
import { extractGoogleIdToken, isGoogleSignInConfigured, useGoogleAuthRequest } from '../utils/googleAuth';
import type { RootStackParamList } from '../navigation/RootNavigator';

const HERO_IMAGE =
  'https://fwtngjyirchhhysukjxi.supabase.co/storage/v1/object/public/project-images/ed3e8af0-715b-43d1-9198-05dbe4ffa7eb/ad819ea4-92c9-4eee-8f9a-6b121566dcc4.png';

const Icon = ({
  name,
  color,
  size = 20,
}: {
  name: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  color: string;
  size?: number;
}) => <MaterialCommunityIcons name={name} color={color} size={size} />;

function passwordStrength(password: string): { score: 0 | 1 | 2 | 3; label: string } {
  let score = 0;
  if (password.length >= 8) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  const labels = ['Zayıf', 'Zayıf', 'Orta', 'Güçlü'];
  return { score: score as 0 | 1 | 2 | 3, label: labels[score] };
}

// Formats free digit typing into DD/AA/YYYY as the user types.
function formatBirthDateInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  const parts = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)].filter(Boolean);
  return parts.join('/');
}

export default function CreateAccountScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { register, loginWithGoogle } = useAuth();

  const [name, setName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [contact, setContact] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);

  const [googleRequest, googleResponse, promptGoogleAsync] = useGoogleAuthRequest();

  useEffect(() => {
    const idToken = extractGoogleIdToken(googleResponse);
    if (!idToken) return;
    (async () => {
      setGoogleSubmitting(true);
      try {
        await loginWithGoogle(idToken);
        // RootNavigator moves to onboarding/main app automatically once `user` is set.
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Google ile kayıt olunamadı.');
      } finally {
        setGoogleSubmitting(false);
      }
    })();
  }, [googleResponse, loginWithGoogle]);

  const handleGooglePress = () => {
    if (!isGoogleSignInConfigured) {
      Alert.alert(
        'Google ile kayıt yapılandırılmamış',
        'Bunu etkinleştirmek için mobile/.env dosyasına EXPO_PUBLIC_GOOGLE_*_CLIENT_ID değerlerini, backend/.env dosyasına da GOOGLE_CLIENT_ID değerini eklemen gerekiyor. Adımlar için .env.example dosyalarındaki notlara bak.'
      );
      return;
    }
    promptGoogleAsync();
  };

  const strength = passwordStrength(password);

  const handleSubmit = async () => {
    if (!name.trim()) return setError('Adını yazmalısın.');
    if (birthDate.replace(/\D/g, '').length !== 8) return setError('Doğum tarihini GG/AA/YYYY biçiminde gir.');
    if (!contact.trim()) return setError('Telefon numaranı veya e-postanı gir.');
    if (password.length < 8 || strength.score < 3) {
      return setError('Şifren en az 8 karakter, bir büyük harf ve bir sembol içermeli.');
    }

    setError(null);
    setSubmitting(true);
    try {
      await register({ name: name.trim(), birthDate, contact: contact.trim(), password });
      // RootNavigator moves to the Vibe Kurulumu (onboarding) screen automatically.
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Kayıt oluşturulamadı. Tekrar dene.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.hero}>
            <Image source={{ uri: HERO_IMAGE }} style={styles.heroImage} />
            <LinearGradient
              pointerEvents="none"
              colors={[colors.background, 'transparent', colors.background]}
              locations={[0, 0.42, 1]}
              style={StyleSheet.absoluteFill}
            />

            <View style={styles.heroHeader}>
              <Pressable
                accessibilityLabel="Geri dön"
                style={styles.roundButton}
                hitSlop={8}
                onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Login'))}
              >
                <Icon name="arrow-left" color={colors.cardForeground} size={22} />
              </Pressable>

              <View style={styles.brandPill}>
                <View style={styles.brandIcon}>
                  <Icon name="fire" color={colors.primaryForeground} size={16} />
                </View>
                <Text style={styles.brandText}>SparkR</Text>
              </View>

              <View style={styles.headerSpacer} />
            </View>
          </View>

          <View style={styles.content}>
            <View style={styles.intro}>
              <Text style={styles.eyebrow}>İLK KIVILCIM</Text>
              <Text style={styles.title}>
                Geceye kendi{'\n'}
                <Text style={styles.titleAccent}>vibeni bırak.</Text>
              </Text>
              <Text style={styles.subtitle}>
                Müziğini aç, modunu seç, sana iyi gelen insanlarla geceye karış.
              </Text>
            </View>

            <View style={styles.form}>
              <FieldLabel text="ADIN" />
              <View style={[styles.inputShell, styles.activeInput]}>
                <Icon name="creation" color={colors.primary} size={20} />
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="Gece seni nasıl çağırsın?"
                  placeholderTextColor={colors.mutedForeground}
                  style={styles.input}
                  autoCapitalize="words"
                />
              </View>

              <FieldLabel text="DOĞUM TARİHİ" />
              <View style={styles.inputShell}>
                <Icon name="cake-variant" color={colors.secondary} size={20} />
                <TextInput
                  value={birthDate}
                  onChangeText={(value) => setBirthDate(formatBirthDateInput(value))}
                  placeholder="GG / AA / YYYY"
                  placeholderTextColor={colors.mutedForeground}
                  style={styles.input}
                  keyboardType="number-pad"
                  maxLength={10}
                />
                <Text style={styles.successText}>18+</Text>
              </View>
              <View style={styles.helperRow}>
                <Icon name="shield-check" color={colors.success} size={15} />
                <Text style={styles.helperText}>
                  Yaşın profilinde görünmez; sadece 18+ topluluğumuzu korumak için.
                </Text>
              </View>

              <FieldLabel text="TELEFON VEYA E-POSTA" />
              <View style={styles.inputShell}>
                <Icon name="at" color={colors.accent} size={20} />
                <TextInput
                  value={contact}
                  onChangeText={setContact}
                  placeholder="ornek@email.com"
                  placeholderTextColor={colors.mutedForeground}
                  style={styles.input}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>

              <View style={styles.passwordLabelRow}>
                <FieldLabel text="GÜÇLÜ BİR ŞİFRE OLUŞTUR" />
                {password.length > 0 && (
                  <Text
                    style={[
                      styles.successText,
                      strength.score < 3 && { color: colors.mutedForeground },
                    ]}
                  >
                    {strength.label}
                  </Text>
                )}
              </View>
              <View style={styles.inputShell}>
                <Icon name="lock-outline" color={colors.secondary} size={20} />
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!passwordVisible}
                  style={[styles.input, styles.passwordInput]}
                  autoCapitalize="none"
                  placeholder="En az 8 karakter"
                  placeholderTextColor={colors.mutedForeground}
                />
                <Pressable
                  accessibilityLabel="Şifreyi göster"
                  onPress={() => setPasswordVisible((visible) => !visible)}
                  hitSlop={8}
                >
                  <Icon
                    name={passwordVisible ? 'eye-off-outline' : 'eye-outline'}
                    color={colors.mutedForeground}
                    size={20}
                  />
                </Pressable>
              </View>

              <View style={styles.strengthRow}>
                {[0, 1, 2].map((item) => (
                  <View
                    key={item}
                    style={[styles.strengthBar, item < strength.score ? styles.strongBar : styles.emptyBar]}
                  />
                ))}
                <View style={[styles.strengthBar, strength.score >= 3 ? styles.strongBar : styles.emptyBar]} />
              </View>
              <Text style={styles.caption}>En az 8 karakter, bir büyük harf ve bir sembol.</Text>

              <View style={styles.verificationCard}>
                <View style={styles.verificationIcon}>
                  <Icon name="message-check-outline" color={colors.primary} size={17} />
                </View>
                <View style={styles.verificationCopy}>
                  <Text style={styles.cardTitle}>Doğrulama adımı hazır</Text>
                  <Text style={styles.cardText}>
                    Kayıttan sonra telefonuna SMS veya e-postana tek kullanımlık kod
                    göndereceğiz.
                  </Text>
                </View>
              </View>

              {error && (
                <View style={styles.errorBox}>
                  <Icon name="alert-circle-outline" color={colors.destructive} size={17} />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              )}

              <Pressable
                style={styles.googleButton}
                onPress={handleGooglePress}
                disabled={googleSubmitting || (isGoogleSignInConfigured && !googleRequest)}
              >
                {googleSubmitting ? (
                  <ActivityIndicator size="small" color={colors.cardForeground} />
                ) : (
                  <FontAwesome5 name="google" size={17} color={colors.cardForeground} />
                )}
                <Text style={styles.googleText}>Google ile devam et</Text>
              </Pressable>
            </View>

            <View style={styles.loginRow}>
              <Text style={styles.loginText}>Zaten bir hesabın var mı?</Text>
              <Pressable onPress={() => navigation.navigate('Login')}>
                <Text style={styles.loginAction}>Giriş Yap</Text>
              </Pressable>
            </View>

            <Text style={styles.terms}>
              Kayıt olarak{' '}
              <Text style={styles.termLink}>KVKK Aydınlatma Metni</Text>,{' '}
              <Text style={styles.termLink}>Gizlilik Politikası</Text> ve{' '}
              <Text style={styles.termLink}>Topluluk İlkeleri</Text>'ni kabul edersin.
            </Text>
          </View>
        </ScrollView>

        <View style={styles.bottomAction}>
          <LinearGradient
            pointerEvents="none"
            colors={['transparent', colors.background]}
            style={StyleSheet.absoluteFill}
          />
          <Pressable style={[styles.createButton, submitting && styles.disabledButton]} onPress={handleSubmit} disabled={submitting}>
            {submitting ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : (
              <>
                <Text style={styles.createButtonText}>Kayıt Ol</Text>
                <Icon name="arrow-right" color={colors.primaryForeground} size={22} />
              </>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function FieldLabel({ text }: { text: string }) {
  return <Text style={styles.fieldLabel}>{text}</Text>;
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingBottom: 142,
  },
  hero: {
    height: 230,
    overflow: 'hidden',
  },
  heroImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  heroHeader: {
    position: 'absolute',
    top: 14,
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  roundButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    opacity: 0.9,
  },
  headerSpacer: {
    width: 44,
    height: 44,
  },
  brandPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.background,
    opacity: 0.92,
  },
  brandIcon: {
    width: 24,
    height: 24,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  brandText: {
    color: colors.foreground,
    fontFamily: fonts.heading,
    fontSize: 14,
    fontWeight: '700',
  },
  content: {
    marginTop: -31,
    paddingHorizontal: 20,
    zIndex: 1,
  },
  intro: {
    marginBottom: 23,
  },
  eyebrow: {
    color: colors.primary,
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2.4,
  },
  title: {
    marginTop: 8,
    color: colors.foreground,
    fontFamily: fonts.heading,
    fontSize: 34,
    lineHeight: 36,
    fontWeight: '700',
  },
  titleAccent: {
    color: colors.primary,
  },
  subtitle: {
    maxWidth: 320,
    marginTop: 12,
    color: colors.mutedForeground,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
  },
  form: {
    gap: 0,
  },
  fieldLabel: {
    marginBottom: 8,
    color: colors.mutedForeground,
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  inputShell: {
    minHeight: 55,
    marginBottom: 16,
    paddingHorizontal: 15,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.input,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  activeInput: {
    borderColor: colors.primary,
  },
  input: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 0,
    color: colors.foreground,
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: '600',
  },
  passwordInput: {
    letterSpacing: 1.5,
  },
  successText: {
    color: colors.success,
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: '800',
  },
  helperRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: -8,
    marginBottom: 16,
  },
  helperText: {
    flex: 1,
    color: colors.mutedForeground,
    fontFamily: fonts.body,
    fontSize: 11,
    lineHeight: 16,
  },
  passwordLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  strengthRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: -7,
  },
  strengthBar: {
    height: 4,
    flex: 1,
    borderRadius: 4,
  },
  strongBar: {
    backgroundColor: colors.success,
  },
  emptyBar: {
    backgroundColor: colors.muted,
  },
  caption: {
    marginTop: 8,
    marginBottom: 16,
    color: colors.mutedForeground,
    fontFamily: fonts.body,
    fontSize: 11,
  },
  verificationCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 16,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  verificationIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.muted,
  },
  verificationCopy: {
    flex: 1,
  },
  cardTitle: {
    color: colors.cardForeground,
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: '800',
  },
  cardText: {
    marginTop: 4,
    color: colors.mutedForeground,
    fontFamily: fonts.body,
    fontSize: 11,
    lineHeight: 16,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 16,
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
    lineHeight: 17,
  },
  googleButton: {
    minHeight: 55,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 9,
  },
  googleText: {
    color: colors.cardForeground,
    fontFamily: fonts.heading,
    fontSize: 14,
    fontWeight: '700',
  },
  loginRow: {
    marginTop: 24,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 5,
  },
  loginText: {
    color: colors.mutedForeground,
    fontFamily: fonts.body,
    fontSize: 14,
  },
  loginAction: {
    color: colors.primary,
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: '800',
  },
  terms: {
    marginTop: 27,
    paddingHorizontal: 8,
    color: colors.mutedForeground,
    fontFamily: fonts.body,
    fontSize: 10,
    lineHeight: 16,
    textAlign: 'center',
  },
  termLink: {
    color: colors.foreground,
    fontWeight: '800',
    textDecorationLine: 'underline',
    textDecorationColor: colors.primary,
  },
  bottomAction: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    left: 0,
    paddingHorizontal: 20,
    paddingTop: 32,
    paddingBottom: 22,
  },
  createButton: {
    minHeight: 58,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  disabledButton: {
    opacity: 0.7,
  },
  createButtonText: {
    color: colors.primaryForeground,
    fontFamily: fonts.heading,
    fontSize: 18,
    fontWeight: '800',
  },
});
