import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, cardShadow } from '../theme';

export type BottomTabItem<TKey extends string> = {
  key: TKey;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconOutline?: keyof typeof Ionicons.glyphMap;
};

type Props<TKey extends string> = {
  tabs: Array<BottomTabItem<TKey>>;
  activeKey: TKey;
  onChange: (key: TKey) => void;
  bottomInset?: number;
};

export function BottomTabBar<TKey extends string>({ tabs, activeKey, onChange, bottomInset = 0 }: Props<TKey>) {
  return (
    <View style={[styles.shell, { paddingBottom: Math.max(bottomInset, 10) }]}>
      {tabs.map((tab) => {
        const active = tab.key === activeKey;
        const iconName = active ? tab.icon : tab.iconOutline ?? tab.icon;

        return (
          <Pressable key={String(tab.key)} onPress={() => onChange(tab.key)} style={styles.tabPressable}>
            <View style={[styles.tabItem, active && styles.tabItemActive]}>
              <View style={[styles.iconWrap, active && styles.iconWrapActive]}>
                <Ionicons name={iconName} size={20} color={active ? colors.accent : colors.textMuted} />
              </View>
              <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>
                {tab.label}
              </Text>
              {active ? <View style={styles.activeIndicator} /> : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: colors.primary,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    ...cardShadow,
    shadowOpacity: 0.16,
    elevation: 8,
  },
  tabPressable: {
    flex: 1,
    paddingHorizontal: 4,
  },
  tabItem: {
    minHeight: 64,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
  },
  tabItemActive: {
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  iconWrapActive: {
    backgroundColor: 'rgba(232, 121, 45, 0.14)',
  },
  label: {
    color: '#C7DAD3',
    fontSize: 12,
    fontWeight: '800',
  },
  labelActive: {
    color: colors.accent,
    fontWeight: '900',
  },
  activeIndicator: {
    width: 26,
    height: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    marginTop: 2,
  },
});
