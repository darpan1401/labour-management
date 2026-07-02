import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomTabBar, BottomTabItem } from '../components/BottomTabBar';
import { NewClientInput } from '../lib/clients';
import { colors, radius, spacing, cardShadow } from '../theme';
import { ClientProfile } from '../types';

type AdminTabKey = 'dashboard' | 'users' | 'activity';
type UserFilter = 'all' | 'active' | 'inactive';

const adminTabs: Array<BottomTabItem<AdminTabKey>> = [
  { key: 'dashboard', label: 'Dashboard', icon: 'home', iconOutline: 'home-outline' },
  { key: 'users', label: 'Sheet Users', icon: 'people', iconOutline: 'people-outline' },
  { key: 'activity', label: 'Activity Log', icon: 'time', iconOutline: 'time-outline' },
];

export function AdminScreen({
  clients,
  currentAdmin,
  onAddClient,
  onToggleClientActive,
  onLogout,
}: {
  clients: ClientProfile[];
  currentAdmin: ClientProfile;
  onAddClient: (client: NewClientInput) => Promise<void>;
  onToggleClientActive: (client: ClientProfile, active: boolean) => Promise<void>;
  onLogout: () => Promise<void>;
}) {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<AdminTabKey>('users');
  const clientRows = useMemo(() => clients.filter((item) => item.role === 'client'), [clients]);

  return (
    <View style={styles.safeArea}>
      <StatusBar style="light" />
      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <View style={styles.headerLeft}>
          <View style={styles.avatarCircle}>
            <MaterialCommunityIcons name="account-hard-hat" size={26} color={colors.accent} />
          </View>
          <View style={styles.headerTextWrap}>
            <Text style={styles.headerTitle}>APP ADMIN</Text>
            <Text style={styles.headerSubtitle}>Manage sheet users & access</Text>
          </View>
        </View>
        <Pressable style={styles.logoutCircle} onPress={onLogout}>
          <Ionicons name="log-out-outline" size={20} color={colors.accent} />
        </Pressable>
      </View>

      <View style={styles.panel}>
        {activeTab === 'dashboard' ? <AdminDashboardTab clients={clientRows} /> : null}
        {activeTab === 'users' ? (
          <SheetUsersTab clients={clientRows} onAddClient={onAddClient} onToggleClientActive={onToggleClientActive} />
        ) : null}
        {activeTab === 'activity' ? <ActivityLogTab clients={clientRows} /> : null}
      </View>

      <BottomTabBar tabs={adminTabs} activeKey={activeTab} onChange={setActiveTab} bottomInset={insets.bottom} />
    </View>
  );
}

function AdminDashboardTab({ clients }: { clients: ClientProfile[] }) {
  const total = clients.length;
  const active = clients.filter((item) => item.active).length;
  const inactive = total - active;
  const loggedIn = clients.filter((item) => item.active && item.loggedIn).length;

  const stats: Array<{ key: string; label: string; value: number; icon: keyof typeof Ionicons.glyphMap; tint: string; tintBg: string }> = [
    { key: 'total', label: 'Total Users', value: total, icon: 'people-outline', tint: colors.primary, tintBg: colors.chipInactiveBg },
    { key: 'active', label: 'Active Users', value: active, icon: 'checkmark-circle-outline', tint: colors.success, tintBg: colors.successBg },
    { key: 'inactive', label: 'Inactive Users', value: inactive, icon: 'close-circle-outline', tint: colors.danger, tintBg: colors.dangerBg },
    { key: 'loggedIn', label: 'Logged In Now', value: loggedIn, icon: 'log-in-outline', tint: colors.accentDark, tintBg: colors.accentLight },
  ];

  const recent = [...clients]
    .filter((item) => item.lastLoginAt)
    .sort((a, b) => new Date(b.lastLoginAt || 0).getTime() - new Date(a.lastLoginAt || 0).getTime())
    .slice(0, 4);

  return (
    <ScrollView contentContainerStyle={styles.dashboardScroll}>
      <Text style={styles.sectionTitle}>Overview</Text>
      <View style={styles.statGrid}>
        {stats.map((stat) => (
          <View key={stat.key} style={styles.statCard}>
            <View style={[styles.statIconWrap, { backgroundColor: stat.tintBg }]}>
              <Ionicons name={stat.icon} size={18} color={stat.tint} />
            </View>
            <Text style={styles.statValue}>{stat.value}</Text>
            <Text style={styles.statLabel}>{stat.label}</Text>
          </View>
        ))}
      </View>

      <Text style={[styles.sectionTitle, { marginTop: spacing.lg }]}>Recent Activity</Text>
      {recent.length === 0 ? (
        <Text style={styles.emptyText}>No recent activity yet.</Text>
      ) : (
        recent.map((item) => (
          <View key={item.userId} style={styles.recentRow}>
            <View style={styles.avatarSmall}>
              <Text style={styles.avatarSmallText}>{getInitials(item.contractorName)}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.recentName} numberOfLines={1}>{item.contractorName}</Text>
              <Text style={styles.recentMeta} numberOfLines={1}>{formatSheetDate(item.lastLoginAt)}</Text>
            </View>
            <StatusDot active={Boolean(item.loggedIn)} />
          </View>
        ))
      )}
    </ScrollView>
  );
}

