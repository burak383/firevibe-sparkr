import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, fonts, withAlpha } from '../theme';
import type { RootStackParamList } from '../navigation/RootNavigator';

type Tab = 'Deck' | 'Radar' | 'MyVibe';

const TABS: { key: Tab; icon: React.ComponentProps<typeof MaterialCommunityIcons>['name']; label: string }[] = [
  { key: 'Deck', icon: 'fire', label: 'Alev Destesi' },
  { key: 'Radar', icon: 'radar', label: 'Vibe Radar' },
  { key: 'MyVibe', icon: 'account', label: "Benim Vibe'ım" },
];

export default function MainTabBar({ active }: { active: Tab }) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  return (
    <View style={styles.tabBar}>
      {TABS.map((tab) => {
        const isActive = tab.key === active;
        return (
          <Pressable
            key={tab.key}
            accessibilityRole="button"
            accessibilityLabel={tab.label}
            onPress={() => {
              if (!isActive) navigation.navigate(tab.key);
            }}
            style={[styles.tab, isActive && styles.activeTab]}
          >
            <MaterialCommunityIcons
              name={tab.icon}
              size={21}
              color={isActive ? colors.primary : colors.mutedForeground}
            />
            <Text style={[styles.tabText, { color: isActive ? colors.primary : colors.mutedForeground }]}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
    padding: 8,
    borderRadius: 24,
    flexDirection: 'row',
    gap: 4,
    backgroundColor: withAlpha(colors.card, 0.97),
    borderWidth: 1,
    borderColor: colors.border,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
    borderRadius: 16,
  },
  activeTab: {
    backgroundColor: colors.muted,
  },
  tabText: {
    fontFamily: fonts.body,
    fontSize: 10,
    fontWeight: '800',
  },
});
