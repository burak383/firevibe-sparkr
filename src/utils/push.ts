import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { api } from '../api/client';

// Shows notifications with an alert + sound even while the app is open in
// the foreground - otherwise a message/match that arrives while you're
// looking at a different screen would land silently.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Registers this device for push and sends the Expo push token to our
// backend, so /api/discovery/swipe (new match) and
// /api/matches/:id/messages (new message) can notify the OTHER person even
// when their app is closed - see backend/src/push.js.
//
// IMPORTANT CAVEAT: as of Expo SDK 53+, Expo Go no longer supports push
// notifications AT ALL, on either platform - this only actually delivers
// anything once the app is running from a development or production build
// made with EAS (`eas build`), not from Expo Go. In Expo Go (and before an
// EAS project id exists) this fails and is caught below, so it just quietly
// no-ops - there's nothing to register a token FOR yet in that case.
export async function registerForPushNotifications(): Promise<void> {
  try {
    if (!Device.isDevice) return; // simulators/emulators can't receive push

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.HIGH,
      });
    }

    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== 'granted') {
      const requested = await Notifications.requestPermissionsAsync();
      status = requested.status;
    }
    if (status !== 'granted') return;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    const { data: token } = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    if (token) await api.registerPushToken(token);
  } catch (err) {
    console.log('[push] Registration skipped:', err instanceof Error ? err.message : err);
  }
}

interface PushNotificationData {
  type?: 'match' | 'message';
  matchId?: number;
}

// Fires when the user taps a notification (app was backgrounded or fully
// closed). Kept independent of the navigation tree - the caller (see
// RootNavigator.tsx) just tells us where "a match" / "a message" should go.
export function addNotificationResponseListener(handlers: {
  onMatch?: (matchId: number) => void;
  onMessage?: (matchId: number) => void;
}) {
  return Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data as PushNotificationData | undefined;
    if (!data?.matchId) return;
    if (data.type === 'match') handlers.onMatch?.(data.matchId);
    else if (data.type === 'message') handlers.onMessage?.(data.matchId);
  });
}