function SheetUsersTab({
  clients,
  onAddClient,
  onToggleClientActive,
}: {
  clients: ClientProfile[];
  onAddClient: (client: NewClientInput) => Promise<void>;
  onToggleClientActive: (client: ClientProfile, active: boolean) => Promise<void>;
}) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<UserFilter>('all');
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const [activeOverrides, setActiveOverrides] = useState<Record<string, boolean>>({});
  const cleanSearch = search.trim().toLowerCase();

  const clientRows = clients
    .filter((item) => {
      const isActive = activeOverrides[item.userId] ?? item.active;
      if (filter === 'active') return isActive;
      if (filter === 'inactive') return !isActive;
      return true;
    })
    .filter((item) => {
      if (!cleanSearch) return true;
      return [item.contractorName, item.userId, item.id, item.phoneNumber, item.contractorTitle]
        .join(' ')
        .toLowerCase()
        .includes(cleanSearch);
    });

  async function toggleActive(item: ClientProfile, active: boolean) {
    setActiveOverrides((current) => ({ ...current, [item.userId]: active }));
    setUpdatingUserId(item.userId);
    try {
      await onToggleClientActive(item, active);
      setActiveOverrides((current) => {
        const next = { ...current };
        delete next[item.userId];
        return next;
      });
    } catch (error: any) {
      setActiveOverrides((current) => {
        const next = { ...current };
        delete next[item.userId];
        return next;
      });
      Alert.alert('Update failed', String(error?.message ?? error));
    } finally {
      setUpdatingUserId(null);
    }
  }

  function cycleFilter() {
    setFilter((current) => (current === 'all' ? 'active' : current === 'active' ? 'inactive' : 'all'));
  }

  return (
    <View style={styles.usersTab}>
      <View style={styles.toolbar}>
        <Text style={styles.panelTitle}>Sheet Users</Text>
        <Pressable style={styles.addButton} onPress={() => setAddUserOpen(true)}>
          <Ionicons name="person-add-outline" size={16} color="#FFFFFF" />
          <Text style={styles.addButtonText}>Add User</Text>
        </Pressable>
      </View>

      <View style={styles.searchRow}>
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={16} color={colors.textMuted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="Search user by name, email or mobile..."
            placeholderTextColor={colors.textMuted}
            style={styles.searchInput}
          />
        </View>
        <Pressable
          style={[styles.filterButton, filter !== 'all' && styles.filterButtonActive]}
          onPress={cycleFilter}
        >
          <Ionicons name="options-outline" size={18} color={filter !== 'all' ? '#FFFFFF' : colors.primary} />
        </Pressable>
      </View>
      {filter !== 'all' ? (
        <Text style={styles.filterHint}>Showing {filter === 'active' ? 'active' : 'inactive'} users only. Tap the filter icon to change.</Text>
      ) : null}

      <FlatList
        data={clientRows}
        keyExtractor={(item) => item.userId}
        contentContainerStyle={{ paddingBottom: spacing.lg }}
        ListEmptyComponent={<Text style={styles.emptyText}>No client users found.</Text>}
        renderItem={({ item }) => {
          const isActive = activeOverrides[item.userId] ?? item.active;
          const isLoggedIn = isActive ? item.loggedIn : false;

          return (
            <View style={styles.userCard}>
              <View style={styles.userCardTop}>
                <View style={styles.userAvatar}>
                  <Text style={styles.userAvatarText}>{getInitials(item.contractorName)}</Text>
                </View>
                <View style={styles.userNameWrap}>
                  <Text style={styles.userName} numberOfLines={1}>{item.contractorName}</Text>
                  <Text style={styles.userSub} numberOfLines={1}>{item.userId}</Text>
                </View>
                <View style={styles.userTopRight}>
                  <View style={[styles.statusPill, isActive ? styles.statusPillActive : styles.statusPillInactive]}>
                    <Text style={isActive ? styles.statusPillTextActive : styles.statusPillTextInactive}>
                      {isActive ? 'Active' : 'Inactive'}
                    </Text>
                  </View>
                  <Switch
                    value={isActive}
                    onValueChange={(nextValue) => toggleActive(item, nextValue)}
                    disabled={updatingUserId === item.userId}
                    trackColor={{ false: colors.dangerBorder, true: colors.successBg }}
                    thumbColor={isActive ? colors.success : colors.danger}
                  />
                  <Pressable
                    hitSlop={8}
                    onPress={() => Alert.alert(item.contractorName, 'Edit or remove options are coming soon.')}
                  >
                    <Ionicons name="ellipsis-vertical" size={16} color={colors.textMuted} />
                  </Pressable>
                </View>
              </View>

              <View style={styles.userInfoList}>
                <InfoRow icon="mail-outline" text={`${item.userId}@1234`} />
                <InfoRow icon="business-outline" text={item.contractorTitle} />
                <InfoRow icon="call-outline" text={item.phoneNumber || '-'} />
              </View>

              <View style={styles.userDivider} />

              <View style={styles.loginStatusRow}>
                <Text style={styles.loginStatusText}>{isLoggedIn ? 'Logged in' : 'Not logged in'}</Text>
                <StatusDot active={Boolean(isLoggedIn)} />
              </View>
              <InfoRow icon="phone-portrait-outline" text={item.lastDeviceId || 'No device registered'} />
              <InfoRow icon="time-outline" text={formatSheetDate(item.lastLoginAt)} />

              <View style={styles.noteBanner}>
                <Ionicons name="information-circle-outline" size={15} color={colors.warning} />
                <Text style={styles.noteText}>Users sync from Google Sheet when online.</Text>
              </View>
            </View>
          );
        }}
      />

      <AddUserModal visible={addUserOpen} onClose={() => setAddUserOpen(false)} onAdd={onAddClient} />
    </View>
  );
}

