import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { StatusBar } from 'expo-status-bar';
import * as SQLite from 'expo-sqlite';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomTabBar, BottomTabItem } from './src/components/BottomTabBar';
import {
  NewClientInput,
  addClientToSheety,
  findClientByCredentials,
  findClientById,
  loadClientsFromSheety,
  updateClientActiveState,
  updateClientLoginState,
} from './src/lib/clients';
import {
  clearStoredClientId,
  deleteAppSetting,
  getAppSetting,
  getOrCreateDeviceId,
  getLabours,
  getStoredClientId,
  openAppDatabase,
  saveStoredClientId,
  setAppSetting,
} from './src/lib/db';
import { AdminScreen } from './src/screens/AdminScreen';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { LaboursScreen } from './src/screens/LaboursScreen';
import { ReportsScreen } from './src/screens/ReportsScreen';
import { colors, radius, spacing, cardShadow } from './src/theme';
import { ClientProfile, Labour, TabKey } from './src/types';

const tabs: Array<BottomTabItem<TabKey>> = [
  { key: 'dashboard', label: 'Home', icon: 'home', iconOutline: 'home-outline' },
  { key: 'labours', label: 'Labour', icon: 'people', iconOutline: 'people-outline' },
  { key: 'reports', label: 'Report', icon: 'document-text', iconOutline: 'document-text-outline' },
];

const updateCheckConfig = {
  owner: 'darpan1401',
  repo: 'labour-management',
};

const githubToken = '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';

const pendingUpdateBuildKey = 'pending_update_build';

const androidIntentFlags = {
  grantReadUriPermission: 1,
  activityNewTask: 268435456,
};

const apkMimeType = 'application/vnd.android.package-archive';

export default function App() {
  return (
    <SafeAreaProvider>
      <AppShell />
    </SafeAreaProvider>
  );
}

