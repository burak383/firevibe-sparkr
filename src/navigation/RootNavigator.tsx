import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer, DarkTheme, Theme as NavTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { useAuth } from '../context/AuthContext';
import { colors } from '../theme';

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
};

const Stack = createNativeStackNavigator<RootStackParamList>();

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

  if (initializing) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer theme={navTheme}>
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
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