function ActivityLogTab({ clients }: { clients: ClientProfile[] }) {
  const rows = [...clients].sort((a, b) => {
    const aTime = a.lastLoginAt ? new Date(a.lastLoginAt).getTime() : 0;
    const bTime = b.lastLoginAt ? new Date(b.lastLoginAt).getTime() : 0;
    return bTime - aTime;
  });

  return (
    <View style={styles.usersTab}>
      <View style={styles.toolbar}>
        <Text style={styles.panelTitle}>Activity Log</Text>
      </View>
      <FlatList
        data={rows}
        keyExtractor={(item) => item.userId}
        contentContainerStyle={{ paddingBottom: spacing.lg }}
        ListEmptyComponent={<Text style={styles.emptyText}>No activity yet.</Text>}
        renderItem={({ item }) => (
          <View style={styles.activityRow}>
            <View style={styles.avatarSmall}>
              <Text style={styles.avatarSmallText}>{getInitials(item.contractorName)}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.recentName} numberOfLines={1}>{item.contractorName}</Text>
              <Text style={styles.recentMeta} numberOfLines={1}>
                {item.active ? (item.loggedIn ? 'Logged in' : 'Not logged in') : 'Access disabled'} · {formatSheetDate(item.lastLoginAt)}
              </Text>
            </View>
            <StatusDot active={Boolean(item.active && item.loggedIn)} />
          </View>
        )}
      />
    </View>
  );
}

