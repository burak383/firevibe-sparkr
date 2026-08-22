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
// `edges={['bottom']}` (see below) intentionally excludes the top edge so
// the full-bleed hero image can still bleed under the status bar, matching
// the same pattern KayTOl.tsx (Register) already uses; only the bottom -
// where the form and submit button live - needs to clear the home
// indicator.
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, fonts } from '../theme';
import { useAuth } from '../context/AuthContext';
import { api, ApiError } from '../api/client';
import { extractGoogleIdToken, isGoogleSignInConfigured, useGoogleAuthRequest } from '../utils/googleAuth';
import { isFacebookSignInConfigured, promptFacebookLogin } from '../utils/facebookAuth';
import type { RootStackParamList } from '../navigation/RootNavigator';

export default function LoginScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { login, loginWithSms, loginWithGoogle, loginWithFacebook } = useAuth();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const [facebookSubmitting, setFacebookSubmitting] = useState(false);

  const [googleRequest, googleResponse, promptGoogleAsync] = useGoogleAuthRequest();

  useEffect(() => {
    const idToken = extractGoogleIdToken(googleResponse);
    if (!idToken) return;
    (async () => {
      setGoogleSubmitting(true);
      try {
        await loginWithGoogle(idToken);
        // RootNavigator swaps the stack automatically once `user` is set.
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Google ile giriş yapılamadı.');
      } finally {
        setGoogleSubmitting(false);
      }
    })();
  }, [googleResponse, loginWithGoogle]);

  const handleGooglePress = () => {
    if (!isGoogleSignInConfigured) {
      Alert.alert(
        'Google ile giriş yapılandırılmamış',
        'Bunu etkinleştirmek için mobile/.env dosyasına EXPO_PUBLIC_GOOGLE_*_CLIENT_ID değerlerini, backend/.env dosyasına da GOOGLE_CLIENT_ID değerini eklemen gerekiyor. Google Cloud Console\'da bir OAuth istemci kimliği oluşturman yeterli - adımlar için .env.example dosyalarındaki notlara bak.'
      );
      return;
    }
    promptGoogleAsync();
  };

  const handleFacebookPress = async () => {
    if (!isFacebookSignInConfigured) {
      Alert.alert(
        'Facebook ile giriş yapılandırılmamış',
        'Bunu etkinleştirmek için mobile/.env dosyasına EXPO_PUBLIC_FACEBOOK_APP_ID değerini, backend/.env dosyasına da FACEBOOK_APP_ID ve FACEBOOK_APP_SECRET değerlerini eklemen gerekiyor. developers.facebook.com/apps üzerinde bir uygulama oluşturman yeterli - adımlar için .env.example dosyalarındaki notlara bak.'
      );
      return;
    }
    setFacebookSubmitting(true);
    try {
      const result = await promptFacebookLogin();
      if (!result) return; // cancelled, denied, or something went wrong
      await loginWithFacebook(result.code, result.redirectUri);
      // RootNavigator swaps the stack automatically once `user` is set.
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Facebook ile giriş yapılamadı.');
    } finally {
      setFacebookSubmitting(false);
    }
  };

  const [smsModalOpen, setSmsModalOpen] = useState(false);
  const [smsStep, setSmsStep] = useState<'phone' | 'code'>('phone');
  const [smsPhone, setSmsPhone] = useState('');
  const [smsCode, setSmsCode] = useState('');
  const [smsSubmitting, setSmsSubmitting] = useState(false);
  const [smsError, setSmsError] = useState<string | null>(null);
  const [smsDevCode, setSmsDevCode] = useState<string | null>(null);

  const openSmsLogin = () => {
    setSmsModalOpen(true);
    setSmsStep('phone');
    setSmsPhone(identifier.includes('@') ? '' : identifier);
    setSmsCode('');
    setSmsError(null);
    setSmsDevCode(null);
  };

  const requestSmsCode = async () => {
    if (!smsPhone.trim()) {
      setSmsError('Telefon numaranı gir.');
      return;
    }
    setSmsError(null);
    setSmsSubmitting(true);
    try {
      const res = await api.requestSmsCode(smsPhone.trim());
      setSmsDevCode(res.devCode ?? null);
      setSmsStep('code');
    } catch (err) {
      setSmsError(err instanceof ApiError ? err.message : 'Kod gönderilemedi, tekrar dene.');
    } finally {
      setSmsSubmitting(false);
    }
  };

  const verifySmsAndLogin = async () => {
    if (!smsCode.trim()) {
      setSmsError('Doğrulama kodunu gir.');
      return;
    }
    setSmsError(null);
    setSmsSubmitting(true);
    try {
      await loginWithSms(smsPhone.trim(), smsCode.trim());
      setSmsModalOpen(false);
      // RootNavigator swaps the stack automatically once `user` is set.
    } catch (err) {
      setSmsError(err instanceof ApiError ? err.message : 'Kod doğrulanamadı, tekrar dene.');
    } finally {
      setSmsSubmitting(false);
    }
  };

  const canGoBack = navigation.canGoBack();

  const handleSubmit = async () => {
    if (!identifier.trim() || !password) {
      setError('Telefon/e-posta ve şifreni gir.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await login(identifier.trim(), password);
      // RootNavigator swaps the stack automatically once `user` is set.
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Giriş yapılamadı. Tekrar dene.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <Image
            source={{
              uri: 'https://fwtngjyirchhhysukjxi.supabase.co/storage/v1/object/public/project-images/ed3e8af0-715b-43d1-9198-05dbe4ffa7eb/dfb365a9-ae1b-4811-b7be-22006a25c53c.png',
            }}
            accessibilityLabel="Turuncu ve menekşe neon alev atmosferi"
            resizeMode="cover"
            style={StyleSheet.absoluteFill}
          />

          <View style={[StyleSheet.absoluteFill, styles.heroShade]} />
          <View style={styles.heroBottomFade} />

          <View style={styles.heroContent}>
            {canGoBack ? (
              <Pressable
                accessibilityLabel="Geri dön"
                style={styles.backButton}
                hitSlop={8}
                onPress={() => navigation.goBack()}
              >
                <Ionicons name="arrow-back" size={22} color={colors.cardForeground} />
              </Pressable>
            ) : (
              <View style={styles.backButton} />
            )}

            <View style={styles.brandRow}>
              <View style={styles.brandIcon}>
                <Ionicons name="flame" size={29} color={colors.primaryForeground} />
              </View>

              <View>
                <Text style={styles.brandName}>SparkR</Text>
                <Text style={styles.brandTagline}>GECE SENİNLE BAŞLAR</Text>
              </View>
            </View>

            <Text style={styles.heroTitle}>
              Tekrar hoş geldin.{'\n'}
              <Text style={styles.primaryText}>Kıvılcım bekliyor.</Text>
            </Text>
          </View>
        </View>

        <View style={styles.main}>
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View>
                <Text style={styles.eyebrow}>SPARKR HESABIN</Text>
                <Text style={styles.sectionTitle}>Giriş yap</Text>
              </View>

              <View style={styles.readyBadge}>
                <View style={styles.readyDot} />
                <Text style={styles.readyText}>Hazır</Text>
              </View>
            </View>

            <View style={styles.form}>
              <View>
                <Text style={styles.label}>TELEFON VEYA E-POSTA</Text>
                <View style={[styles.inputWrapper, focusedField === 'identifier' && styles.inputFocused]}>
                  <Ionicons name="at" size={20} color={colors.mutedForeground} style={styles.inputIcon} />
                  <TextInput
                    value={identifier}
                    onChangeText={setIdentifier}
                    placeholder="telefonun veya e-postan"
                    placeholderTextColor={colors.mutedForeground}
                    style={styles.input}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    onFocus={() => setFocusedField('identifier')}
                    onBlur={() => setFocusedField(null)}
                  />
                </View>

                <View style={styles.helperRow}>
                  <Ionicons name="sparkles" size={14} color={colors.secondary} />
                  <Text style={styles.helperText}>Vibe’ına kaldığın yerden devam et.</Text>
                </View>
              </View>

              <View>
                <View style={styles.labelRow}>
                  <Text style={styles.label}>ŞİFRE</Text>
                  <Pressable onPress={() => navigation.navigate('ForgotPassword')} hitSlop={8}>
                    <Text style={styles.forgotPassword}>Şifremi unuttum</Text>
                  </Pressable>
                </View>

                <View style={[styles.inputWrapper, focusedField === 'password' && styles.inputFocused]}>
                  <Ionicons name="lock-closed-outline" size={19} color={colors.mutedForeground} style={styles.inputIcon} />
                  <TextInput
                    value={password}
                    onChangeText={setPassword}
                    placeholder="şifreni yaz"
                    placeholderTextColor={colors.mutedForeground}
                    style={[styles.input, styles.passwordInput]}
                    secureTextEntry={!showPassword}
                    onFocus={() => setFocusedField('password')}
                    onBlur={() => setFocusedField(null)}
                    onSubmitEditing={handleSubmit}
                  />
                  <Pressable
                    accessibilityLabel="Şifreyi göster"
                    onPress={() => setShowPassword((visible) => !visible)}
                    style={styles.visibilityButton}
                  >
                    <Ionicons
                      name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                      size={20}
                      color={colors.mutedForeground}
                    />
                  </Pressable>
                </View>

                <Text style={styles.helperText}>Şifren en az 8 karakterden oluşmalı.</Text>
              </View>

              <View style={styles.securityNotice}>
                <Ionicons name="shield-checkmark" size={19} color={colors.success} />
                <Text style={styles.securityText}>
                  Giriş bilgilerin şifrelenir ve güvenle saklanır. SparkR’da kontrol her zaman sende.
                </Text>
              </View>

              {error ? (
                <View style={styles.errorBox}>
                  <Ionicons name="alert-circle" size={16} color={colors.destructive} />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : (
                <View style={styles.statusBar}>
                  <View style={styles.statusDot} />
                  <Text style={styles.statusText}>Giriş durumu: Bilgilerini bekliyor</Text>
                </View>
              )}

              <Pressable
                style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
                onPress={handleSubmit}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color={colors.primaryForeground} />
                ) : (
                  <>
                    <Ionicons name="flame" size={21} color={colors.primaryForeground} />
                    <Text style={styles.submitText}>Giriş Yap</Text>
                    <Ionicons name="arrow-forward" size={20} color={colors.primaryForeground} />
                  </>
                )}
              </Pressable>
            </View>

            <View style={styles.dividerRow}>
              <View style={styles.divider} />
              <Text style={styles.orText}>VEYA</Text>
              <View style={styles.divider} />
            </View>

            <View style={styles.socialButtons}>
              <Pressable
                style={styles.googleButton}
                onPress={handleGooglePress}
                disabled={googleSubmitting || (isGoogleSignInConfigured && !googleRequest)}
              >
                {googleSubmitting ? (
                  <ActivityIndicator size="small" color={colors.cardForeground} />
                ) : (
                  <MaterialCommunityIcons name="google" size={19} color={colors.cardForeground} />
                )}
                <Text style={styles.socialText}>Google ile devam et</Text>
              </Pressable>

              <Pressable
                style={styles.facebookButton}
                onPress={handleFacebookPress}
                disabled={facebookSubmitting}
              >
                {facebookSubmitting ? (
                  <ActivityIndicator size="small" color={colors.cardForeground} />
                ) : (
                  <MaterialCommunityIcons name="facebook" size={19} color={colors.cardForeground} />
                )}
                <Text style={styles.socialText}>Facebook ile devam et</Text>
              </Pressable>

              <Pressable style={styles.smsButton} onPress={openSmsLogin}>
                <Ionicons name="chatbubble-ellipses-outline" size={20} color={colors.secondary} />
                <Text style={styles.socialText}>SMS koduyla giriş yap</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.createAccount}>
            <Text style={styles.mutedText}>Henüz hesabın yok mu?</Text>
            <Pressable style={styles.createButton} onPress={() => navigation.navigate('Register')}>
              <Text style={styles.createText}>Hesap oluştur</Text>
              <Ionicons name="arrow-up-outline" size={18} color={colors.primary} />
            </Pressable>
          </View>

          <Text style={styles.legalText}>
            Giriş yaparak Topluluk İlkeleri’ni ve Gizlilik Politikası’nı kabul etmiş olursun.
          </Text>
        </View>
      </ScrollView>

      <Modal visible={smsModalOpen} transparent animationType="fade" onRequestClose={() => setSmsModalOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.smsBackdrop}>
          <View style={styles.smsCard}>
            <Text style={styles.smsTitle}>SMS koduyla giriş</Text>

            {smsStep === 'phone' ? (
              <>
                <Text style={styles.label}>TELEFON NUMARAN</Text>
                <TextInput
                  value={smsPhone}
                  onChangeText={setSmsPhone}
                  keyboardType="phone-pad"
                  placeholder="+90 555 000 00 00"
                  placeholderTextColor={colors.mutedForeground}
                  style={styles.smsInput}
                  autoFocus
                />
                <Text style={styles.helperText}>
                  Sadece daha önce SparkR’a bu numarayla kayıt olduysan giriş yapabilirsin.
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.label}>DOĞRULAMA KODU</Text>
                <TextInput
                  value={smsCode}
                  onChangeText={setSmsCode}
                  keyboardType="number-pad"
                  placeholder="6 haneli kod"
                  placeholderTextColor={colors.mutedForeground}
                  style={styles.smsInput}
                  maxLength={6}
                  autoFocus
                />
                {smsDevCode ? (
                  <Text style={styles.smsDevHint}>
                    Bu demoda gerçek SMS gönderilmiyor - kodun: {smsDevCode}
                  </Text>
                ) : null}
              </>
            )}

            {smsError ? <Text style={styles.smsErrorText}>{smsError}</Text> : null}

            <View style={styles.smsActions}>
              <Pressable style={styles.smsCancelButton} onPress={() => setSmsModalOpen(false)}>
                <Text style={styles.smsCancelText}>Vazgeç</Text>
              </Pressable>
              <Pressable
                style={styles.smsSubmitButton}
                onPress={smsStep === 'phone' ? requestSmsCode : verifySmsAndLogin}
                disabled={smsSubmitting}
              >
                {smsSubmitting ? (
                  <ActivityIndicator color={colors.primaryForeground} />
                ) : (
                  <Text style={styles.smsSubmitText}>
                    {smsStep === 'phone' ? 'Kod gönder' : 'Doğrula ve giriş yap'}
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingBottom: 28,
  },
  hero: {
    height: 268,
    overflow: 'hidden',
    position: 'relative',
  },
  heroShade: {
    backgroundColor: colors.background,
    opacity: 0.38,
  },
  heroBottomFade: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    left: 0,
    height: 145,
    backgroundColor: colors.background,
    opacity: 0.78,
  },
  heroContent: {
    paddingHorizontal: 20,
    paddingTop: 48,
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    opacity: 0.9,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 28,
  },
  brandIcon: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: colors.primary,
  },
  brandName: {
    color: colors.foreground,
    fontFamily: fonts.heading,
    fontSize: 20,
    fontWeight: '700',
  },
  brandTagline: {
    marginTop: 2,
    color: colors.primary,
    fontFamily: fonts.body,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  heroTitle: {
    marginTop: 18,
    color: colors.foreground,
    fontFamily: fonts.heading,
    fontSize: 32,
    fontWeight: '700',
    lineHeight: 34,
  },
  primaryText: {
    color: colors.primary,
  },
  main: {
    paddingHorizontal: 20,
  },
  card: {
    marginTop: 0,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    backgroundColor: colors.card,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  eyebrow: {
    color: colors.mutedForeground,
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  sectionTitle: {
    marginTop: 4,
    color: colors.foreground,
    fontFamily: fonts.heading,
    fontSize: 21,
    fontWeight: '700',
  },
  readyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.success,
    borderRadius: 20,
    backgroundColor: colors.muted,
  },
  readyDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.success,
  },
  readyText: {
    color: colors.success,
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: '800',
  },
  form: {
    gap: 16,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  label: {
    marginBottom: 8,
    color: colors.mutedForeground,
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  inputWrapper: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    backgroundColor: colors.input,
  },
  inputFocused: {
    borderColor: colors.primary,
  },
  inputIcon: {
    marginLeft: 15,
  },
  input: {
    flex: 1,
    height: '100%',
    paddingHorizontal: 12,
    color: colors.foreground,
    fontFamily: fonts.body,
    fontSize: 14,
  },
  passwordInput: {
    paddingRight: 4,
  },
  visibilityButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 3,
  },
  helperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  helperText: {
    color: colors.mutedForeground,
    fontFamily: fonts.body,
    fontSize: 11,
  },
  forgotPassword: {
    color: colors.primary,
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: '800',
  },
  securityNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    backgroundColor: colors.background,
  },
  securityText: {
    flex: 1,
    color: colors.mutedForeground,
    fontFamily: fonts.body,
    fontSize: 11,
    lineHeight: 16,
  },
  statusBar: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: colors.muted,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  statusText: {
    color: colors.mutedForeground,
    fontFamily: fonts.body,
    fontSize: 12,
  },
  errorBox: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.destructive,
    backgroundColor: colors.muted,
  },
  errorText: {
    flex: 1,
    color: colors.destructive,
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: '700',
  },
  submitButton: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 20,
    backgroundColor: colors.primary,
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitText: {
    color: colors.primaryForeground,
    fontFamily: fonts.heading,
    fontSize: 16,
    fontWeight: '700',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 20,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  orText: {
    color: colors.mutedForeground,
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  socialButtons: {
    gap: 12,
  },
  googleButton: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    backgroundColor: colors.background,
  },
  facebookButton: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    backgroundColor: colors.background,
  },
  smsButton: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: colors.secondary,
    borderRadius: 20,
    backgroundColor: colors.muted,
  },
  socialText: {
    color: colors.cardForeground,
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: '700',
  },
  createAccount: {
    alignItems: 'center',
    marginTop: 24,
  },
  mutedText: {
    color: colors.mutedForeground,
    fontFamily: fonts.body,
    fontSize: 14,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  createText: {
    color: colors.primary,
    fontFamily: fonts.heading,
    fontSize: 16,
    fontWeight: '700',
  },
  legalText: {
    maxWidth: 300,
    alignSelf: 'center',
    marginTop: 24,
    color: colors.mutedForeground,
    fontFamily: fonts.body,
    fontSize: 10,
    lineHeight: 16,
    textAlign: 'center',
  },
  smsBackdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  smsCard: {
    width: '100%',
    maxWidth: 360,
    padding: 20,
    borderRadius: 22,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  smsTitle: {
    color: colors.foreground,
    fontFamily: fonts.heading,
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 16,
  },
  smsInput: {
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
    marginTop: 8,
  },
  smsDevHint: {
    marginTop: 10,
    color: colors.secondary,
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: '700',
  },
  smsErrorText: {
    marginTop: 12,
    color: colors.destructive,
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: '700',
  },
  smsActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  smsCancelButton: {
    flex: 1,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: colors.muted,
  },
  smsCancelText: {
    color: colors.mutedForeground,
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: '800',
  },
  smsSubmitButton: {
    flex: 1,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: colors.primary,
  },
  smsSubmitText: {
    color: colors.primaryForeground,
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: '800',
  },
});
