import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, cardShadow } from '../theme';
import { ClientProfile, Labour } from '../types';

type Props = {
  labours: Labour[];
  client: ClientProfile;
};

export function DashboardScreen({ labours, client }: Props) {
  return (
    <View style={styles.screen}>
      <View style={styles.hero}>
        <View style={styles.heroTop}>
          <View style={styles.heroIconWrap}>
            <MaterialCommunityIcons name="account-hard-hat" size={26} color={colors.accent} />
          </View>
          <View style={styles.heroTextWrap}>
            <Text style={styles.heroSubtitle}>Keep your team updated</Text>
            <Text style={styles.heroCount}>{labours.length}</Text>
          </View>
        </View>
        <Text style={styles.heroLabel}>Total Labourers Added</Text>
        <MaterialCommunityIcons
          name="account-hard-hat"
          size={110}
          color="rgba(255,255,255,0.08)"
          style={styles.heroWatermark}
        />
      </View>

      <View style={styles.panel}>
        <View style={styles.panelHeader}>
          <View>
            <Text style={styles.panelTitle}>Added Labourers</Text>
            <View style={styles.panelUnderline} />
          </View>
          <View style={styles.panelCountBadge}>
            <Text style={styles.panelCountText}>{labours.length}</Text>
          </View>
        </View>
        <FlatList
          data={labours}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={labours.length ? undefined : styles.emptyWrap}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="people-outline" size={30} color={colors.textMuted} />
              <Text style={styles.emptyText}>No labourers have been added yet.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{item.name.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={styles.info}>
                <Text numberOfLines={1} style={styles.name}>{item.name}</Text>
                <Text numberOfLines={1} style={styles.phone}>{item.phone}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </View>
          )}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.lg,
  },
  hero: {
    backgroundColor: colors.primary,
    borderRadius: radius.xl,
    padding: spacing.xl,
    overflow: 'hidden',
    ...cardShadow,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  heroIconWrap: {
    width: 46,
    height: 46,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTextWrap: {
    flex: 1,
  },
  heroSubtitle: {
    color: '#C7DAD3',
    fontSize: 13,
    fontWeight: '700',
  },
  heroCount: {
    color: colors.accent,
    fontSize: 52,
    fontWeight: '900',
    marginTop: 2,
  },
  heroLabel: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    marginTop: spacing.sm,
  },
  heroWatermark: {
    position: 'absolute',
    right: -10,
    bottom: -18,
  },
  panel: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    marginTop: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...cardShadow,
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    padding: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  panelTitle: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: '900',
  },
  panelUnderline: {
    width: 30,
    height: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    marginTop: 6,
  },
  panelCountBadge: {
    minWidth: 28,
    height: 28,
    borderRadius: radius.pill,
    backgroundColor: colors.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  panelCountText: {
    color: colors.accentDark,
    fontWeight: '900',
    fontSize: 13,
  },
  emptyWrap: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  empty: {
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.xl,
  },
  emptyText: {
    color: colors.textMuted,
    textAlign: 'center',
  },
  row: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  avatar: {
    height: 42,
    width: 42,
    borderRadius: radius.pill,
    backgroundColor: colors.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: colors.accentDark,
    fontWeight: '900',
  },
  info: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '800',
  },
  phone: {
    color: colors.textSecondary,
    marginTop: 3,
    fontSize: 12,
    fontWeight: '600',
  },
});