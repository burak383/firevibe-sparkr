import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme, withAlpha } from '../theme';
import { api, ApiError } from '../api/client';
import type { RootStackParamList } from '../navigation/RootNavigator';

const { colors, fonts } = theme;
const cornerRadius = parseInt(theme.radius, 10);

export default function PasswordResetScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [method, setMethod] = useState<'email' | 'phone'>('email');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [devToken, setDevToken] = useState<string | null>(null);

  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetDone, setResetDone] = useState(false);

  const handleSubmit = async () => {
    if (!email.trim()) {
      setError(method === 'email' ? 'E-posta adresini gir.' : 'Telefon numaranı gir.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const result = await api.forgotPassword(email.trim());
      setSent(result.message);
      // This demo has no real e-mail/SMS provider wired up, so the backend
      // returns the reset token directly (see backend/src/routes/auth.js) -
      // prefill it so the flow is actually completable end-to-end in the app.
      setDevToken(result.devResetToken ?? null);
      setResetToken(result.devResetToken ?? '');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Bağlantı gönderilemedi. Tekrar dene.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetPassword = async () => {
    if (!resetToken.trim()) {
      setResetError('Sıfırlama kodunu gir.');
      return;
    }
    if (newPassword.length < 8) {
      setResetError('Yeni şifren en az 8 karakter, bir büyük harf ve bir sembol içermeli.');
      return;
    }
    setResetError(null);
    setResetting(true);
    try {
      await api.resetPassword(resetToken.trim(), newPassword);
      setResetDone(true);
    } catch (err) {
      setResetError(err instanceof ApiError ? err.message : 'Şifre sıfırlanamadı. Tekrar dene.');
    } finally {
      setResetting(false);
    }
  };

  return (
    <View style={styles.screen}>
      <Image
        source={{
          uri: 'https://fwtngjyirchhhysukjxi.supabase.co/storage/v1/object/public/project-images/ed3e8af0-715b-43d1-9198-05dbe4ffa7eb/55f5aec8-c03e-4e64-bc3f-be01da6855e9.png',
        }}
        resizeMode="cover"
        style={styles.backgroundImage}
      />

      <LinearGradient
        pointerEvents="none"
        colors={[withAlpha(colors.background, 0.5), withAlpha(colors.background, 0.93), colors.background]}
        locations={[0, 0.42, 1]}
        style={styles.backgroundOverlay}
      />

      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.header}>
              <Pressable
                accessibilityLabel="Geri dön"
                style={styles.iconButton}
                onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Login'))}
              >
                <Ionicons name="arrow-back" size={22} color={colors.cardForeground} />
              </Pressable>

              <View style={styles.brandPill}>
                <View style={styles.brandIcon}>
                  <MaterialCommunityIcons name="fire" size={16} color={colors.primaryForeground} />
                </View>
                <Text style={styles.brandName}>SparkR</Text>
              </View>

              <View style={styles.headerSpacer} />
            </View>

            <View style={styles.intro}>
              <Text style={styles.eyebrow}>HESAP ERİŞİMİ</Text>
              <Text style={styles.title}>
                Şifreni yenile,{'\n'}
                <Text style={styles.titleAccent}>vibe’ına devam et.</Text>
              </Text>
              <Text style={styles.description}>
                Telefon numaranı ya da e-posta adresini bırak. Sana güvenli bir sıfırlama bağlantısı gönderelim.
              </Text>
            </View>

            <View style={styles.formCard}>
              <View style={styles.segmentedControl}>
                <Pressable
                  onPress={() => setMethod('email')}
                  style={[styles.segment, method === 'email' && styles.activeSegment]}
                >
                  <Text
                    style={[
                      styles.segmentLabel,
                      method === 'email' ? styles.activeSegmentLabel : styles.inactiveSegmentLabel,
                    ]}
                  >
                    E-posta
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => setMethod('phone')}
                  style={[styles.segment, method === 'phone' && styles.activeSegment]}
                >
                  <Text
                    style={[
                      styles.segmentLabel,
                      method === 'phone' ? styles.activeSegmentLabel : styles.inactiveSegmentLabel,
                    ]}
                  >
                    Telefon
                  </Text>
                </Pressable>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>{method === 'email' ? 'E-POSTA ADRESİN' : 'TELEFON NUMARAN'}</Text>

                <View style={styles.inputContainer}>
                  <Ionicons name={method === 'email' ? 'mail-outline' : 'call-outline'} size={20} color={colors.secondary} />
                  <TextInput
                    value={email}
                    onChangeText={setEmail}
                    keyboardType={method === 'email' ? 'email-address' : 'phone-pad'}
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholder={method === 'email' ? 'ornek@mail.com' : '+90 555 000 00 00'}
                    placeholderTextColor={colors.mutedForeground}
                    style={styles.input}
                  />
                </View>

                <View style={styles.helperRow}>
                  <Ionicons name="lock-closed-outline" size={14} color={colors.success} />
                  <Text style={styles.helperText}>Bilgilerin yalnızca hesabını doğrulamak için kullanılır.</Text>
                </View>
              </View>

              {error && (
                <View style={styles.errorNotice}>
                  <Ionicons name="alert-circle-outline" size={16} color={colors.destructive} />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              )}

              {sent ? (
                <View style={styles.successNotice}>
                  <Ionicons name="checkmark-circle-outline" size={18} color={colors.success} />
                  <Text style={styles.successText}>{sent}</Text>
                </View>
              ) : (
                <Pressable
                  style={[styles.primaryButton, submitting && styles.disabledButton]}
                  onPress={handleSubmit}
                  disabled={submitting}
                >
                  {submitting ? (
                    <ActivityIndicator color={colors.primaryForeground} />
                  ) : (
                    <>
                      <Text style={styles.primaryButtonText}>Sıfırlama bağlantısı gönder</Text>
                      <Ionicons name="arrow-up-outline" size={19} color={colors.primaryForeground} />
                    </>
                  )}
                </Pressable>
              )}

              {!sent && (
                <View style={styles.notice}>
                  <View style={styles.noticeIcon}>
                    <Ionicons name="send-outline" size={16} color={colors.secondary} />
                  </View>
                  <Text style={styles.noticeText}>
                    Bağlantı birkaç dakika içinde ulaşmazsa spam klasörünü de kontrol etmeyi unutma.
                  </Text>
                </View>
              )}

              {sent && !resetDone && (
                <View style={styles.resetSection}>
                  <Text style={styles.fieldLabel}>SIFIRLAMA KODU</Text>
                  <View style={styles.inputContainer}>
                    <Ionicons name="key-outline" size={20} color={colors.secondary} />
                    <TextInput
                      value={resetToken}
                      onChangeText={setResetToken}
                      autoCapitalize="none"
                      autoCorrect={false}
                      placeholder="Sıfırlama kodun"
                      placeholderTextColor={colors.mutedForeground}
                      style={styles.input}
                    />
                  </View>

                  <Text style={[styles.fieldLabel, styles.secondFieldLabel]}>YENİ ŞİFREN</Text>
                  <View style={styles.inputContainer}>
                    <Ionicons name="lock-closed-outline" size={20} color={colors.secondary} />
                    <TextInput
                      value={newPassword}
                      onChangeText={setNewPassword}
                      secureTextEntry
                      placeholder="En az 8 karakter, 1 büyük harf, 1 sembol"
                      placeholderTextColor={colors.mutedForeground}
                      style={styles.input}
                    />
                  </View>

                  {devToken ? (
                    <Text style={styles.devHint}>
                      Bu demoda gerçek e-posta/SMS gönderilmiyor - kodun otomatik dolduruldu.
                    </Text>
                  ) : null}

                  {resetError && (
                    <View style={styles.errorNotice}>
                      <Ionicons name="alert-circle-outline" size={16} color={colors.destructive} />
                      <Text style={styles.errorText}>{resetError}</Text>
                    </View>
                  )}

                  <Pressable
                    style={[styles.primaryButton, resetting && styles.disabledButton]}
                    onPress={handleResetPassword}
                    disabled={resetting}
                  >
                    {resetting ? (
                      <ActivityIndicator color={colors.primaryForeground} />
                    ) : (
                      <>
                        <Text style={styles.primaryButtonText}>Şifreni güncelle</Text>
                        <Ionicons name="checkmark" size={19} color={colors.primaryForeground} />
                      </>
                    )}
                  </Pressable>
                </View>
              )}

              {resetDone && (
                <View style={styles.successNotice}>
                  <Ionicons name="checkmark-circle-outline" size={18} color={colors.success} />
                  <Text style={styles.successText}>Şifren güncellendi. Şimdi yeni şifrenle giriş yapabilirsin.</Text>
                </View>
              )}
            </View>

            <View style={styles.securityCard}>
              <View style={styles.securityIcon}>
                <Ionicons name="shield-checkmark-outline" size={20} color={colors.primary} />
              </View>
              <View style={styles.securityCopy}>
                <Text style={styles.securityTitle}>Hesabın güvende</Text>
                <Text style={styles.securityDescription}>
                  SparkR şifreni asla istemez. Gelen bağlantıyı yalnızca uygulama içinde aç.
                </Text>
              </View>
            </View>

            <View style={styles.loginPrompt}>
              <Text style={styles.loginPromptText}>Şifreni hatırladın mı?</Text>
              <Pressable style={styles.loginButton} onPress={() => navigation.navigate('Login')}>
                <Text style={styles.loginButtonText}>Giriş ekranına dön</Text>
                <Ionicons name="arrow-forward" size={16} color={colors.primary} />
              </Pressable>
            </View>

            <View style={styles.supportRow}>
              <Ionicons name="life-buoy-outline" size={15} color={colors.secondary} />
              <Text style={styles.supportText}>
                Bir şey ters giderse <Text style={styles.supportEmphasis}>Destek ekibimiz</Text> burada.
              </Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      <LinearGradient
        pointerEvents="box-none"
        colors={[withAlpha(colors.background, 0), withAlpha(colors.background, 0.9), colors.background]}
        style={styles.bottomFade}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  backgroundImage: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.45,
  },
  backgroundOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  bottomFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 80,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 128,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 22,
    backgroundColor: withAlpha(colors.card, 0.85),
    shadowColor: colors.background,
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  headerSpacer: {
    width: 44,
  },
  brandPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    backgroundColor: withAlpha(colors.card, 0.75),
  },
  brandIcon: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: colors.primary,
  },
  brandName: {
    color: colors.cardForeground,
    fontFamily: fonts.heading,
    fontSize: 14,
    fontWeight: '700',
  },
  intro: {
    marginTop: 48,
    maxWidth: 340,
  },
  eyebrow: {
    color: colors.primary,
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2.4,
  },
  title: {
    marginTop: 12,
    color: colors.foreground,
    fontFamily: fonts.heading,
    fontSize: 34,
    fontWeight: '700',
    lineHeight: 37,
    letterSpacing: -1.35,
  },
  titleAccent: {
    color: colors.primary,
  },
  description: {
    marginTop: 16,
    color: colors.mutedForeground,
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 24,
  },
  formCard: {
    marginTop: 32,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: cornerRadius,
    backgroundColor: withAlpha(colors.card, 0.95),
    shadowColor: colors.background,
    shadowOpacity: 0.5,
    shadowRadius: 25,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  segmentedControl: {
    flexDirection: 'row',
    padding: 4,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    backgroundColor: colors.background,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 12,
  },
  activeSegment: {
    backgroundColor: colors.secondary,
  },
  segmentLabel: {
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: '700',
  },
  activeSegmentLabel: {
    color: colors.secondaryForeground,
  },
  inactiveSegmentLabel: {
    color: colors.mutedForeground,
  },
  fieldGroup: {
    marginTop: 24,
  },
  fieldLabel: {
    color: colors.mutedForeground,
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.7,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    backgroundColor: colors.input,
  },
  input: {
    flex: 1,
    minWidth: 0,
    padding: 0,
    color: colors.foreground,
    fontFamily: fonts.body,
    fontSize: 15,
  },
  helperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  helperText: {
    flex: 1,
    color: colors.mutedForeground,
    fontFamily: fonts.body,
    fontSize: 12,
  },
  errorNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 20,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.destructive,
    backgroundColor: colors.background,
  },
  errorText: {
    flex: 1,
    color: colors.destructive,
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
  },
  successNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 20,
    padding: 16,
    borderRadius: cornerRadius,
    borderWidth: 1,
    borderColor: colors.success,
    backgroundColor: withAlpha(colors.success, 0.12),
  },
  successText: {
    flex: 1,
    color: colors.foreground,
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 19,
  },
  resetSection: {
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  secondFieldLabel: {
    marginTop: 16,
  },
  devHint: {
    marginTop: 10,
    color: colors.secondary,
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: '700',
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 24,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderRadius: cornerRadius,
    backgroundColor: colors.primary,
    shadowColor: colors.primary,
    shadowOpacity: 0.3,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  disabledButton: {
    opacity: 0.7,
  },
  primaryButtonText: {
    color: colors.primaryForeground,
    fontFamily: fonts.heading,
    fontSize: 15,
    fontWeight: '700',
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginTop: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: withAlpha(colors.secondary, 0.25),
    borderRadius: 16,
    backgroundColor: withAlpha(colors.secondary, 0.1),
  },
  noticeIcon: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: withAlpha(colors.secondary, 0.2),
  },
  noticeText: {
    flex: 1,
    color: colors.mutedForeground,
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 20,
  },
  securityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: cornerRadius,
    backgroundColor: withAlpha(colors.card, 0.7),
  },
  securityIcon: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: withAlpha(colors.primary, 0.15),
  },
  securityCopy: {
    flex: 1,
  },
  securityTitle: {
    color: colors.foreground,
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: '700',
  },
  securityDescription: {
    marginTop: 2,
    color: colors.mutedForeground,
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 20,
  },
  loginPrompt: {
    alignItems: 'center',
    marginTop: 32,
  },
  loginPromptText: {
    color: colors.mutedForeground,
    fontFamily: fonts.body,
    fontSize: 14,
  },
  loginButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  loginButtonText: {
    color: colors.primary,
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: '700',
  },
  supportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 32,
  },
  supportText: {
    color: colors.mutedForeground,
    fontFamily: fonts.body,
    fontSize: 11,
    lineHeight: 16,
  },
  supportEmphasis: {
    color: colors.foreground,
    fontWeight: '700',
  },
});
