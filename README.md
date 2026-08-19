# FireVibe / SparkR

Bu proje, [FireVibe.ai](https://firevibe.ai) tarafından üretilen ham React Native
ekranlarından (bkz. `original-export/`) yola çıkılarak eksiksiz, çalışan bir
mobil uygulama + backend haline getirildi.

Orijinal export sadece 10 tane bağımsız ekran bileşeni içeriyordu: navigasyon,
state yönetimi, API entegrasyonu yoktu; hatta `theme.ts` içeki export isimleri
ekranların import ettiği isimlerle bile uyuşmuyordu (bazıları `import theme`,
bazıları `import { colors, fonts }`, bazıları `import { theme }` kullanıyordu -
hiçbiri projedeki `theme.ts` ile eşleşmiyordu), yani proje derlenmiyordu bile.

## Neler yapıldı

- **`theme.ts` düzeltildi** - artık tüm import stillerini (`default`, `{ theme }`,
  `{ colors, fonts }`) tek bir dosyadan destekliyor.
- **Backend eklendi** (`backend/`) - kayıt/giriş, şifremi unuttum, profil,
  keşif/kaydırma (Alev Destesi), eşleşme, sohbet (Deniz ile Sohbet) ve Vibe
  Radar için gerçek bir REST API. Sıfır npm bağımlılığı ile yazıldı (sadece
  Node.js'in kendi modülleri), bu yüzden `npm install` beklemeden hemen
  çalışır.
- **Mobil uygulama tamamlandı** (`mobile/`) - React Navigation ile ekranlar
  birbirine bağlandı, tüm formlar gerçek API çağrıları yapıyor, "Alev Destesi"
  kaydırma ekranı artık gerçek beğen/geç/super-like aksiyonlarıyla çalışıyor,
  sohbet ekranı gerçek zamanlı (polling ile) mesajlaşıyor, profil düzenleme
  kaydediyor, vs. Çalışmayan/boş `onPress`'lerin hepsi ya gerçek bir aksiyona
  bağlandı ya da en azından "Yakında" bildirimi veriyor (sessizce hiçbir şey
  yapmıyor).
- **İkinci geçiş: kalan "Yakında" stub'ları tek tek gerçek işlevlere
  bağlandı** - profil görünürlüğü, müzik zevki/mod düzenleme, yaş aralığı ve
  keşif yarıçapı ayarları, fotoğraf/galeri yükleme, sohbette fotoğraf
  gönderme, sesli Vibe kaydı, SMS ile giriş ve Google ile giriş (bkz. API
  tablosundaki notlar). Bu arada iki gerçek hata da bulunup düzeltildi: (1)
  JSON "veritabanı" dosyası, dosyada olmayan bir koleksiyon eklendiğinde
  `NaN` id üretip o koleksiyondaki her güncellemeyi sessizce yok sayıyordu
  (bkz. `backend/src/db.js`); (2) şifremi unuttum akışı kullanıcıyı gerçekte
  hiçbir yere götürmüyordu - bağlantı "gönderildi" deniyordu ama uygulama
  içinde token'ı girip yeni şifre belirlemenin bir yolu yoktu. Ayrıca basit
  bir IP bazlı rate limiting eklendi.
- **Üçüncü geçiş: bağımsız bir "hata/eksik" denetiminde bulunan 4 gerçek
  hata da düzeltildi** - (1) sohbetteki "Şikayet Et" / "Engelle" butonları
  backend'e hiç dokunmadan doğrudan "başarılı" diyordu (en ciddi bulgu -
  bir güvenlik aksiyonunun sahte şekilde başarılı görünmesi); artık gerçek
  bir engelleme/şikayet sistemi var (bkz. `backend/src/routes/safety.js`) -
  engellenen kullanıcılar keşif/radar'dan filtreleniyor, aralarındaki
  eşleşme ve mesajlar siliniyor, birbirlerini kaydıramıyorlar. (2) Vibe
  Kurulumu'ndaki ses kaydı oynatma/durdurma butonu, kullanıcı manuel
  durdurduğunda "duraklat" ikonunda takılı kalıyordu. (3) IP bazlı rate
  limiting, `X-Forwarded-For` header'ı her istekte değiştirilerek kolayca
  atlatılabiliyordu; artık bu header sadece `TRUST_PROXY=true` açıkça
  ayarlanmışsa (yani gerçekten güvenilir bir reverse proxy arkasında
  çalışıyorsan) dikkate alınıyor. (4) Alev Destesi'ndeki (kaydırma) "Voice
  Vibe" kartı tamamen sahteydi - sabit bir alıntı ve sabit "%58 çalındı"
  dalga formu gösteriyordu, hiçbir ses çalmıyordu; artık kullanıcının
  gerçekten kaydettiği ses notu varsa gerçek `expo-av` ile çalıyor, yoksa
  kart hiç gösterilmiyor. Aynı denetimde Alev Destesi'ndeki "FIRE HOUR"
  rozeti de sabit "21:00 · 18 dk" yazıyordu; artık Vibe Radar'daki ile aynı
  gerçek `GET /api/radar/fire-hour` verisini gösteriyor.
- **Dördüncü geçiş: yalnızca mobil tarafta ("backend hariç") yapılan bir
  denetimde bulunan 6 gerçek sorun da düzeltildi** - (1) Vibe Radar'daki
  Fire Hour rozeti de tıpkı Alev Destesi'ndeki gibi sabit "21:00–22:00"
  yazıyordu, gerçek `windowStart`/`windowEnd` verisini kullanmıyordu; artık
  ikisi de aynı gerçek veriyi gösteriyor. (2) Vibe Radar'daki eşleşme
  listesi "bir satıra uzun basınca sessize al, eşleşmeyi kaldır, engelle
  veya şikayet et" diyordu ama hiçbir `onLongPress` yoktu; artık uzun
  basınca gerçek bir menü açılıyor (sessize alma özelliği backend'de hiç
  olmadığı için metinden de çıkarıldı, sadece gerçekten var olan üç aksiyon
  bırakıldı). (3) "Benim Vibe'ım" ekranındaki "Engellenen kişiler" satırı
  her zaman sabit "Kontrol listen boş." yazıyordu ve dokununca da aynı
  sabit metni tekrar gösteriyordu - gerçekten engellediğin biri olsa bile;
  artık profildeki gerçek engelli listesine yönlendiriyor. (4) Profil
  düzenleme ekranındaki "Telefon doğrulaması" ve "Güvenlik merkezi"
  satırları tıklanabilir gibi bir ok (chevron) gösteriyordu ama `Pressable`
  bile değillerdi, dokununca hiçbir şey olmuyordu; artık ok sadece gerçekten
  tıklanabilir olduğunda gösteriliyor, "Güvenlik merkezi" de dürüst bir
  bilgi mesajına bağlandı. (5) Vibe Kurulumu'ndaki "vibe etiketleri"
  (Gece Yürüyüşü, Canlı Müzik, Spontane Plan) sabit bir listeydi, müzik
  zevki gibi seçilebilir değildi - her kullanıcı aynı üç etiketle
  kaydoluyordu; artık müzik zevki ile aynı şekilde gerçek bir çoklu seçim.
  (6) Alev Destesi'ndeki "Yakınında X kişi şu an alevde" metni gerçek
  aktiflik verisi yerine o anki kaydırma destesinin boyutunu (`deck.length`)
  gösteriyordu; artık Vibe Radar'daki ile aynı gerçek `activeCount`
  verisini kullanıyor.
- **Expo SDK 54'e yükseltildi** - React Native 0.81, React 19.1. Tüm
  `expo-*` paketleri ve `react-navigation` (v6 → v7, React 19 ile bilinen
  bir uyumluluk sorunu olduğu için) SDK 54 ile uyumlu sürümlere çekildi
  (bkz. `mobile/package.json`). Kod tarafında bir değişiklik gerekmedi -
  `react-navigation`'ın v6→v7 breaking change listesi (`headerBackTitleVisible`
  gibi bazı `Stack.Screen` seçenek isimlerinin değişmesi) bu projede hiç
  kullanılmayan API'lere dokunuyordu. Node.js **20.19.4+** artık zorunlu.
  `expo-av` SDK 53'ten beri deprecated ve **SDK 55'te tamamen kaldırılacak**
  - bu proje SDK 54'te kaldığı sürece çalışmaya devam eder, ama SDK 55'e
  geçmeden önce ses kaydı/oynatma kodunun (`VibeKurulumu.tsx`,
  `AlevDestesi.tsx`) `expo-audio`'ya taşınması gerekecek.

