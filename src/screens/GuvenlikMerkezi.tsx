import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, fonts } from '../theme';
import { useAuth } from '../context/AuthContext';
import { api, ApiError } from '../api/client';
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

// --- KVKK Aydınlatma Metni ------------------------------------------------
// This is a starting template, NOT a finished legal document - the bracketed
// [ ] placeholders need real company/contact details, and 6698 sayılı KVKK
// compliance is a legal question a lawyer should sign off on before this
// goes live with real users' data, not something a generic template can
// guarantee on its own.
const KVKK_SECTIONS: { title: string; body: string }[] = [
  {
    title: '1. Veri Sorumlusu',
    body:
      '6698 sayılı Kişisel Verilerin Korunması Kanunu ("KVKK") uyarınca, FireVibe uygulaması kapsamında işlenen kişisel verileriniz bakımından veri sorumlusu Burak Tüfekçi (şahıs işletmesi)\'dır. Sorularınız için seolen8@gmail.com adresinden bize ulaşabilirsiniz.',
  },
  {
    title: '2. İşlenen Kişisel Veriler',
    body:
      'Kimlik ve iletişim bilgileri (ad, telefon numarası/e-posta), profil bilgileri (yaş, biyografi, şehir/semt, ilgi alanları), profil fotoğrafları ve galeri görselleri, sesli notlar, doğrulama amacıyla çekilen selfie fotoğrafları, yaklaşık konum bilgisi, uygulama içi mesajlaşma içerikleri ve kullanım/etkileşim verileri (beğeni, geçme, eşleşme, şikayet kayıtları) işlenmektedir.',
  },
  {
    title: '3. İşleme Amaçları',
    body:
      'Verileriniz; hesabınızı oluşturmak ve doğrulamak, size uygun eşleşmeleri göstermek, uygulama içi mesajlaşmayı sağlamak, güvenliği korumak (engelleme/şikayet süreçleri, sahte hesapların tespiti), yasal yükümlülüklerin yerine getirilmesi ve uygulamanın geliştirilmesi amacıyla işlenmektedir.',
  },
  {
    title: '4. Hukuki Sebep',
    body:
      'Kişisel verileriniz, KVKK m.5 kapsamında açık rızanızın alınması ve/veya bir sözleşmenin kurulması/ifasıyla doğrudan doğruya ilgili olması, hukuki yükümlülüğün yerine getirilmesi ve veri sorumlusunun meşru menfaati hukuki sebeplerine dayanılarak işlenmektedir.',
  },
  {
    title: '5. Aktarım',
    body:
      'Kişisel verileriniz; yasal olarak yetkili kamu kurum ve kuruluşları dışında, yalnızca uygulamanın çalışması için kullanılan barındırma/altyapı hizmet sağlayıcılarıyla (örn. sunucu barındırma) ve açıkça belirtilmedikçe başka bir üçüncü tarafla paylaşılmaz; profiliniz diğer kullanıcılara yalnızca siz görünür ayarındayken ve yalnızca profil bilgileriniz (iletişim bilgileriniz hariç) ölçüsünde gösterilir.',
  },
  {
    title: '6. Saklama Süresi',
    body:
      'Verileriniz, hesabınız aktif olduğu sürece ve hesabınızı sildiğinizde bu ekrandaki "Hesabımı Sil" işlemiyle birlikte derhal silinecek şekilde saklanır; yasal saklama yükümlülüğü bulunan veriler ilgili mevzuatta öngörülen süre kadar saklanabilir.',
  },
  {
    title: '7. Haklarınız (KVKK m.11)',
    body:
      'KVKK\'nın 11. maddesi uyarınca; kişisel verinizin işlenip işlenmediğini öğrenme, işlenmişse buna ilişkin bilgi talep etme, işlenme amacını ve amacına uygun kullanılıp kullanılmadığını öğrenme, yurt içinde/yurt dışında aktarıldığı üçüncü kişileri bilme, eksik/yanlış işlenmişse düzeltilmesini isteme, silinmesini/yok edilmesini isteme, aleyhinize bir sonucun ortaya çıkmasına itiraz etme ve kanuna aykırı işleme sebebiyle zararın giderilmesini talep etme haklarına sahipsiniz. Bu haklarınızı kullanmak için seolen8@gmail.com üzerinden bize ulaşabilirsiniz.',
  },
];

const COMMUNITY_RULES: { title: string; body: string }[] = [
  {
    title: 'Gerçek ol',
    body: 'Profilin gerçek fotoğraflarını ve doğru bilgilerini içermeli. Başkasının kimliğine bürünmek veya sahte profil oluşturmak hesabının kalıcı olarak kapatılmasına sebep olur.',
  },
  {
    title: 'Saygılı ol',
    body: 'Taciz, nefret söylemi, ayrımcılık, tehdit veya istenmeyen cinsel içerik kesinlikle yasaktır. Karşındaki de senin gibi gerçek bir insan.',
  },
  {
    title: 'Güvende kal',
    body: 'Kişisel veya finansal bilgilerini (adres, banka bilgisi, kimlik numarası) uygulama içinde asla paylaşma. Bir profil şüpheli görünüyorsa (para isteme, dış bağlantıya yönlendirme gibi) hemen şikayet et.',
  },
  {
    title: '18 yaş altı yasak',
    body: 'FireVibe yalnızca 18 yaş ve üzeri kullanıcılar içindir. 18 yaşından küçük olduğunu öğrendiğimiz hesaplar kaldırılır.',
  },
  {
    title: 'Şikayet ve engelleme her zaman elinde',
    body: 'Rahatsız edici bulduğun herhangi bir profili tek dokunuşla engelleyebilir veya şikayet edebilirsin - bildirdiğin şeyler ciddiye alınır.',
  },
];

