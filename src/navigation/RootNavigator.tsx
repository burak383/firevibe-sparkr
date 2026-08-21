import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import {
  NavigationContainer,
  DarkTheme,
  Theme as NavTheme,
  createNavigationContainerRef,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { useAuth } from '../context/AuthContext';
import { colors } from '../theme';
import { registerForPushNotifications, addNotificationResponseListener } from '../utils/push';
import { configurePurchases } from '../utils/subscription';

import LoginScreen from '../screens/Giri';
import RegisterScreen from '../screens/KayTOl';
import ForgotPasswordScreen from '../screens/IfremiUnuttum';
import VibeSetupScreen from '../screens/VibeKurulumu';
import DeckScreen from '../screens/AlevDestesi';
import RadarScreen from '../screens/VibeRadar';
import MyVibeScreen from '../screens/BenimVibeM';
import MatchScreen from '../screens/BuBirVibe';
import ChatScreen from '../screens/DenizIleSohbet';
import EditProfileScreen from '../screens/Profil';
import ViewProfileScreen from '../screens/ProfilGoruntule';
import SecurityCenterScreen from '../screens/GuvenlikMerkezi';
import SelfieVerificationScreen from '../screens/SelfieDogrulama';
import PremiumScreen from '../screens/Premium';

export type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  ForgotPassword: undefined;
  VibeSetup: undefined;
  Deck: undefined;
  Radar: undefined;
  MyVibe: undefined;
  Match: { matchId: number };
  Chat: { matchId: number };
  // `openBlockedList` lets other screens (e.g. BenimVibeM's "Engellenen
  // kişiler" row) deep-link straight into the real blocked-users modal
  // instead of faking a static "list is empty" message.
  EditProfile: { openBlockedList?: boolean } | undefined;
  // Read-only view of someone ELSE's profile - reached from the deck's
  // "Profili aç", a match's "Profili Gör", and radar's nearby avatars.
  ViewProfile: { userId: number };
  // KVKK Aydınlatma Metni, Topluluk İlkeleri, and the account-deletion danger
  // zone - reached from EditProfile's "Güvenlik merkezi" row.
  Security: undefined;
  // Live-camera selfie capture that flips on the "verified" badge - reached
  // from EditProfile's verification notice when the account isn't verified.
  SelfieVerify: undefined;
  // Paywall for the daily free-swipe limit - reached from the deck's
  // remaining-count badge, or automatically when a like/superlike gets a
  // 402 (limit reached) response.
  Premium: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

// Lets code outside the component tree (utils/push.ts's notification-tap
// handler) navigate without needing a prop-drilled navigation object.
export const navigationRef = createNavigationContainerRef<RootStackParamList>();

const navTheme: NavTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.background,
    card: colors.card,
    text: colors.foreground,
    border: colors.border,
    primary: colors.primary,
  },
};

export default function RootNavigator() {
  const { user, initializing } = useAuth();

  // Only register once the full app stack is actually reachable (logged in
  // + onboarding done) - that's also exactly when "navigate to Match/Chat"
  // below is meaningful, since those screens aren't mounted before that.
  const canReceivePush = !!user && user.onboardingComplete;

  useEffect(() => {
    if (!canReceivePush) return;
    registerForPushNotifications();
  }, [canReceivePush]);

  useEffect(() => {
    if (!user || !user.onboardingComplete) return;
    configurePurchases(user.id);
  }, [user?.id, user?.onboardingComplete]);

  useEffect(() => {
    if (!canReceivePush) return;
    const subscription = addNotificationResponseListener({
      onMatch: (matchId) => {
        if (navigationRef.isReady()) navigationRef.navigate('Match', { matchId });
      },
      onMessage: (matchId) => {
        if (navigationRef.isReady()) navigationRef.navigate('Chat', { matchId });
      },
    });
    return () => subscription.remove();
  }, [canReceivePush]);

  if (initializing) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer ref={navigationRef} theme={navTheme}>
      <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
        {!user ? (
          <>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Register" component={RegisterScreen} />
            <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
          </>
        ) : !user.onboardingComplete ? (
          <Stack.Screen name="VibeSetup" component={VibeSetupScreen} />
        ) : (
          <>
            <Stack.Screen name="Deck" component={DeckScreen} />
            <Stack.Screen name="Radar" component={RadarScreen} />
            <Stack.Screen name="MyVibe" component={MyVibeScreen} />
            <Stack.Screen name="Match" component={MatchScreen} />
            <Stack.Screen name="Chat" component={ChatScreen} />
            <Stack.Screen name="EditProfile" component={EditProfileScreen} />
            <Stack.Screen name="ViewProfile" component={ViewProfileScreen} />
            <Stack.Screen name="Security" component={SecurityCenterScreen} />
            <Stack.Screen name="SelfieVerify" component={SelfieVerificationScreen} />
            <Stack.Screen name="Premium" component={PremiumScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