## Proje yapısı

```
backend/    Node.js API sunucusu (bağımlılık yok, sadece Node.js)
mobile/     Expo / React Native uygulaması
original-export/   FireVibe.ai'den gelen orijinal, değiştirilmemiş dosyalar
```

## Hızlı başlangıç

### 1) Backend'i çalıştır

```bash
cd backend
cp .env.example .env   # istersen ayarları değiştir, varsayılanlar demo için yeterli
npm start               # http://localhost:4000
```

İlk açılışta 5 demo profil (Deniz, Ece, Arda, Mert, Zeynep) otomatik olarak
oluşturulur, böylece kayıt olur olmaz keşif akışında gezecek insanlar olur.
Bu "bot" profiller seni beğendiğinde anında geri beğenir, böylece eşleşme ve
sohbet akışını tek başına (backend + tek telefon) uçtan uca test edebilirsin.

### 2) Mobil uygulamayı çalıştır

```bash
cd mobile
npm install
cp .env.example .env    # gerekirse EXPO_PUBLIC_API_URL'i düzenle (bkz. mobile/.env.example)
npm start
```

Ardından Expo Go ile QR kodu okut ya da bir simülatör/emülatör aç.

> Proje **Expo SDK 54** kullanıyor (React Native 0.81, React 19.1) - bunun
> için Node.js **20.19.4 veya üzeri** gerekiyor. `node -v` ile kontrol et,
> eskiyse [nvm](https://github.com/nvm-sh/nvm) ile güncelle.

> Gerçek bir telefonda (Expo Go) test ediyorsan `localhost` telefondan
> bilgisayarına ulaşamaz - `mobile/.env` içinde `EXPO_PUBLIC_API_URL`'i
> bilgisayarının yerel ağ IP adresine çevirmen gerekir (örn.
> `http://192.168.1.23:4000`). Android emülatöründe `10.0.2.2:4000` kullanılır.

## Backend API'ye genel bakış

Tüm uçlar `/api` altında, JSON gövdeli, JWT benzeri imzalı token ile
kimlik doğrulamalı (`Authorization: Bearer <token>`).

| Uç | Açıklama |
| --- | --- |
| `POST /api/auth/register` | Kayıt ol |
| `POST /api/auth/login` | Giriş yap |
| `POST /api/auth/forgot-password` / `POST /api/auth/reset-password` | Şifremi unuttum akışı (uçtan uca çalışır - bkz. aşağıdaki not) |
| `POST /api/auth/sms/request` / `POST /api/auth/sms/verify` | SMS koduyla giriş (dev-mode OTP - bkz. aşağıdaki not) |
| `POST /api/auth/google` | Google ile giriş/kayıt (kendi Google OAuth istemci kimliğini gerektirir) |
| `GET /api/auth/me` | Giriş yapmış kullanıcıyı döner |
| `GET /api/users/me` / `PUT /api/users/me` | Profili oku / güncelle (görünürlük, yaş aralığı, keşif yarıçapı dahil) |
| `POST /api/users/me/vibe-setup` | Onboarding'i tamamla |
| `DELETE /api/users/me` | Hesabı ve tüm ilişkili verileri sil |
| `GET /api/discovery/deck` | Kaydırma akışı (Alev Destesi) - gizlenmiş profiller hariç |
| `POST /api/discovery/swipe` | Beğen / geç / super-like |
| `GET /api/matches` / `GET /api/matches/:id` / `DELETE /api/matches/:id` | Eşleşmeler |
| `GET /api/matches/:id/messages` / `POST .../messages` | Sohbet (metin ve/veya fotoğraf) |
| `GET /api/radar/nearby` / `GET /api/radar/fire-hour` | Vibe Radar verileri - gizlenmiş profiller hariç |
| `POST /api/uploads` | Base64 fotoğraf/ses yükle, statik URL döner (bkz. `GET /uploads/:dosya`) |
| `GET /api/safety/blocked` / `POST /api/safety/block` / `DELETE /api/safety/block/:userId` | Engellenen kullanıcıları listele / engelle / engeli kaldır (engelleme, aradaki eşleşme+mesajları da siler) |
| `POST /api/safety/report` | Kullanıcı şikayet et |

Detaylar için `backend/src/routes/*.js` dosyalarına bakabilirsin.

### Dev-mode "gönderim" akışları (şifre sıfırlama ve SMS kodu)

Bu demoda gerçek bir e-posta/SMS sağlayıcısı yok, bu yüzden hem şifre sıfırlama
hem de SMS ile giriş kodunu üretirken API cevabına da ekliyoruz
(`devResetToken` / `devCode` alanları) - böylece uygulama içinden uçtan uca
test edebilirsin, ekstra bir araca ihtiyacın olmaz. Mobil taraf bu alanları
otomatik olarak forma dolduruyor/gösteriyor. Gerçek bir kullanıcıya asla token
göndermeyeceğin için, üretime geçerken bu iki alanı kaldırıp gerçek bir
e-posta (SendGrid/SES) ve SMS (Twilio/Netgsm) sağlayıcısı bağlaman gerekir.

### Google ile giriş

`backend/src/google-verify.js`, Google'ın JWKS'ini indirip RS256 imzasını
Node'un yerleşik `crypto` modülüyle doğruluyor - ekstra bir paket
gerektirmiyor. Ancak çalışması için hem backend'de (`GOOGLE_CLIENT_ID`) hem
mobilde (`EXPO_PUBLIC_GOOGLE_*_CLIENT_ID`) kendi Google Cloud OAuth istemci
kimliklerini tanımlaman gerekiyor - detaylar için `backend/.env.example` ve
`mobile/.env.example` dosyalarındaki notlara bak. Boş bırakırsan buton
"yapılandırılmamış" mesajı gösterir; sessizce başarısız olmaz.

## Bilinen sınırlamalar (bilinçli demo kısıtlamaları)

- `expo-av` (ses kaydı/oynatma için kullanılıyor) SDK 53'ten beri
  deprecated ve **SDK 55'te tamamen kaldırılacak** - bu proje şu an SDK
  54'te olduğu için sorun yok, ama SDK 55'e geçmeden önce
  `VibeKurulumu.tsx` ve `AlevDestesi.tsx`'teki ses kodunun `expo-audio`'ya
  taşınması gerekecek.
- Backend, gerçek bir veritabanı yerine tek bir JSON dosyası (`backend/data/sparkr.json`)
  kullanıyor. Küçük ölçek/demo için yeterli; üretime almadan önce Postgres/SQLite
  gibi gerçek bir veritabanına geçmen önerilir.
- Sohbet gerçek zamanlı görünmesi için 2.5 saniyede bir "polling" yapıyor
  (WebSocket değil) - bu sayede backend hâlâ sıfır bağımlılıkla çalışıyor.
- Fotoğraf/ses dosyaları `backend/data/uploads/` altında düz dosya olarak
  tutuluyor (bkz. `POST /api/uploads`). Demo için yeterli; üretimde S3,
  Cloudinary vb. bir nesne depolama servisine geçmen önerilir.
- Google ile giriş çalışır durumda ama kendi OAuth istemci kimliklerini
  eklemen gerekiyor (yukarıya bak). SMS ve şifre sıfırlama uçtan uca
  çalışıyor, ama gerçek bir SMS/e-posta sağlayıcısı yerine kodu API
  cevabında döndürüyor (yine yukarıya bak) - bu, üretime çıkmadan önce
  değiştirilmesi gereken bilinçli bir demo kısayolu.
- Basit bir IP bazlı rate limiting var (`backend/src/rate-limit.js`) ama
  tek process içinde bellekte tutuluyor; birden fazla sunucu instance'ı
  çalıştırırsan paylaşılan bir store'a (Redis vb.) geçmen gerekir.
- Fire Hour penceresi sabit bir saat aralığı (21:00-22:00); gerçek bir
  zamanlama/etkinlik mantığına bağlı değil. Ancak hem Vibe Radar hem Alev
  Destesi ekranları artık aynı gerçek `/api/radar/fire-hour` verisini
  (canlı mı, kaç dakika kaldı/kaç dakika sonra başlıyor) gösteriyor - sabit
  olan sadece saat aralığının kendisi, ekranlardaki geri sayım değil.
- Konum/mesafe bilgileri gerçek GPS'e değil, sahte `distanceKm` alanına
  dayanıyor. Aynı şekilde radar'daki "aktif kullanıcı" sayısı gerçek
  aktiflik verisine değil, seyrek demo verisini daha canlı göstermek için
  eklenen sabit bir dolgu sayıya dayanıyor (bkz. `backend/src/routes/radar.js`).
- `expo-image-picker` ve `expo-av` ile yazılan fotoğraf seçme / ses kaydı
  kodu bu sandbox'ta gerçek bir cihaz/Expo Go olmadan test edilemedi;
  özellikle `expo-av`'ın `HIGH_QUALITY` kayıt ön ayarı iOS'ta `.m4a` yerine
  `.caf` üretebilir - bu durumda `mobile/src/utils/media.ts`'teki MIME
  tahmin/yedek mantığı yanlış uzantı yazabilir. Gerçek bir iOS cihazında
  sesli Vibe kaydını test etmen önerilir.
- Otomatik test (birim/e2e) yok, CI/CD yok, gerçek bir sunucuya deploy
  edilmedi - şu an sadece local'de çalışıyor.