function InfoRow({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon} size={14} color={colors.textMuted} />
      <Text style={styles.infoRowText} numberOfLines={1}>{text}</Text>
    </View>
  );
}

function StatusDot({ active }: { active: boolean }) {
  return <View style={[styles.statusDot, { backgroundColor: active ? colors.success : colors.textMuted }]} />;
}

function AddUserModal({
  visible,
  onClose,
  onAdd,
}: {
  visible: boolean;
  onClose: () => void;
  onAdd: (client: NewClientInput) => Promise<void>;
}) {
  const [userId, setUserId] = useState('');
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [contractorName, setContractorName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [contractorTitle, setContractorTitle] = useState('');
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);

  function resetForm() {
    setUserId('');
    setLoginId('');
    setPassword('');
    setContractorName('');
    setPhoneNumber('');
    setContractorTitle('');
    setActive(true);
  }

  async function submit() {
    if (!userId.trim() || !loginId.trim() || !password.trim() || !contractorName.trim() || !contractorTitle.trim()) {
      Alert.alert('Missing details', 'Please fill user ID, login ID, password, contractor name and contractor title.');
      return;
    }

    setSaving(true);
    try {
      await onAdd({
        userId: userId.trim(),
        loginId: loginId.trim(),
        password: password.trim(),
        contractorName: contractorName.trim(),
        phoneNumber: phoneNumber.trim(),
        contractorTitle: contractorTitle.trim(),
        active,
      });
      resetForm();
      onClose();
    } catch (error: any) {
      Alert.alert('Add user failed', String(error?.message ?? error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <KeyboardAvoidingView style={styles.modalKeyboardWrap} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView contentContainerStyle={styles.modalScrollContent} keyboardShouldPersistTaps="handled">
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <View style={styles.modalHeaderLeft}>
                  <View style={styles.modalHeaderIcon}>
                    <Ionicons name="person-add-outline" size={18} color={colors.accent} />
                  </View>
                  <Text style={styles.modalTitle}>Add User</Text>
                </View>
                <Pressable style={styles.closeButton} onPress={onClose}>
                  <Ionicons name="close" size={18} color={colors.primary} />
                </Pressable>
              </View>

              <TextInput value={userId} onChangeText={setUserId} placeholder="User Id" placeholderTextColor={colors.textMuted} style={styles.formInput} />
              <TextInput value={loginId} onChangeText={setLoginId} placeholder="Login ID" placeholderTextColor={colors.textMuted} autoCapitalize="none" style={styles.formInput} />
              <TextInput value={password} onChangeText={setPassword} placeholder="Password" placeholderTextColor={colors.textMuted} autoCapitalize="none" style={styles.formInput} />
              <TextInput value={contractorName} onChangeText={setContractorName} placeholder="Contractor Name" placeholderTextColor={colors.textMuted} style={styles.formInput} />
              <TextInput value={phoneNumber} onChangeText={setPhoneNumber} placeholder="Phone Number" placeholderTextColor={colors.textMuted} keyboardType="phone-pad" style={styles.formInput} />
              <TextInput value={contractorTitle} onChangeText={setContractorTitle} placeholder="Contractor Title" placeholderTextColor={colors.textMuted} style={styles.formInput} />

              <View style={styles.formToggleRow}>
                <Text style={active ? styles.statusPillTextActive : styles.statusPillTextInactive}>
                  Active: {active ? '1' : '0'}
                </Text>
                <Switch
                  value={active}
                  onValueChange={setActive}
                  trackColor={{ false: colors.dangerBorder, true: colors.successBg }}
                  thumbColor={active ? colors.success : colors.danger}
                />
              </View>

              <Pressable style={[styles.modalSubmit, saving && styles.modalSubmitDisabled]} onPress={submit} disabled={saving}>
                <Ionicons name="checkmark" size={18} color="#FFFFFF" />
                <Text style={styles.modalSubmitText}>{saving ? 'Adding...' : 'Add Client User'}</Text>
              </Pressable>

              {saving ? (
                <View style={styles.loadingOverlay} pointerEvents="auto">
                  <View style={styles.loadingCard}>
                    <ActivityIndicator size="large" color={colors.primary} />
                    <Text style={styles.loadingText}>Adding user...</Text>
                  </View>
                </View>
              ) : null}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function getInitials(name: string) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
}

function formatSheetDate(value?: string) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-IN', { day: 'numeric', month: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.primary,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  headerLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minWidth: 0,
  },
  avatarCircle: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 2,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  headerSubtitle: {
    color: '#C7DAD3',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  logoutCircle: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  panel: {
    flex: 1,
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    marginTop: -16,
    ...cardShadow,
  },
  usersTab: {
    flex: 1,
    padding: spacing.md,
  },
  dashboardScroll: {
    padding: spacing.md,
    paddingBottom: spacing.xl,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  panelTitle: {
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: '900',
  },
  addButton: {
    minHeight: 42,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    flexDirection: 'row',
    gap: 6,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  searchWrap: {
    flex: 1,
    minHeight: 46,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  filterButton: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterHint: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  emptyText: {
    color: colors.textMuted,
    textAlign: 'center',
    padding: 18,
  },
  userCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
    marginTop: spacing.xs,
    ...cardShadow,
  },
  userCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  userAvatar: {
    width: 42,
    height: 42,
    borderRadius: radius.pill,
    backgroundColor: colors.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userAvatarText: {
    color: colors.accentDark,
    fontWeight: '900',
  },
  userNameWrap: {
    flex: 1,
    minWidth: 0,
  },
  userName: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '900',
  },
  userSub: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  userTopRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusPill: {
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusPillActive: {
    backgroundColor: colors.successBg,
  },
  statusPillInactive: {
    backgroundColor: colors.dangerBg,
  },
  statusPillTextActive: {
    color: colors.success,
    fontWeight: '900',
    fontSize: 12,
  },
  statusPillTextInactive: {
    color: colors.danger,
    fontWeight: '900',
    fontSize: 12,
  },
  userInfoList: {
    marginTop: spacing.sm,
    gap: 4,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  infoRowText: {
    color: colors.textSecondary,
    fontWeight: '700',
    fontSize: 13,
    flexShrink: 1,
  },
  userDivider: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginVertical: spacing.sm,
  },
  loginStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  loginStatusText: {
    color: colors.textPrimary,
    fontWeight: '900',
    fontSize: 13,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  noteBanner: {
    marginTop: spacing.sm,
    backgroundColor: colors.warningBg,
    borderRadius: radius.md,
    paddingVertical: 8,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  noteText: {
    color: colors.warning,
    fontSize: 12,
    fontWeight: '800',
    flexShrink: 1,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '900',
    marginBottom: spacing.sm,
  },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  statCard: {
    width: '47%',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    ...cardShadow,
  },
  statIconWrap: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  statValue: {
    color: colors.textPrimary,
    fontSize: 24,
    fontWeight: '900',
  },
  statLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    marginTop: spacing.xs,
  },
  avatarSmall: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarSmallText: {
    color: colors.accentDark,
    fontWeight: '900',
    fontSize: 12,
  },
  recentName: {
    color: colors.textPrimary,
    fontWeight: '900',
    fontSize: 14,
  },
  recentMeta: {
    color: colors.textSecondary,
    fontWeight: '600',
    fontSize: 12,
    marginTop: 2,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  modalKeyboardWrap: {
    width: '100%',
  },
  modalScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  modalCard: {
    width: '100%',
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
    ...cardShadow,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  modalHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  modalHeaderIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    backgroundColor: colors.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '900',
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: colors.chipInactiveBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formInput: {
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  formToggleRow: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
    marginBottom: spacing.md,
  },
  modalSubmit: {
    minHeight: 52,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  modalSubmitDisabled: {
    backgroundColor: '#8FA19A',
  },
  modalSubmitText: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(243, 246, 241, 0.82)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    borderRadius: radius.xl,
  },
  loadingCard: {
    minWidth: 160,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    paddingHorizontal: 22,
    ...cardShadow,
  },
  loadingText: {
    color: colors.primary,
    fontWeight: '900',
    marginTop: 12,
  },
});