function CollapsibleGroup({
  icon,
  title,
  items,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  title: string;
  items: { title: string; body: string }[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.card}>
      <Pressable style={styles.cardHeader} onPress={() => setOpen((v) => !v)}>
        <View style={styles.cardHeaderLeft}>
          <Icon name={icon} size={19} color={colors.primary} />
          <Text style={styles.cardTitle}>{title}</Text>
        </View>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={21} color={colors.mutedForeground} />
      </Pressable>
      {open && (
        <View style={styles.cardBody}>
          {items.map((item) => (
            <View key={item.title} style={styles.entry}>
              <Text style={styles.entryTitle}>{item.title}</Text>
              <Text style={styles.entryBody}>{item.body}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

export default function SecurityCenterScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { logout } = useAuth();
  const [deleting, setDeleting] = useState(false);

  const handleDelete = () => {
    Alert.alert(
      'Hesabını silmek üzeresin',
      'Bu işlem geri alınamaz: profilin, eşleşmelerin ve mesajların kalıcı olarak silinir.',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Devam et',
          style: 'destructive',
          onPress: () => {
            // Second, explicit confirmation for a destructive/irreversible
            // action - one Alert asking "emin misin?" is easy to tap through
            // by habit, so this makes sure it's a deliberate choice.
            Alert.alert('Son kez soruyoruz', 'Hesabını kalıcı olarak silmek istediğine emin misin?', [
              { text: 'Vazgeç', style: 'cancel' },
              {
                text: 'Evet, hesabımı sil',
                style: 'destructive',
                onPress: async () => {
                  setDeleting(true);
                  try {
                    await api.deleteAccount();
                    await logout();
                  } catch (err) {
                    Alert.alert('Hata', err instanceof ApiError ? err.message : 'Hesap silinemedi, tekrar dene.');
                  } finally {
                    setDeleting(false);
                  }
                },
              },
            ]);
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headerNav}>
          <Pressable
            accessibilityLabel="Geri dön"
            style={styles.headerButton}
            onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('EditProfile'))}
          >
            <Icon name="arrow-left" size={22} color={colors.cardForeground} />
          </Pressable>
          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerEyebrow}>HESABIN</Text>
            <Text style={styles.headerTitle}>Güvenlik Merkezi</Text>
          </View>
          <View style={{ width: 44 }} />
        </View>

        <Text style={styles.intro}>
          Gizlilik hakların, topluluk kuralları ve hesabınla ilgili hassas aksiyonlar burada.
        </Text>

        <CollapsibleGroup icon="shield-lock-outline" title="KVKK Aydınlatma Metni" items={KVKK_SECTIONS} />
        <CollapsibleGroup icon="account-group-outline" title="Topluluk İlkeleri" items={COMMUNITY_RULES} />

        <View style={styles.dangerCard}>
          <View style={styles.dangerHeader}>
            <Icon name="alert-octagon-outline" size={19} color={colors.destructive} />
            <Text style={styles.dangerTitle}>Tehlikeli bölge</Text>
          </View>
          <Text style={styles.dangerText}>
            Hesabını sildiğinde profilin, tüm eşleşmelerin ve mesajların kalıcı olarak silinir. Bu işlem geri alınamaz.
          </Text>
          <Pressable style={styles.dangerButton} onPress={handleDelete} disabled={deleting}>
            {deleting ? (
              <ActivityIndicator color={colors.destructiveForeground} />
            ) : (
              <>
                <Icon name="trash-can-outline" size={18} color={colors.destructiveForeground} />
                <Text style={styles.dangerButtonText}>Hesabımı Sil</Text>
              </>
            )}
          </Pressable>
        </View>
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
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 40,
  },
  headerNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
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
    fontSize: 19,
    fontWeight: '800',
    marginTop: 4,
  },
  intro: {
    color: colors.mutedForeground,
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 18,
  },
  card: {
    marginBottom: 14,
    borderRadius: 18,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cardTitle: {
    color: colors.foreground,
    fontFamily: fonts.heading,
    fontSize: 15,
    fontWeight: '800',
  },
  cardBody: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 14,
  },
  entry: {
    gap: 4,
  },
  entryTitle: {
    color: colors.foreground,
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: '800',
  },
  entryBody: {
    color: colors.mutedForeground,
    fontFamily: fonts.body,
    fontSize: 12.5,
    lineHeight: 18,
  },
  dangerCard: {
    marginTop: 6,
    padding: 16,
    borderRadius: 18,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.destructive,
  },
  dangerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dangerTitle: {
    color: colors.destructive,
    fontFamily: fonts.heading,
    fontSize: 15,
    fontWeight: '800',
  },
  dangerText: {
    marginTop: 8,
    color: colors.mutedForeground,
    fontFamily: fonts.body,
    fontSize: 12.5,
    lineHeight: 18,
  },
  dangerButton: {
    marginTop: 14,
    height: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 16,
    backgroundColor: colors.destructive,
  },
  dangerButtonText: {
    color: colors.destructiveForeground,
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: '800',
  },
});