function AppShell() {
  const insets = useSafeAreaInsets();
  const [db, setDb] = useState<SQLite.SQLiteDatabase | null>(null);
  const [labours, setLabours] = useState<Labour[]>([]);
  const [clients, setClients] = useState<ClientProfile[]>([]);
  const [client, setClient] = useState<ClientProfile | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');
  const [profileOpen, setProfileOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [updateCandidate, setUpdateCandidate] = useState<AppUpdateCandidate | null>(null);
  const [updatePhase, setUpdatePhase] = useState<'idle' | 'available' | 'downloading' | 'launching' | 'error'>('idle');
  const [updateMessage, setUpdateMessage] = useState('');
  const currentBuildNumber = Number(Constants.expoConfig?.extra?.appBuildNumber ?? 0);

  useEffect(() => {
    fetchLatestAppUpdate(currentBuildNumber)
      .then((candidate) => {
        if (!candidate) return;
        setUpdateCandidate(candidate);
        setUpdatePhase('available');
        setUpdateMessage(`Version ${candidate.buildNumber} is ready to install.`);
      })
      .catch(() => {});
  }, [currentBuildNumber]);

  useEffect(() => {
    const database = db;
    if (!database || !currentBuildNumber || !Number.isFinite(currentBuildNumber)) return;

    async function confirmInstalledUpdate() {
      const pendingBuildValue = await getAppSetting(database!, pendingUpdateBuildKey);
      if (!pendingBuildValue) return;

      const pendingBuild = Number(pendingBuildValue);
      if (!Number.isFinite(pendingBuild) || pendingBuild <= 0) return;

      if (currentBuildNumber > pendingBuild) {
        await deleteAppSetting(database!, pendingUpdateBuildKey);
        Alert.alert('Update installed', `Version ${currentBuildNumber} is now running.`);
      }
    }

    confirmInstalledUpdate().catch(() => {});
  }, [currentBuildNumber, db]);

  useEffect(() => {
    async function boot() {
      const database = await openAppDatabase();
      const loadedClients = await loadClientsFromSheety();
      const deviceId = await getOrCreateDeviceId(database);
      const storedClientId = await getStoredClientId(database);
      const storedClient = storedClientId ? findClientById(loadedClients, storedClientId) : null;
      const storedClientAllowed = storedClient ? canUseDevice(loadedClients, storedClient, deviceId) : false;
      if (storedClient && (!storedClient.active || !storedClientAllowed)) {
        await clearStoredClientId(database);
      }
      setDb(database);
      setClients(loadedClients);
      if (storedClient?.active && storedClientAllowed) {
        if (!storedClient.lastDeviceId) {
          await updateClientLoginState(storedClient, deviceId, true);
        }
        setClient({ ...storedClient, lastDeviceId: storedClient.lastDeviceId || deviceId, loggedIn: true });
      } else {
        setClient(null);
      }
      setLabours(await getLabours(database));
      setLoading(false);
    }

    boot().catch((error) => {
      setLoading(false);
      Alert.alert('App error', String(error?.message ?? error));
    });
  }, []);

  useEffect(() => {
    if (!db || !client) return undefined;

    const syncActiveStatus = async () => {
      const loadedClients = await loadClientsFromSheety();
      if (loadedClients.length === 0) return;

      setClients(loadedClients);
      const latestClient = findClientById(loadedClients, client.id);
      const deviceId = await getOrCreateDeviceId(db);
      if (!latestClient?.active) {
        await clearStoredClientId(db);
        setProfileOpen(false);
        setActiveTab('dashboard');
        setClient(null);
        Alert.alert('Access disabled', 'Your app access has been disabled by admin.');
        return;
      }

      if (!canUseDevice(loadedClients, latestClient, deviceId)) {
        await clearStoredClientId(db);
        setProfileOpen(false);
        setActiveTab('dashboard');
        setClient(null);
        Alert.alert('Device access removed', 'This user is registered on another device. Contact Admin.');
        return;
      }

      setClient(latestClient);
    };

    const timer = setInterval(() => {
      syncActiveStatus().catch(() => {});
    }, 15000);

    return () => clearInterval(timer);
  }, [db, client?.id]);

  async function reloadLabours() {
    if (!db) return;
    setLabours(await getLabours(db));
  }

  function renderTab() {
    if (!db || !client) return null;
    if (activeTab === 'dashboard') return <DashboardScreen labours={labours} client={client} />;
    if (activeTab === 'labours') return <LaboursScreen db={db} labours={labours} onChanged={reloadLabours} />;
    return <ReportsScreen db={db} labours={labours} client={client} />;
  }

  async function activateClient(clientToActivate: ClientProfile, latestClients?: ClientProfile[]) {
    if (!db) return;
    const deviceId = await getOrCreateDeviceId(db);
    const sourceClients = latestClients?.length ? latestClients : clients;
    const latestClient = findClientById(sourceClients, clientToActivate.id) ?? clientToActivate;
    const activatedClient = { ...latestClient, lastDeviceId: deviceId, loggedIn: true };

    assertCanUseDevice(sourceClients, latestClient, deviceId);
    await saveStoredClientId(db, latestClient.id);
    setClients(sourceClients.map((currentClient) =>
      currentClient.userId === latestClient.userId
        ? activatedClient
        : currentClient,
    ));
    setClient(activatedClient);

    updateClientLoginState(latestClient, deviceId, true).catch(() => {});
  }

  async function logout() {
    if (!db) return;
    Alert.alert('Logout?', 'You will need to enter the client ID and password again.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: async () => {
          const deviceId = await getOrCreateDeviceId(db);
          await clearStoredClientId(db);
          setProfileOpen(false);
          setActiveTab('dashboard');
          setClient(null);
          if (client) {
            setClients((currentClients) =>
              currentClients.map((currentClient) =>
                currentClient.userId === client.userId
                  ? { ...currentClient, loggedIn: false }
                  : currentClient,
              ),
            );
            updateClientLoginState(client, deviceId, false).catch(() => {});
          }
        },
      },
    ]);
  }

  async function toggleClientActive(clientToUpdate: ClientProfile, active: boolean) {
    await updateClientActiveState(clientToUpdate, active);
    setClients((currentClients) =>
      currentClients.map((currentClient) =>
        currentClient.userId === clientToUpdate.userId
          ? { ...currentClient, active, loggedIn: active ? currentClient.loggedIn : false }
          : currentClient,
      ),
    );
  }

  async function addClient(input: NewClientInput) {
    await addClientToSheety(input);
    const loadedClients = await loadClientsFromSheety();
    setClients(loadedClients);
  }

  async function refreshClientsForLogin() {
    const loadedClients = await loadClientsFromSheety({ throwOnError: true });
    setClients(loadedClients);
    return loadedClients;
  }

  async function installAvailableUpdate() {
    if (!db || !updateCandidate) return;

    setUpdatePhase('downloading');
    setUpdateMessage('Downloading the APK...');

    try {
      await setAppSetting(db, pendingUpdateBuildKey, String(updateCandidate.buildNumber));
      await downloadAndInstallApk(updateCandidate.downloadUrl);
      setUpdatePhase('launching');
      setUpdateMessage('Installer opened. Finish the install in the Android system screen.');
    } catch (error: any) {
      setUpdatePhase('error');
      setUpdateMessage(`The APK could not be downloaded or installed: ${String(error?.message ?? error)}`);
      Alert.alert(
        'Update Failed',
        `The APK could not be downloaded or installed: ${String(error?.message ?? error)}\n\nIf Android shows an install blocked message, open Settings, allow this app to install unknown apps, and try again.`,
      );
    }
  }

  if (loading) {
    return (
      <View style={[styles.loading, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading Labour App...</Text>
      </View>
    );
  }

  if (!client) {
    return (
      <ActivationScreen
        clients={clients}
        dbReady={Boolean(db)}
        onRefreshClients={refreshClientsForLogin}
        onActivated={activateClient}
      />
    );
  }

  if (client.role === 'admin') {
    return (
      <AdminScreen
        clients={clients}
        currentAdmin={client}
        onAddClient={addClient}
        onToggleClientActive={toggleClientActive}
        onLogout={logout}
      />
    );
  }

  return (
    <View style={styles.safeArea}>
      <StatusBar style="light" />
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <View style={styles.headerText}>
          {activeTab === 'dashboard' ? (
            <Text style={styles.greeting}>
              Hello, <Text style={styles.greetingName}>{getFirstName(client.contractorName)}</Text>
            </Text>
          ) : null}
          <Text style={styles.title}>{client.contractorTitle}</Text>
        </View>
        <Pressable style={styles.profileButton} onPress={() => setProfileOpen(true)}>
          <MaterialCommunityIcons name="account-hard-hat" size={22} color={colors.accent} />
        </Pressable>
      </View>

      <View style={styles.body}>{renderTab()}</View>

      <BottomTabBar tabs={tabs} activeKey={activeTab} onChange={setActiveTab} bottomInset={insets.bottom} />
      <UpdateModal
        visible={Boolean(updateCandidate)}
        buildNumber={updateCandidate?.buildNumber ?? 0}
        currentBuildNumber={currentBuildNumber}
        message={updateMessage}
        phase={updatePhase}
        onInstall={installAvailableUpdate}
        onLater={() => setUpdateCandidate(null)}
      />
      <ProfileModal
        visible={profileOpen}
        client={client}
        onLogout={logout}
        onClose={() => setProfileOpen(false)}
      />
    </View>
  );
}

function ActivationScreen({
  clients,
  dbReady,
  onRefreshClients,
  onActivated,
}: {
  clients: ClientProfile[];
  dbReady: boolean;
  onRefreshClients: () => Promise<ClientProfile[]>;
  onActivated: (client: ClientProfile, latestClients?: ClientProfile[]) => Promise<void>;
}) {
  const insets = useSafeAreaInsets();
  const [clientId, setClientId] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  async function activate() {
    setSaving(true);
    try {
      const latestClients = await onRefreshClients();
      const sourceClients = latestClients.length ? latestClients : clients;
      const matchedClient = findClientByCredentials(sourceClients, clientId, password);
      if (!matchedClient) {
        Alert.alert('Invalid login', 'Please enter the correct client ID and password.');
        return;
      }

      await onActivated(matchedClient, sourceClients);
    } catch (error: any) {
      Alert.alert('Activation error', getLoginErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={[styles.activationScreen, { paddingTop: insets.top + 24, paddingBottom: Math.max(insets.bottom, 18) }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.activationScrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.activationLogoWrap}>
          <View style={styles.activationLogoCircle}>
            <MaterialCommunityIcons name="account-hard-hat" size={44} color={colors.accent} />
          </View>
        </View>

        <View style={styles.activationHeader}>
          <Text style={styles.activationKicker}>Client Activation</Text>
          <Text style={styles.activationTitle}>Crewmate</Text>
          <Text style={styles.activationSubtitle}>Let's get you started</Text>
        </View>

        <View style={styles.activationBox}>
          <Text style={styles.activationLabel}>Client ID</Text>
          <View style={styles.activationInputWrap}>
            <Ionicons name="person-outline" size={18} color={colors.textMuted} />
            <TextInput
              value={clientId}
              onChangeText={setClientId}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="Enter client ID"
              placeholderTextColor={colors.textMuted}
              style={styles.activationInput}
            />
          </View>

          <Text style={styles.activationLabel}>Password</Text>
          <View style={styles.activationInputWrap}>
            <Ionicons name="lock-closed-outline" size={18} color={colors.textMuted} />
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!passwordVisible}
              placeholder="Enter password"
              placeholderTextColor={colors.textMuted}
              style={styles.activationInput}
            />
            <Pressable onPress={() => setPasswordVisible((visible) => !visible)}>
              <Ionicons name={passwordVisible ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.textMuted} />
            </Pressable>
          </View>

          <Pressable
            style={[styles.activateButton, (!dbReady || saving) && styles.activateButtonDisabled]}
            onPress={activate}
            disabled={!dbReady || saving}
          >
            <Text style={styles.activateText}>{saving ? 'Activating...' : 'Activate App'}</Text>
            {!saving ? <Ionicons name="arrow-forward" size={18} color="#FFFFFF" /> : null}
          </Pressable>
        </View>
      </ScrollView>

      {saving ? (
        <View style={styles.activationLoadingOverlay} pointerEvents="auto">
          <View style={styles.activationLoadingCard}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.activationLoadingText}>Logging in...</Text>
          </View>
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

function ProfileModal({
  visible,
  client,
  onLogout,
  onClose,
}: {
  visible: boolean;
  client: ClientProfile;
  onLogout: () => Promise<void>;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.profileCard}>
          <View style={styles.profileHeader}>
            <View style={styles.profileHeaderLeft}>
              <View style={styles.profileHeaderIcon}>
                <MaterialCommunityIcons name="account-hard-hat" size={20} color={colors.accent} />
              </View>
              <Text style={styles.profileTitle}>Profile</Text>
            </View>
            <Pressable style={styles.closeButton} onPress={onClose}>
              <Ionicons name="close" size={18} color={colors.primary} />
            </Pressable>
          </View>

          <Text style={styles.profileLabel}>Contractor Name</Text>
          <Text style={styles.profileValue}>{client.contractorName}</Text>
          <Text style={styles.profileLabel}>Contractor Title</Text>
          <Text style={styles.profileValue}>{client.contractorTitle}</Text>
          <Text style={styles.profileLabel}>Phone Number</Text>
          <Text style={styles.profileValue}>{client.phoneNumber || '-'}</Text>
          <Text style={styles.profileLabel}>Client ID</Text>
          <Text style={styles.profileValue}>{client.id}</Text>

          <Pressable style={[styles.profileAction, styles.logoutButton]} onPress={onLogout}>
            <Ionicons name="log-out-outline" size={18} color={colors.danger} />
            <Text style={styles.logoutText}>Logout</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function UpdateModal({
  visible,
  buildNumber,
  currentBuildNumber,
  message,
  phase,
  onInstall,
  onLater,
}: {
  visible: boolean;
  buildNumber: number;
  currentBuildNumber: number;
  message: string;
  phase: 'idle' | 'available' | 'downloading' | 'launching' | 'error';
  onInstall: () => Promise<void>;
  onLater: () => void;
}) {
  const isWorking = phase === 'downloading' || phase === 'launching';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={isWorking ? undefined : onLater}>
      <View style={styles.updateBackdrop}>
        <View style={styles.updateCard}>
          <View style={styles.updateKickerRow}>
            <Ionicons name="cloud-download-outline" size={14} color={colors.success} />
            <Text style={styles.updateKicker}>Update Available</Text>
          </View>
          <Text style={styles.updateTitle}>Install latest version</Text>
          <Text style={styles.updateText}>Current build: {currentBuildNumber || '-'}</Text>
          <Text style={styles.updateText}>Latest build: {buildNumber || '-'}</Text>
          <Text style={styles.updateMessage}>{message || 'Tap Install to download the APK and open the Android installer.'}</Text>

          {isWorking ? (
            <View style={styles.updateWorkingRow}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.updateWorkingText}>{phase === 'downloading' ? 'Downloading...' : 'Opening installer...'}</Text>
            </View>
          ) : null}

          <View style={styles.updateActions}>
            {!isWorking ? (
              <Pressable style={[styles.updateAction, styles.updateLaterButton]} onPress={onLater}>
                <Text style={styles.updateLaterText}>Later</Text>
              </Pressable>
            ) : null}
            <Pressable
              style={[styles.updateAction, styles.updateInstallButton, isWorking && styles.updateInstallButtonDisabled]}
              onPress={onInstall}
              disabled={isWorking}
            >
              <Ionicons name={phase === 'error' ? 'refresh' : 'download-outline'} size={16} color="#FFFFFF" />
              <Text style={styles.updateInstallText}>
                {phase === 'error' ? 'Try Again' : isWorking ? 'Working...' : 'Install'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function formatSheetDate(value?: string) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function getFirstName(fullName: string) {
  const trimmed = (fullName || '').trim();
  if (!trimmed) return 'there';
  return trimmed.split(/\s+/)[0];
}

function getLoginErrorMessage(error: any) {
  const message = String(error?.message ?? error);
  if (/network|fetch|timed out|timeout|unable to load users|google sheet|api/i.test(message)) {
    return 'Unable to connect to the user sheet. Please check your internet connection and try again.';
  }

  return message;
}

function canUseDevice(clients: ClientProfile[], client: ClientProfile, deviceId: string) {
  try {
    assertCanUseDevice(clients, client, deviceId);
    return true;
  } catch {
    return false;
  }
}

function assertCanUseDevice(clients: ClientProfile[], client: ClientProfile, deviceId: string) {
  // Admins are exempt from the single-device restriction and can log in from any device.
  if (client.role === 'admin') return;

  if (client.lastDeviceId && client.lastDeviceId !== deviceId) {
    throw new Error('This user is already registered on another device. Contact Admin ');
  }

  const existingDeviceUser = clients.find(
    (currentClient) =>
      currentClient.active &&
      currentClient.role !== 'admin' &&
      currentClient.userId !== client.userId &&
      currentClient.lastDeviceId === deviceId,
  );

  if (existingDeviceUser) {
    throw new Error('This device is already registered for another user. Contact Admin.');
  }
}

type AppUpdateCandidate = {
  buildNumber: number;
  downloadUrl: string;
  assetName: string;
  tagName: string;
};

async function fetchLatestAppUpdate(currentBuildNumber: number): Promise<AppUpdateCandidate | null> {
  if (!Number.isFinite(currentBuildNumber) || currentBuildNumber <= 0) return null;

  const response = await fetch(
    `https://api.github.com/repos/${updateCheckConfig.owner}/${updateCheckConfig.repo}/releases/latest`,
    {
        headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${githubToken}`,
  },
    },
  );

  if (!response.ok) return null;

  const release = await response.json();
  const latestBuildNumber = getBuildNumberFromRelease(release?.tag_name);
  if (!latestBuildNumber || latestBuildNumber <= currentBuildNumber) return null;

  const apkAsset = Array.isArray(release?.assets)
    ? release.assets.find((asset: { name?: string }) => asset.name?.toLowerCase().endsWith('.apk'))
    : null;
  if (!apkAsset?.browser_download_url) return null;

  return {
    buildNumber: latestBuildNumber,
    downloadUrl: `https://api.github.com/repos/${updateCheckConfig.owner}/${updateCheckConfig.repo}/releases/assets/${apkAsset.id}`,
    assetName: String(apkAsset.name ?? 'app-update.apk'),
    tagName: String(release?.tag_name ?? ''),
  };
}

async function downloadAndInstallApk(downloadUrl: string) {
  const localUri = FileSystem.cacheDirectory + 'app-update.apk';

  // Remove any leftover file from a previous attempt.
  const existing = await FileSystem.getInfoAsync(localUri);
  if (existing.exists) {
    await FileSystem.deleteAsync(localUri, { idempotent: true });
  }

  const downloadResumable = FileSystem.createDownloadResumable(
  downloadUrl,
  localUri,
  {
    headers: {
      Authorization: `Bearer ${githubToken}`,
      Accept: 'application/octet-stream',
    },
  }
);

const result = await downloadResumable.downloadAsync();

if (!result?.uri) {
  throw new Error('Failed to download APK.');
}

const uri = result.uri;

  // Android needs a content:// URI (via FileProvider) to open a local file
  // for installation — a plain file:// path will be rejected on API 24+.
  const contentUri = await FileSystem.getContentUriAsync(uri);

  const flags = androidIntentFlags.grantReadUriPermission | androidIntentFlags.activityNewTask;

  try {
    await IntentLauncher.startActivityAsync('android.intent.action.INSTALL_PACKAGE', {
      data: contentUri,
      flags,
      type: apkMimeType,
      extra: {
        'android.intent.extra.NOT_UNKNOWN_SOURCE': true,
        'android.intent.extra.RETURN_RESULT': true,
      },
    });
  } catch {
    await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
      data: contentUri,
      flags,
      type: apkMimeType,
    });
  }
}

function getBuildNumberFromRelease(tagName?: string) {
  const match = tagName?.match(/(\d+)$/);
  if (!match) return null;

  const buildNumber = Number(match[1]);
  return Number.isFinite(buildNumber) ? buildNumber : null;
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.primary,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  loadingText: {
    color: colors.textSecondary,
    marginTop: 12,
    fontWeight: '800',
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: 10,
    paddingBottom: 14,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  greeting: {
    color: '#D9E8C6',
    fontSize: 13,
    fontWeight: '700',
  },
  greetingName: {
    color: colors.accent,
    fontWeight: '900',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
    marginTop: 4,
  },
  body: {
    flex: 1,
    backgroundColor: colors.background,
  },
  tabBar: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: 10,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  tabButton: {
    flex: 1,
    minHeight: 56,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  tabIconWrap: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIconWrapActive: {
    backgroundColor: colors.accent,
  },
  tabText: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
  },
  tabTextActive: {
    color: colors.accent,
  },
  profileButton: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  modalKeyboardWrap: {
    flex: 1,
  },
  modalScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  profileCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    ...cardShadow,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  profileHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  profileHeaderIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: colors.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileTitle: {
    color: colors.textPrimary,
    fontSize: 20,
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
  profileLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '800',
    marginTop: 10,
  },
  profileValue: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '900',
    marginTop: 2,
  },
  profileAction: {
    minHeight: 48,
    borderRadius: radius.md,
    backgroundColor: colors.chipInactiveBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
    flexDirection: 'row',
    gap: 8,
  },
  logoutButton: {
    backgroundColor: colors.dangerBg,
    marginTop: 10,
  },
  logoutText: {
    color: colors.danger,
    fontWeight: '900',
  },
  activationScreen: {
    flex: 1,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
  },
  activationScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  activationLogoWrap: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  activationLogoCircle: {
    width: 92,
    height: 92,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  activationHeader: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  activationKicker: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  activationTitle: {
    color: '#FFFFFF',
    fontSize: 34,
    fontWeight: '900',
    marginTop: 6,
  },
  activationSubtitle: {
    color: '#C7DAD3',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 4,
  },
  activationBox: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    ...cardShadow,
  },
  activationLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(243, 246, 241, 0.82)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  activationLoadingCard: {
    minWidth: 160,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    paddingHorizontal: 22,
    ...cardShadow,
  },
  activationLoadingText: {
    color: colors.primary,
    fontWeight: '900',
    marginTop: 12,
  },
  activationLabel: {
    color: colors.textPrimary,
    fontWeight: '900',
    marginBottom: 6,
  },
  activationInputWrap: {
    minHeight: 50,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  activationInput: {
    flex: 1,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  activateButton: {
    minHeight: 52,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    flexDirection: 'row',
    gap: 8,
  },
  activateButtonDisabled: {
    backgroundColor: '#8FA19A',
  },
  activateText: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
  updateBackdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  updateCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.borderLight,
    ...cardShadow,
  },
  updateKickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  updateKicker: {
    color: colors.success,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  updateTitle: {
    color: colors.textPrimary,
    fontSize: 24,
    fontWeight: '900',
    marginTop: 6,
  },
  updateText: {
    color: colors.textSecondary,
    fontWeight: '700',
    marginTop: 8,
  },
  updateMessage: {
    color: colors.textPrimary,
    marginTop: 14,
    lineHeight: 20,
  },
  updateWorkingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 16,
  },
  updateWorkingText: {
    color: colors.primary,
    fontWeight: '800',
  },
  updateActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  updateAction: {
    flex: 1,
    minHeight: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  updateLaterButton: {
    backgroundColor: colors.chipInactiveBg,
  },
  updateLaterText: {
    color: colors.primary,
    fontWeight: '900',
  },
  updateInstallButton: {
    backgroundColor: colors.primary,
  },
  updateInstallButtonDisabled: {
    backgroundColor: '#7E918A',
  },
  updateInstallText: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
});