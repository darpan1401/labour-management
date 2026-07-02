import Constants from 'expo-constants';
import { StatusBar } from 'expo-status-bar';
import * as SQLite from 'expo-sqlite';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
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
import { DashboardScreen } from './src/screens/DashboardScreen';
import { LaboursScreen } from './src/screens/LaboursScreen';
import { ReportsScreen } from './src/screens/ReportsScreen';
import { ClientProfile, Labour, TabKey } from './src/types';

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: 'dashboard', label: 'Home' },
  { key: 'labours', label: 'Labour' },
  { key: 'reports', label: 'Report' },
];

const updateCheckConfig = {
  owner: 'darpan1401',
  repo: 'labour-management',
};

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
        <ActivityIndicator size="large" color="#153D36" />
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
          <Text style={styles.company}>{client.contractorName}</Text>
          <Text style={styles.title}>{client.contractorTitle}</Text>
        </View>
        <Pressable style={styles.profileButton} onPress={() => setProfileOpen(true)}>
          <Text style={styles.profileInitial}>{client.contractorName.charAt(0).toUpperCase()}</Text>
        </Pressable>
      </View>

      <View style={styles.body}>{renderTab()}</View>

      <View style={[styles.tabBar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        {tabs.map((tab) => (
          <Pressable
            key={tab.key}
            onPress={() => setActiveTab(tab.key)}
            style={[styles.tabButton, activeTab === tab.key && styles.tabButtonActive]}
          >
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>{tab.label}</Text>
          </Pressable>
        ))}
      </View>
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
        <View style={styles.activationHeader}>
          <Text style={styles.activationKicker}>Client Activation</Text>
          <Text style={styles.activationTitle}>Crewmate</Text>
        </View>

        <View style={styles.activationBox}>
          <Text style={styles.activationLabel}>Client ID</Text>
          <TextInput
            value={clientId}
            onChangeText={setClientId}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="Enter client ID"
            placeholderTextColor="#6F7F79"
            style={styles.activationInput}
          />

          <Text style={styles.activationLabel}>Password</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!passwordVisible}
            placeholder="Enter password"
            placeholderTextColor="#6F7F79"
            style={styles.activationInput}
          />
          <Pressable style={styles.passwordToggle} onPress={() => setPasswordVisible((visible) => !visible)}>
            <Text style={styles.passwordToggleText}>{passwordVisible ? 'Hide Password' : 'Show Password'}</Text>
          </Pressable>

          <Pressable
            style={[styles.activateButton, (!dbReady || saving) && styles.activateButtonDisabled]}
            onPress={activate}
            disabled={!dbReady || saving}
          >
            <Text style={styles.activateText}>{saving ? 'Activating...' : 'Activate App'}</Text>
          </Pressable>
        </View>
      </ScrollView>

      {saving ? (
        <View style={styles.activationLoadingOverlay} pointerEvents="auto">
          <View style={styles.activationLoadingCard}>
            <ActivityIndicator size="large" color="#153D36" />
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
            <Text style={styles.profileTitle}>Profile</Text>
            <Pressable onPress={onClose}>
              <Text style={styles.closeText}>Close</Text>
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
          <Text style={styles.updateKicker}>Update Available</Text>
          <Text style={styles.updateTitle}>Install latest version</Text>
          <Text style={styles.updateText}>Current build: {currentBuildNumber || '-'}</Text>
          <Text style={styles.updateText}>Latest build: {buildNumber || '-'}</Text>
          <Text style={styles.updateMessage}>{message || 'Tap Install to download the APK and open the Android installer.'}</Text>

          {isWorking ? (
            <View style={styles.updateWorkingRow}>
              <ActivityIndicator size="small" color="#153D36" />
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

function AdminScreen({
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
  const [search, setSearch] = useState('');
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const [activeOverrides, setActiveOverrides] = useState<Record<string, boolean>>({});
  const cleanSearch = search.trim().toLowerCase();
  const clientRows = clients
    .filter((client) => client.role === 'client')
    .filter((client) => {
      if (!cleanSearch) return true;
      return [client.contractorName, client.userId, client.id, client.phoneNumber, client.contractorTitle]
        .join(' ')
        .toLowerCase()
        .includes(cleanSearch);
    });

  async function toggleActive(item: ClientProfile, active: boolean) {
    setActiveOverrides((currentOverrides) => ({ ...currentOverrides, [item.userId]: active }));
    setUpdatingUserId(item.userId);
    try {
      await onToggleClientActive(item, active);
      setActiveOverrides((currentOverrides) => {
        const nextOverrides = { ...currentOverrides };
        delete nextOverrides[item.userId];
        return nextOverrides;
      });
    } catch (error: any) {
      setActiveOverrides((currentOverrides) => {
        const nextOverrides = { ...currentOverrides };
        delete nextOverrides[item.userId];
        return nextOverrides;
      });
      Alert.alert('Update failed', String(error?.message ?? error));
    } finally {
      setUpdatingUserId(null);
    }
  }

  return (
    <View style={styles.safeArea}>
      <StatusBar style="light" />
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <View style={styles.headerText}>
          <Text style={styles.company}>{currentAdmin.contractorName}</Text>
          <Text style={styles.title}>Admin Dashboard</Text>
        </View>
        <Pressable style={styles.profileButton} onPress={onLogout}>
          <Text style={styles.profileInitial}>A</Text>
        </Pressable>
      </View>

      <View style={styles.adminBody}>
        <View style={styles.adminToolbar}>
          <Text style={styles.adminTitle}>Sheet Users</Text>
          <Pressable style={styles.adminAddButton} onPress={() => setAddUserOpen(true)}>
            <Text style={styles.adminAddText}>Add User</Text>
          </Pressable>
        </View>
        <TextInput
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="Search user"
          placeholderTextColor="#6F7F79"
          style={styles.adminSearch}
        />
        <FlatList
          data={clientRows}
          keyExtractor={(item) => item.userId}
          ListEmptyComponent={<Text style={styles.adminEmpty}>No client users found.</Text>}
          renderItem={({ item }) => {
            const isActive = activeOverrides[item.userId] ?? item.active;
            const isLoggedIn = isActive ? item.loggedIn : false;

            return (
              <View style={styles.adminRow}>
                <Text style={styles.adminName}>{item.contractorName}</Text>
                <Text style={styles.adminMeta}>{item.userId}</Text>
                <Text style={styles.adminMeta}>{item.id}</Text>
                <Text style={styles.adminMeta}>{item.contractorTitle}</Text>
                <Text style={styles.adminMeta}>{item.phoneNumber || '-'}</Text>
                <View style={styles.adminToggleRow}>
                  <Text style={isActive ? styles.adminActive : styles.adminInactive}>
                    Active: {isActive ? '1' : '0'}
                  </Text>
                  <Switch
                    value={isActive}
                    onValueChange={(nextValue) => toggleActive(item, nextValue)}
                    disabled={updatingUserId === item.userId}
                    trackColor={{ false: '#E8C5BF', true: '#BFD9C8' }}
                    thumbColor={isActive ? '#1E7A42' : '#B7352C'}
                  />
                </View>
                <Text style={styles.adminMeta}>{isLoggedIn ? 'Logged in' : 'Not logged in'}</Text>
                <Text style={styles.adminMeta}>{item.lastDeviceId || 'No device registered'}</Text>
                <Text style={styles.adminMeta}>{formatSheetDate(item.lastLoginAt)}</Text>
                <Text style={styles.adminNote}>Users sync from Google Sheet when online.</Text>
              </View>
            );
          }}
        />
      </View>
      <AddUserModal
        visible={addUserOpen}
        onClose={() => setAddUserOpen(false)}
        onAdd={onAddClient}
      />
    </View>
  );
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
            <View style={styles.profileCard}>
              <View style={styles.profileHeader}>
                <Text style={styles.profileTitle}>Add User</Text>
                <Pressable onPress={onClose}>
                  <Text style={styles.closeText}>Close</Text>
                </Pressable>
              </View>

              <TextInput value={userId} onChangeText={setUserId} placeholder="User Id" placeholderTextColor="#6F7F79" style={styles.addUserInput} />
              <TextInput value={loginId} onChangeText={setLoginId} placeholder="Login ID" placeholderTextColor="#6F7F79" autoCapitalize="none" style={styles.addUserInput} />
              <TextInput value={password} onChangeText={setPassword} placeholder="Password" placeholderTextColor="#6F7F79" autoCapitalize="none" style={styles.addUserInput} />
              <TextInput value={contractorName} onChangeText={setContractorName} placeholder="Contractor Name" placeholderTextColor="#6F7F79" style={styles.addUserInput} />
              <TextInput value={phoneNumber} onChangeText={setPhoneNumber} placeholder="Phone Number" placeholderTextColor="#6F7F79" keyboardType="phone-pad" style={styles.addUserInput} />
              <TextInput value={contractorTitle} onChangeText={setContractorTitle} placeholder="Contractor Title" placeholderTextColor="#6F7F79" style={styles.addUserInput} />

              <View style={styles.adminToggleRow}>
                <Text style={active ? styles.adminActive : styles.adminInactive}>Active: {active ? '1' : '0'}</Text>
                <Switch
                  value={active}
                  onValueChange={setActive}
                  trackColor={{ false: '#E8C5BF', true: '#BFD9C8' }}
                  thumbColor={active ? '#1E7A42' : '#B7352C'}
                />
              </View>

              <Pressable style={[styles.profileAction, saving && styles.activateButtonDisabled]} onPress={submit} disabled={saving}>
                <Text style={styles.profileActionText}>{saving ? 'Adding...' : 'Add Client User'}</Text>
              </Pressable>

              {saving ? (
                <View style={styles.addUserLoadingOverlay} pointerEvents="auto">
                  <View style={styles.activationLoadingCard}>
                    <ActivityIndicator size="large" color="#153D36" />
                    <Text style={styles.activationLoadingText}>Adding user...</Text>
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

function formatSheetDate(value?: string) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
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
    downloadUrl: apkAsset.browser_download_url,
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

  const { uri } = await FileSystem.downloadAsync(downloadUrl, localUri);

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
    backgroundColor: '#153D36',
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F6F1',
  },
  loadingText: {
    color: '#596A63',
    marginTop: 12,
    fontWeight: '800',
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 14,
    backgroundColor: '#153D36',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  company: {
    color: '#D9E8C6',
    fontSize: 12,
    fontWeight: '900',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '900',
    marginTop: 4,
  },
  body: {
    flex: 1,
    backgroundColor: '#F3F6F1',
  },
  tabBar: {
    flexDirection: 'row',
    gap: 8,
    padding: 10,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#D9E2DD',
  },
  tabButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EFF4F1',
  },
  tabButtonActive: {
    backgroundColor: '#153D36',
  },
  tabText: {
    color: '#53645D',
    fontWeight: '900',
  },
  tabTextActive: {
    color: '#FFFFFF',
  },
  profileButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#D9E8C6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileInitial: {
    color: '#153D36',
    fontSize: 18,
    fontWeight: '900',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    padding: 18,
  },
  modalKeyboardWrap: {
    flex: 1,
  },
  modalScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  profileCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 16,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  profileTitle: {
    color: '#17231F',
    fontSize: 20,
    fontWeight: '900',
  },
  closeText: {
    color: '#153D36',
    fontWeight: '900',
  },
  profileLabel: {
    color: '#66756F',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 10,
  },
  profileValue: {
    color: '#17231F',
    fontSize: 16,
    fontWeight: '900',
    marginTop: 2,
  },
  profileAction: {
    minHeight: 46,
    borderRadius: 8,
    backgroundColor: '#EEF4EC',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
  },
  profileActionText: {
    color: '#153D36',
    fontWeight: '900',
  },
  logoutButton: {
    backgroundColor: '#FBE9E7',
    marginTop: 10,
  },
  logoutText: {
    color: '#B7352C',
    fontWeight: '900',
  },
  adminBody: {
    flex: 1,
    backgroundColor: '#F3F6F1',
    padding: 14,
  },
  adminToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  adminTitle: {
    color: '#17231F',
    fontSize: 22,
    fontWeight: '900',
  },
  adminAddButton: {
    minHeight: 40,
    borderRadius: 8,
    backgroundColor: '#153D36',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  adminAddText: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
  adminSearch: {
    minHeight: 46,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD8D2',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    color: '#17231F',
    fontWeight: '800',
    marginBottom: 12,
  },
  adminRow: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D7E0DA',
    padding: 14,
    marginBottom: 10,
  },
  adminName: {
    color: '#17231F',
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 4,
  },
  adminMeta: {
    color: '#53645D',
    fontWeight: '700',
    marginTop: 3,
  },
  adminToggleRow: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
    gap: 12,
  },
  adminActive: {
    color: '#1E7A42',
    fontWeight: '900',
  },
  adminInactive: {
    color: '#B7352C',
    fontWeight: '900',
  },
  adminNote: {
    color: '#B57912',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 8,
  },
  adminEmpty: {
    color: '#687871',
    textAlign: 'center',
    padding: 18,
  },
  activationScreen: {
    flex: 1,
    backgroundColor: '#153D36',
    paddingHorizontal: 18,
  },
  activationScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  activationHeader: {
    marginBottom: 18,
  },
  activationKicker: {
    color: '#D9E8C6',
    fontSize: 13,
    fontWeight: '900',
  },
  activationTitle: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '900',
    marginTop: 6,
  },
  activationBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 16,
  },
  activationLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(243, 246, 241, 0.82)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
  },
  activationLoadingCard: {
    minWidth: 160,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    paddingHorizontal: 22,
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  activationLoadingText: {
    color: '#153D36',
    fontWeight: '900',
    marginTop: 12,
  },
  addUserLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(243, 246, 241, 0.82)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
    borderRadius: 8,
  },
  activationLabel: {
    color: '#17231F',
    fontWeight: '900',
    marginBottom: 6,
  },
  activationInput: {
    minHeight: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD8D2',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    color: '#17231F',
    marginBottom: 12,
  },
  passwordToggle: {
    alignSelf: 'flex-end',
    marginTop: -4,
    marginBottom: 12,
  },
  passwordToggleText: {
    color: '#153D36',
    fontWeight: '900',
  },
  activateButton: {
    minHeight: 48,
    borderRadius: 8,
    backgroundColor: '#153D36',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  activateButtonDisabled: {
    backgroundColor: '#8FA19A',
  },
  activateText: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
  addUserInput: {
    minHeight: 46,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD8D2',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    color: '#17231F',
    marginBottom: 10,
  },
  updateBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(13, 28, 24, 0.68)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  updateCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    padding: 20,
    borderWidth: 1,
    borderColor: '#DCE5DF',
  },
  updateKicker: {
    color: '#1E7A42',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  updateTitle: {
    color: '#0F1E1A',
    fontSize: 24,
    fontWeight: '900',
    marginTop: 6,
  },
  updateText: {
    color: '#54645E',
    fontWeight: '700',
    marginTop: 8,
  },
  updateMessage: {
    color: '#22302C',
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
    color: '#153D36',
    fontWeight: '800',
  },
  updateActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  updateAction: {
    flex: 1,
    minHeight: 48,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  updateLaterButton: {
    backgroundColor: '#E9EFEA',
  },
  updateLaterText: {
    color: '#153D36',
    fontWeight: '900',
  },
  updateInstallButton: {
    backgroundColor: '#153D36',
  },
  updateInstallButtonDisabled: {
    backgroundColor: '#7E918A',
  },
  updateInstallText: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
});
