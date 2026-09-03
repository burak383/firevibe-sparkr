import React, { useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, fonts } from '../theme';
import { useAuth } from '../context/AuthContext';
import { ApiError } from '../api/client';
import { takeAndUploadSelfie } from '../utils/media';
import type { RootStackParamList } from '../navigation/RootNavigator';

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

export default function SelfieVerificationScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user, verifySelfie } = useAuth();
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!user) return null;

  if (user.verified) {
    // Already verified (e.g. got here via a stale nav state) - nothing to
    // do here, just confirm and let them go back.
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.centeredContent}>
          <View style={styles.successBadge}>
            <Icon name="check-decagram" size={40} color={colors.success} />
          </View>
          <Text style={styles.title}>Profilin zaten doğrulandı</Text>
          <Text style={styles.subtitle}>Topluluğa gerçek bir insan olduğunu gösteriyorsun.</Text>
          <Pressable style={styles.primaryButton} onPress={() => navigation.goBack()}>
            <Text style={styles.primaryButtonText}>Tamam</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const handleTakeSelfie = async () => {
    setBusy(true);
    try {
      const url = await takeAndUploadSelfie();
      if (!url) return; // user cancelled the camera
      setPreview(url);
      await verifySelfie(url);
      Alert.alert('Doğrulandı!', 'Profilinde artık doğrulanmış rozeti görünecek.', [
        { text: 'Harika', onPress: () => navigation.goBack() },
      ]);
    } catch (err) {
      Alert.alert('Hata', err instanceof ApiError ? err.message : 'Selfie gönderilemedi, tekrar dene.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.headerNav}>
        <Pressable
          accessibilityLabel="Geri dön"
          style={styles.headerButton}
          onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('EditProfile'))}
        >
          <Icon name="arrow-left" size={22} color={colors.cardForeground} />
        </Pressable>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerEyebrow}>GÜVEN</Text>
          <Text style={styles.headerTitle}>Profilini doğrula</Text>
        </View>
        <View style={{ width: 44 }} />
      </View>

      <View style={styles.content}>
        <View style={styles.previewWrap}>
          <Image
            source={{ uri: preview || user.avatarUrl || undefined }}
            style={styles.preview}
            resizeMode="cover"
          />
          {busy && (
            <View style={styles.previewOverlay}>
              <ActivityIndicator color={colors.foreground} size="large" />
            </View>
          )}
        </View>

        <Text style={styles.title}>Gerçek bir insan olduğunu göster</Text>
        <Text style={styles.subtitle}>
          Kamerayla canlı bir selfie çek, doğrulanmış rozetini açalım - eski bir fotoğraf seçmek yerine şimdi
          çekmen gerekiyor.
        </Text>

        <View style={styles.tipRow}>
          <Icon name="information-outline" size={16} color={colors.mutedForeground} />
          <Text style={styles.tipText}>İyi ışıklı bir yerde, yüzün net görünecek şekilde çek.</Text>
        </View>

        <Pressable style={styles.primaryButton} onPress={handleTakeSelfie} disabled={busy}>
          {busy ? (
            <ActivityIndicator color={colors.primaryForeground} />
          ) : (
            <>
              <Icon name="camera-outline" size={19} color={colors.primaryForeground} />
              <Text style={styles.primaryButtonText}>Selfie çek</Text>
            </>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  headerNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
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
    fontSize: 18,
    fontWeight: '800',
    marginTop: 4,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingTop: 24,
  },
  centeredContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  previewWrap: {
    width: 160,
    height: 160,
    borderRadius: 80,
    overflow: 'hidden',
    backgroundColor: colors.muted,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  preview: {
    width: '100%',
    height: '100%',
  },
  previewOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  successBadge: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.muted,
    marginBottom: 20,
  },
  title: {
    marginTop: 22,
    color: colors.foreground,
    fontFamily: fonts.heading,
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 10,
    color: colors.mutedForeground,
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  tipRow: {
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: colors.muted,
  },
  tipText: {
    flex: 1,
    color: colors.mutedForeground,
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 17,
  },
  primaryButton: {
    marginTop: 28,
    width: '100%',
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 20,
    backgroundColor: colors.primary,
  },
  primaryButtonText: {
    color: colors.primaryForeground,
    fontFamily: fonts.heading,
    fontSize: 16,
    fontWeight: '800',
  },
});
