import * as ImagePicker from 'expo-image-picker';
import { api, ApiError } from '../api/client';

/**
 * Opens the device photo library, lets the user pick one image, and uploads
 * it to the backend's `/api/uploads` endpoint (see backend/src/routes/uploads.js).
 * Returns the hosted URL to store on the user (avatarUrl / gallery), or
 * `null` if the user cancelled the picker.
 *
 * Throws ApiError on permission denial or upload failure, so callers can
 * show it the same way they already handle other ApiErrors.
 */
export async function pickAndUploadImage(options?: { aspect?: [number, number] }): Promise<string | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new ApiError('Fotoğraflarına erişebilmemiz için galeri iznine ihtiyacımız var.', 0);
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    // `MediaTypeOptions.Images` still works but is deprecated in favor of
    // this array form as of recent expo-image-picker versions.
    mediaTypes: ['images'],
    quality: 0.7,
    base64: true,
    allowsEditing: !!options?.aspect,
    aspect: options?.aspect,
  });

  if (result.canceled || !result.assets?.[0]?.base64) return null;

  const asset = result.assets[0];
  const mimeType = asset.mimeType && asset.mimeType.startsWith('image/') ? asset.mimeType : 'image/jpeg';
  const dataUrl = `data:${mimeType};base64,${asset.base64}`;

  const { url } = await api.uploadImage(dataUrl);
  return url;
}

/**
 * Opens the device's FRONT camera (not the photo library - see
 * SelfieDogrulama.tsx) so a verification selfie has to be taken live right
 * now, rather than picking an old photo. Uploads it the same way
 * `pickAndUploadImage` does. Returns the hosted URL, or `null` if cancelled.
 *
 * Throws ApiError on permission denial or upload failure.
 */
export async function takeAndUploadSelfie(): Promise<string | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    throw new ApiError('Selfie çekebilmemiz için kamera iznine ihtiyacımız var.', 0);
  }

  const result = await ImagePicker.launchCameraAsync({
    cameraType: ImagePicker.CameraType.front,
    quality: 0.7,
    base64: true,
    allowsEditing: true,
    aspect: [1, 1],
  });

  if (result.canceled || !result.assets?.[0]?.base64) return null;

  const asset = result.assets[0];
  const mimeType = asset.mimeType && asset.mimeType.startsWith('image/') ? asset.mimeType : 'image/jpeg';
  const dataUrl = `data:${mimeType};base64,${asset.base64}`;

  const { url } = await api.uploadImage(dataUrl);
  return url;
}

/**
 * Reads a local file URI (e.g. from expo-av's Audio.Recording.getURI()) into
 * a "data:<mime>;base64,..." string using fetch + Blob + FileReader, all of
 * which React Native polyfills without needing expo-file-system.
 */
export async function uriToDataUrl(uri: string): Promise<string> {
  const response = await fetch(uri);
  const blob = await response.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Dosya okunamadı.'));
    reader.onloadend = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
}

/** Uploads a recorded voice note (local file URI) and returns its hosted URL. */
export async function uploadRecordingUri(uri: string): Promise<string> {
  let dataUrl = await uriToDataUrl(uri);
  // RN's fetch/Blob polyfill sometimes can't infer a mime type for local
  // file:// URIs and returns "data:;base64,..." or an octet-stream mime -
  // expo-av's HIGH_QUALITY preset outputs .m4a on both platforms, so that's
  // a safe fallback the backend's upload route will accept.
  if (/^data:(;|application\/octet-stream;)base64,/.test(dataUrl)) {
    dataUrl = dataUrl.replace(/^data:[^;]*;base64,/, 'data:audio/m4a;base64,');
  }
  const { url } = await api.uploadAudio(dataUrl);
  return url;
}
