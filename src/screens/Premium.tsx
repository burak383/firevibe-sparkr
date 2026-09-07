import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { PurchasesPackage } from 'react-native-purchases';
import { colors, fonts } from '../theme';
import { useAuth } from '../context/AuthContext';
import { getPremiumOffering, purchaseConsumable, purchasePremium, restorePurchases } from '../utils/subscription';
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

// RevenueCat's standard package-type strings (see the "yearly" base plan set
// up in Play Console + attached to the $rc_annual package slot in RevenueCat's
// dashboard - the same "default" offering the monthly plan already lives in).
function planLabel(pkg: PurchasesPackage): string {
  switch (pkg.packageType) {
    case 'ANNUAL':
      return 'Yıllık';
    case 'MONTHLY':
      return 'Aylık';
    case 'WEEKLY':
      return 'Haftalık';
    case 'LIFETIME':
      return 'Ömür boyu';
    default:
      return pkg.product.title || 'Plan';
  }
}

// A one-time consumable product (like Boost) gets a custom, non-reserved
// RevenueCat package identifier, which automatically makes its packageType
// 'CUSTOM' - that's how it's told apart from the subscription plans living
// in this same "default" offering, without needing a second offering.
const BOOST_PACKAGE_IDENTIFIER = 'sparkr_boost_30min';
const SUPERLIKE_PACK_PACKAGE_IDENTIFIER = 'sparkr_superlike_pack_5';

function formatBoostCountdown(boostedUntil: string): string {
  const msLeft = new Date(boostedUntil).getTime() - Date.now();
  if (msLeft <= 0) return '0 dk';
  const mins = Math.ceil(msLeft / 60000);
  return `${mins} dk`;
}

// "%X avantajlı" badge on the yearly card, computed against what 12 months
// of the monthly plan would cost - only shown when both plans are actually
// in the offering (nothing to compare against otherwise).
function computeAnnualSavingsPct(packages: PurchasesPackage[]): number | null {
  const monthly = packages.find((p) => p.packageType === 'MONTHLY');
  const annual = packages.find((p) => p.packageType === 'ANNUAL');
  if (!monthly || !annual || !monthly.product.price) return null;
  const yearlyAtMonthlyRate = monthly.product.price * 12;
  const pct = Math.round((1 - annual.product.price / yearlyAtMonthlyRate) * 100);
  return pct > 0 ? pct : null;
}

