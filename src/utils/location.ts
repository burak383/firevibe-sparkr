import * as Location from 'expo-location';

export class LocationError extends Error {}

export interface DetectedLocation {
  city: string;
  neighbourhood: string;
}

// Requests foreground location permission, reads the device's current GPS
// position, and reverse-geocodes it into a city/neighbourhood pair to
// auto-fill the "Şehir" field in Profil.tsx - see the "Konumu bul" button
// there. Everything here runs on-device via Expo's own APIs; nothing is
// sent anywhere except the final city/neighbourhood strings, which go to
// the backend the same way a manually-typed city would (PUT /api/users/me).
export async function detectCityFromLocation(): Promise<DetectedLocation> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    throw new LocationError(
      'Konum izni verilmedi. Ayarlar’dan SparkR için konum iznini açıp tekrar dene.'
    );
  }

  let position: Location.LocationObject;
  try {
    position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  } catch {
    throw new LocationError('Konumun alınamadı. GPS/konum servislerinin açık olduğundan emin ol.');
  }

  let results: Location.LocationGeocodedAddress[];
  try {
    results = await Location.reverseGeocodeAsync({
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    });
  } catch {
    throw new LocationError('Konumun şehre çevrilemedi, tekrar dene.');
  }

  const place = results[0];
  // Android and iOS populate these fields inconsistently (e.g. Android often
  // leaves `city` empty and puts the city name in `subregion` instead), so
  // fall back through a few candidates rather than trusting one field.
  const city = place?.city || place?.subregion || place?.region || '';
  const neighbourhood = place?.district || place?.subregion || place?.street || '';

  if (!city) {
    throw new LocationError('Bulunduğun yer için bir şehir adı bulunamadı.');
  }

  return { city, neighbourhood: neighbourhood === city ? '' : neighbourhood };
}
