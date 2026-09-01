import React, { useState } from 'react';
import {
  ActivityIndicator,
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
// `edges={['bottom']}` (see below) intentionally excludes the top edge so
// the full-bleed hero image can still bleed under the status bar.
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, fonts } from '../theme';
import { useAuth } from '../context/AuthContext';
import { api, ApiError } from '../api/client';
import type { RootStackParamList } from '../navigation/RootNavigator';

// Phone + SMS is the only sign-in method now (Google, Facebook and the old
// e-posta/şifre form were removed) - one screen handles both login AND
// first-time signup, since there's no meaningful difference between them
// from here: /api/auth/sms/verify (backend) creates a brand-new account the
// first time a number ever verifies successfully, and just logs a returning
// number in otherwise. See backend/src/routes/auth.js for that logic, and
// VibeKurulumu.tsx for how a fresh account fills in its missing name/birth
// date afterwards.
export default function LoginScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { loginWithSms } = useAuth();

  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);

  const canGoBack = navigation.canGoBack();

  const requestCode = async () => {
    if (!phone.trim()) {
      setError('Telefon numaranı gir.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await api.requestSmsCode(phone.trim());
      setDevCode(res.devCode ?? null);
      setStep('code');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Kod gönderilemedi, tekrar dene.');
    } finally {
      setSubmitting(false);
    }
  };

  const verifyAndContinue = async () => {
    if (!code.trim()) {
      setError('Doğrulama kodunu gir.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await loginWithSms(phone.trim(), code.trim());
      // RootNavigator swaps the stack automatically once `user` is set -
      // straight to Vibe Kurulumu for a brand-new number, straight to the
      // deck for a returning one.
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Kod doğrulanamadı, tekrar dene.');
    } finally {
      setSubmitting(false);
    }
  };

  const changeNumber = () => {
    setStep('phone');
    setCode('');
    setDevCode(null);
    setError(null);
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
                Hoş geldin.{'\n'}
                <Text style={styles.primaryText}>Kıvılcım bekliyor.</Text>
              </Text>
            </View>
          </View>

          <View style={styles.main}>
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View>
                  <Text style={styles.eyebrow}>SPARKR HESABIN</Text>
                  <Text style={styles.sectionTitle}>
                    {step === 'phone' ? 'Telefon numaranla devam et' : 'Kodu gir'}
                  </Text>
                </View>

                <View style={styles.readyBadge}>
                  <View style={styles.readyDot} />
                  <Text style={styles.readyText}>Hazır</Text>
                </View>
              </View>

              <View style={styles.form}>
                {step === 'phone' ? (
                  <View>
                    <Text style={styles.label}>TELEFON NUMARAN</Text>
                    <View style={[styles.inputWrapper, styles.inputFocused]}>
                      <Ionicons
                        name="call-outline"
                        size={19}
                        color={colors.mutedForeground}
                        style={styles.inputIcon}
                      />
                      <TextInput
                        value={phone}
                        onChangeText={setPhone}
                        placeholder="+90 555 000 00 00"
                        placeholderTextColor={colors.mutedForeground}
                        style={styles.input}
                        keyboardType="phone-pad"
                        autoFocus
                        onSubmitEditing={requestCode}
                      />
                    </View>

                    <View style={styles.helperRow}>
                      <Ionicons name="sparkles" size={14} color={colors.secondary} />
                      <Text style={styles.helperText}>
                        Yeni bir numaraysa senin için otomatik hesap açarız, kayıtlıysan direkt girersin.
                      </Text>
                    </View>
                  </View>
                ) : (
                  <View>
                    <View style={styles.labelRow}>
                      <Text style={styles.label}>DOĞRULAMA KODU</Text>
                      <Pressable onPress={changeNumber} hitSlop={8}>
                        <Text style={styles.changeNumber}>Numarayı değiştir</Text>
                      </Pressable>
                    </View>
                    <View style={[styles.inputWrapper, styles.inputFocused]}>
                      <Ionicons
                        name="keypad-outline"
                        size={19}
                        color={colors.mutedForeground}
                        style={styles.inputIcon}
                      />
                      <TextInput
                        value={code}
                        onChangeText={setCode}
                        placeholder="6 haneli kod"
                        placeholderTextColor={colors.mutedForeground}
                        style={styles.input}
                        keyboardType="number-pad"
                        maxLength={6}
                        autoFocus
                        onSubmitEditing={verifyAndContinue}
                      />
                    </View>
                    <Text style={styles.helperText}>{phone}</Text>
                    {devCode ? (
                      <Text style={styles.devHint}>Bu demoda gerçek SMS gönderilmiyor - kodun: {devCode}</Text>
                    ) : null}
                  </View>
                )}

                <View style={styles.securityNotice}>
                  <Ionicons name="shield-checkmark" size={19} color={colors.success} />
                  <Text style={styles.securityText}>
                    Telefon numaran sadece giriş için kullanılır, profilinde asla görünmez.
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
                    <Text style={styles.statusText}>
                      {step === 'phone' ? 'Giriş durumu: Numaranı bekliyor' : 'Giriş durumu: Kodu bekliyor'}
                    </Text>
                  </View>
                )}

                <Pressable
                  style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
                  onPress={step === 'phone' ? requestCode : verifyAndContinue}
                  disabled={submitting}
                >
                  {submitting ? (
                    <ActivityIndicator color={colors.primaryForeground} />
                  ) : (
                    <>
                      <Ionicons name="flame" size={21} color={colors.primaryForeground} />
                      <Text style={styles.submitText}>
                        {step === 'phone' ? 'Kod Gönder' : 'Doğrula ve Devam Et'}
                      </Text>
                      <Ionicons name="arrow-forward" size={20} color={colors.primaryForeground} />
                    </>
                  )}
                </Pressable>
              </View>
            </View>

            <Text style={styles.legalText}>
              Devam ederek Topluluk İlkeleri’ni ve Gizlilik Politikası’nı kabul etmiş olursun.
            </Text>
          </View>
        </ScrollView>
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
  changeNumber: {
    color: colors.primary,
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: '800',
  },
  devHint: {
    marginTop: 8,
    color: colors.secondary,
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: '700',
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
});