// The paywall shown when the daily free-swipe limit is hit (AlevDestesi.tsx
// redirects here on a 402 response) or tapped proactively from the
// remaining-count badge on the deck screen.
//
// CANNOT BE TESTED FROM THIS SANDBOX: the actual purchase happens through
// react-native-purchases (see ../utils/subscription.ts) - see that file's
// header comment for exactly what still needs to exist (a development
// build, a real RevenueCat project) before a purchase can go through here.
// Until an offering is configured, `packages` stays empty and this screen
// shows a "not set up yet" message instead of a broken purchase button.
// Shows a monthly/yearly picker once more than one package is available -
// a single configured package (e.g. only monthly, before a yearly plan
// exists) just shows the one purchase button as before.
export default function PremiumScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user, refreshUser } = useAuth();
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [boostPackage, setBoostPackage] = useState<PurchasesPackage | null>(null);
  const [superlikePackPackage, setSuperlikePackPackage] = useState<PurchasesPackage | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loadingOffer, setLoadingOffer] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [boostPurchasing, setBoostPurchasing] = useState(false);
  const [superlikePackPurchasing, setSuperlikePackPurchasing] = useState(false);
  // Forces a re-render every 30s so the boost countdown text stays roughly
  // fresh without needing a full ticking-clock timer.
  const [, setBoostTick] = useState(0);

  useEffect(() => {
    if (!user?.boostActive) return;
    const interval = setInterval(() => setBoostTick((n) => n + 1), 30000);
    return () => clearInterval(interval);
  }, [user?.boostActive]);

  useEffect(() => {
    (async () => {
      try {
        const offering = await getPremiumOffering();
        const available = offering?.availablePackages ?? [];
        // Boost is a one-time consumable living in this same offering under
        // a custom package identifier - split it out from the subscription
        // plans before anything else touches `available`.
        const boost = available.find((p) => p.identifier === BOOST_PACKAGE_IDENTIFIER) ?? null;
        const superlikePack = available.find((p) => p.identifier === SUPERLIKE_PACK_PACKAGE_IDENTIFIER) ?? null;
        const subscriptionPackages = available.filter(
          (p) => p.identifier !== BOOST_PACKAGE_IDENTIFIER && p.identifier !== SUPERLIKE_PACK_PACKAGE_IDENTIFIER
        );
        setBoostPackage(boost);
        setSuperlikePackPackage(superlikePack);
        setPackages(subscriptionPackages);
        // Default the selection to the yearly plan when there is one - it's
        // the better deal, and nudging people toward it here is the same
        // thing most subscription paywalls do. Falls back to whatever's
        // first (the monthly plan, before a yearly one exists at all).
        const annualIndex = subscriptionPackages.findIndex((p) => p.packageType === 'ANNUAL');
        setSelectedIndex(annualIndex >= 0 ? annualIndex : 0);
      } catch (err) {
        console.log('[Premium] offering fetch failed:', err instanceof Error ? err.message : err);
      } finally {
        setLoadingOffer(false);
      }
    })();
  }, []);

  const selectedPackage = packages[selectedIndex] ?? null;
  const annualSavingsPct = computeAnnualSavingsPct(packages);

  const handlePurchase = async () => {
    if (!selectedPackage || purchasing) return;
    setPurchasing(true);
    try {
      const active = await purchasePremium(selectedPackage);
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

  const handleBoostPurchase = async () => {
    if (!boostPackage || boostPurchasing) return;
    setBoostPurchasing(true);
    try {
      await purchaseConsumable(boostPackage);
      // Crediting happens server-side via the RevenueCat webhook (see
      // backend/src/routes/subscription.js) - it may not have landed the
      // instant this resolves, but refreshUser() picks it up as soon as it
      // does; worst case the countdown just starts a beat late.
      await refreshUser();
      Alert.alert('Boost aktif!', '30 dakika boyunca kartın öne çıkacak.');
    } catch (err: any) {
      if (!err?.userCancelled) {
        Alert.alert('Hata', 'Satın alma tamamlanamadı, tekrar dene.');
      }
    } finally {
      setBoostPurchasing(false);
    }
  };

  const handleSuperlikePackPurchase = async () => {
    if (!superlikePackPackage || superlikePackPurchasing) return;
    setSuperlikePackPurchasing(true);
    try {
      await purchaseConsumable(superlikePackPackage);
      // Same webhook-credited flow as Boost - see
      // backend/src/subscription.js's addBonusSuperlikes.
      await refreshUser();
      Alert.alert('Paket eklendi!', '5 Super Vibe hesabına tanımlandı.');
    } catch (err: any) {
      if (!err?.userCancelled) {
        Alert.alert('Hata', 'Satın alma tamamlanamadı, tekrar dene.');
      }
    } finally {
      setSuperlikePackPurchasing(false);
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
        ) : packages.length > 0 ? (
          <>
            {packages.length > 1 && (
              <View style={styles.planRow}>
                {packages.map((p, index) => {
                  const isSelected = index === selectedIndex;
                  const showSavings = p.packageType === 'ANNUAL' && annualSavingsPct;
                  return (
                    <Pressable
                      key={p.identifier}
                      style={[styles.planCard, isSelected && styles.planCardSelected]}
                      onPress={() => setSelectedIndex(index)}
                    >
                      {showSavings ? (
                        <View style={styles.savingsBadge}>
                          <Text style={styles.savingsBadgeText}>%{annualSavingsPct} avantajlı</Text>
                        </View>
                      ) : null}
                      <Text style={[styles.planLabel, isSelected && styles.planLabelSelected]}>{planLabel(p)}</Text>
                      <Text style={[styles.planPrice, isSelected && styles.planPriceSelected]}>
                        {p.product.priceString}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
            <Pressable
              style={[styles.purchaseButton, packages.length === 1 && styles.purchaseButtonAlone]}
              onPress={handlePurchase}
              disabled={purchasing || !selectedPackage}
            >
              {purchasing ? (
                <ActivityIndicator color={colors.primaryForeground} />
              ) : (
                <Text style={styles.purchaseButtonText}>
                  {selectedPackage?.product.priceString} · Premium'a Geç
                </Text>
              )}
            </Pressable>
          </>
        ) : (
          <Text style={styles.helperText}>
            Abonelik ürünü henüz yapılandırılmadı - RevenueCat panelinde bir "offering" oluşturman gerekiyor.
          </Text>
        )}

        {boostPackage && (
          <View style={styles.boostCard}>
            <View style={styles.boostHeader}>
              <Icon name="rocket-launch" size={22} color={colors.primary} />
              <Text style={styles.boostTitle}>Boost</Text>
            </View>
            <Text style={styles.boostSubtitle}>
              30 dakika boyunca profilin çevrendeki herkesin kartlarında en önde çıkar.
            </Text>
            {user?.boostActive && user.boostedUntil ? (
              <View style={styles.boostActivePill}>
                <Icon name="lightning-bolt" size={16} color={colors.success} />
                <Text style={styles.boostActiveText}>
                  Aktif · {formatBoostCountdown(user.boostedUntil)} kaldı
                </Text>
              </View>
            ) : (
              <Pressable style={styles.boostButton} onPress={handleBoostPurchase} disabled={boostPurchasing}>
                {boostPurchasing ? (
                  <ActivityIndicator color={colors.primaryForeground} />
                ) : (
                  <Text style={styles.boostButtonText}>{boostPackage.product.priceString} · Boost Satın Al</Text>
                )}
              </Pressable>
            )}
          </View>
        )}

        {superlikePackPackage && (
          <View style={styles.boostCard}>
            <View style={styles.boostHeader}>
              <Icon name="star-four-points" size={22} color={colors.secondary} />
              <Text style={styles.boostTitle}>Ekstra Super Vibe Paketi</Text>
            </View>
            <Text style={styles.boostSubtitle}>
              5 adet Super Vibe hakkı satın al - abonelik olmadan da kullanılabilir, hiç süresi dolmaz.
              {user && user.superlikeStatus.bonus > 0 ? ` Mevcut bakiye: ${user.superlikeStatus.bonus}.` : ''}
            </Text>
            <Pressable
              style={styles.boostButton}
              onPress={handleSuperlikePackPurchase}
              disabled={superlikePackPurchasing}
            >
              {superlikePackPurchasing ? (
                <ActivityIndicator color={colors.primaryForeground} />
              ) : (
                <Text style={styles.boostButtonText}>
                  {superlikePackPackage.product.priceString} · Paket Satın Al
                </Text>
              )}
            </Pressable>
          </View>
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
  planRow: {
    marginTop: 28,
    width: '100%',
    flexDirection: 'row',
    gap: 12,
  },
  planCard: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    gap: 6,
  },
  planCardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.muted,
  },
  planLabel: {
    color: colors.mutedForeground,
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: '700',
  },
  planLabelSelected: {
    color: colors.foreground,
  },
  planPrice: {
    color: colors.mutedForeground,
    fontFamily: fonts.heading,
    fontSize: 16,
    fontWeight: '800',
  },
  planPriceSelected: {
    color: colors.foreground,
  },
  savingsBadge: {
    position: 'absolute',
    top: -10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: colors.success,
  },
  savingsBadgeText: {
    color: colors.primaryForeground,
    fontFamily: fonts.body,
    fontSize: 10,
    fontWeight: '800',
  },
  purchaseButton: {
    marginTop: 16,
    width: '100%',
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: colors.primary,
  },
  // Used instead of the plain `purchaseButton` marginTop when there's only
  // one plan (no planRow above it to provide the spacing) - see the
  // `packages.length > 1` check around the button.
  purchaseButtonAlone: {
    marginTop: 28,
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
  boostCard: {
    marginTop: 24,
    width: '100%',
    padding: 16,
    borderRadius: 18,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10,
  },
  boostHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  boostTitle: {
    color: colors.foreground,
    fontFamily: fonts.heading,
    fontSize: 16,
    fontWeight: '800',
  },
  boostSubtitle: {
    color: colors.mutedForeground,
    fontFamily: fonts.body,
    fontSize: 12.5,
    lineHeight: 18,
  },
  boostButton: {
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: colors.primary,
  },
  boostButtonText: {
    color: colors.primaryForeground,
    fontFamily: fonts.heading,
    fontSize: 14.5,
    fontWeight: '800',
  },
  boostActivePill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.muted,
  },
  boostActiveText: {
    color: colors.success,
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: '700',
  },
});
