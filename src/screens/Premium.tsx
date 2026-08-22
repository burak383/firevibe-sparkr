import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { PurchasesPackage } from 'react-native-purchases';
import { colors, fonts } from '../theme';
import { useAuth } from '../context/AuthContext';
import { getPremiumOffering, purchasePremium, restorePurchases } from '../utils/subscription';
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

const PERKS = [
  'Günlük 10 beğeni sınırı olmadan, sınırsız beğen',
  'Süper beğeniler de sınırsız',
  'İstediğin zaman iptal et',
];

// The paywall shown when the daily free-swipe limit is hit (AlevDestesi.tsx
// redirects here on a 402 response) or tapped proactively from the
// remaining-count badge on the deck screen.
//
// CANNOT BE TESTED FROM THIS SANDBOX: the actual purchase happens through
// react-native-purchases (see ../utils/subscription.ts) - see that file's
// header comment for exactly what still needs to exist (a development
// build, a real RevenueCat project) before a purchase can go through here.
// Until an offering is configured, `pkg` stays null and this screen shows
// a "not set up yet" message instead of a broken purchase button.
export default function PremiumScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { refreshUser } = useAuth();
  const [pkg, setPkg] = useState<PurchasesPackage | null>(null);
  const [loadingOffer, setLoadingOffer] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const offering = await getPremiumOffering();
        setPkg(offering?.availablePackages[0] ?? null);
      } catch (err) {
        console.log('[Premium] offering fetch failed:', err instanceof Error ? err.message : err);
      } finally {
        setLoadingOffer(false);
      }
    })();
  }, []);

  const handlePurchase = async () => {
    if (!pkg || purchasing) return;
    setPurchasing(true);
    try {
      const active = await purchasePremium(pkg);
      if (active) {
        await refreshUser(); // pulls the fresh swipeStatus (premium: true) down from the backend
        Alert.alert('Hoş geldin, Premium!', 'Artık sınırsız beğenebilirsin.', [
          { text: 'Harika', onPress: () => navigation.goBack() },
        ]);
      }
    } catch (err: any) {
      // react-native-purchases sets `userCancelled` on the error when the
      // person just closed the native payment sheet - not a real failure.
      if (!err?.userCancelled) {
        Alert.alert('Hata', 'Satın alma tamamlanamadı, tekrar dene.');
      }
    } finally {
      setPurchasing(false);
    }
  };

  const handleRestore = async () => {
    if (restoring) return;
    setRestoring(true);
    try {
      const active = await restorePurchases();
      await refreshUser();
      Alert.alert(
        active ? 'Geri yüklendi' : 'Aktif abonelik bulunamadı',
        active ? 'Premium erişimin geri geldi.' : 'Bu hesapla ilişkili aktif bir abonelik bulunamadı.'
      );
    } catch {
      Alert.alert('Hata', 'Geri yükleme başarısız, tekrar dene.');
    } finally {
      setRestoring(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headerNav}>
          <Pressable accessibilityLabel="Kapat" style={styles.headerButton} onPress={() => navigation.goBack()}>
            <Icon name="close" size={22} color={colors.cardForeground} />
          </Pressable>
        </View>

        <View style={styles.badge}>
          <Icon name="fire" size={40} color={colors.primary} />
        </View>
        <Text style={styles.title}>SparkR Premium</Text>
        <Text style={styles.subtitle}>Günlük beğeni limitini kaldır, geceyi sınırsız yaşa.</Text>

        <View style={styles.perksCard}>
          {PERKS.map((perk) => (
            <View key={perk} style={styles.perkRow}>
              <Icon name="check-circle" size={18} color={colors.success} />
              <Text style={styles.perkText}>{perk}</Text>
            </View>
          ))}
        </View>

        {loadingOffer ? (
          <ActivityIndicator color={colors.primary} style={styles.offerSpinner} />
        ) : pkg ? (
          <Pressable style={styles.purchaseButton} onPress={handlePurchase} disabled={purchasing}>
            {purchasing ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : (
              <Text style={styles.purchaseButtonText}>{pkg.product.priceString} · Premium'a Geç</Text>
            )}
          </Pressable>
        ) : (
          <Text style={styles.helperText}>
            Abonelik ürünü henüz yapılandırılmadı - RevenueCat panelinde bir "offering" oluşturman gerekiyor.
          </Text>
        )}

        <Pressable style={styles.restoreLink} onPress={handleRestore} disabled={restoring}>
          {restoring ? (
            <ActivityIndicator color={colors.mutedForeground} size="small" />
          ) : (
            <Text style={styles.restoreLinkText}>Satın alımları geri yükle</Text>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: 24,
    paddingBottom: 40,
    alignItems: 'center',
  },
  headerNav: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'flex-end',
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
  badge: {
    marginTop: 12,
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.muted,
  },
  title: {
    marginTop: 20,
    color: colors.foreground,
    fontFamily: fonts.heading,
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 10,
    color: colors.mutedForeground,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  perksCard: {
    marginTop: 26,
    width: '100%',
    padding: 16,
    borderRadius: 18,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 14,
  },
  perkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  perkText: {
    flex: 1,
    color: colors.foreground,
    fontFamily: fonts.body,
    fontSize: 13.5,
    fontWeight: '600',
  },
  offerSpinner: {
    marginTop: 28,
  },
  purchaseButton: {
    marginTop: 28,
    width: '100%',
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: colors.primary,
  },
  purchaseButtonText: {
    color: colors.primaryForeground,
    fontFamily: fonts.heading,
    fontSize: 16,
    fontWeight: '800',
  },
  helperText: {
    marginTop: 24,
    color: colors.mutedForeground,
    fontFamily: fonts.body,
    fontSize: 12.5,
    lineHeight: 18,
    textAlign: 'center',
  },
  restoreLink: {
    marginTop: 18,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  restoreLinkText: {
    color: colors.mutedForeground,
    fontFamily: fonts.body,
    fontSize: 12.5,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
});
