import { Ionicons } from '@expo/vector-icons';
import * as Contacts from 'expo-contacts';
import * as SQLite from 'expo-sqlite';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { addLabour, deleteLabour, getAttendanceForDate, saveAttendance } from '../lib/db';
import { attendanceOptions, cleanPhone, dateFromKey, formatDate, normalize } from '../lib/format';
import { colors, radius, spacing, cardShadow } from '../theme';
import { AttendanceStatus, Labour } from '../types';

type ContactCandidate = {
  name: string;
  phone: string;
};

type Props = {
  db: SQLite.SQLiteDatabase;
  labours: Labour[];
  onChanged: () => Promise<void>;
};

export function LaboursScreen({ db, labours, onChanged }: Props) {
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState('');
  const [contactModal, setContactModal] = useState(false);
  const [contactSearch, setContactSearch] = useState('');
  const [contacts, setContacts] = useState<ContactCandidate[]>([]);
  const [markingLabour, setMarkingLabour] = useState<Labour | null>(null);
  const [markDate, setMarkDate] = useState(formatDate(new Date()));
  const [showMarkCalendar, setShowMarkCalendar] = useState(false);
  const [status, setStatus] = useState<AttendanceStatus>('present');
  const [advance, setAdvance] = useState('');

  const filteredLabours = useMemo(() => {
    const term = normalize(search);
    return labours.filter((labour) => `${labour.name} ${labour.phone}`.toLowerCase().includes(term));
  }, [labours, search]);

  const filteredContacts = useMemo(() => {
    const term = normalize(contactSearch);
    return contacts.filter((contact) => `${contact.name} ${contact.phone}`.toLowerCase().includes(term));
  }, [contacts, contactSearch]);

  useEffect(() => {
    async function loadMarking() {
      if (!markingLabour) return;
      const row = await getAttendanceForDate(db, markingLabour.id, markDate);
      setStatus(row?.status ?? 'present');
      setAdvance(row?.advance_amount ? String(row.advance_amount) : '');
    }

    loadMarking().catch((error) => Alert.alert('Attendance error', String(error)));
  }, [db, markDate, markingLabour]);

  async function openContacts() {
    const permission = await Contacts.requestPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Please allow contacts access to add labour from your phone contacts.');
      return;
    }

    const result = await Contacts.getContactsAsync({
      fields: [Contacts.Fields.PhoneNumbers],
      pageSize: 3000,
      sort: Contacts.SortTypes.FirstName,
    });

    const mapped = result.data
      .flatMap((contact) => {
        const name = contact.name || [contact.firstName, contact.lastName].filter(Boolean).join(' ') || 'Unnamed';
        return (contact.phoneNumbers ?? []).map((phone) => ({ name, phone: cleanPhone(phone.number ?? '') }));
      })
      .filter((contact) => contact.phone);

    setContacts(mapped);
    setContactSearch('');
    setContactModal(true);
  }

  async function selectContact(contact: ContactCandidate) {
    await addLabour(db, contact.name.trim(), contact.phone);
    await onChanged();
    setContactModal(false);
  }

  async function confirmDelete(labour: Labour) {
    Alert.alert('Delete labour?', `Delete ${labour.name}? Their attendance data will also be removed.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteLabour(db, labour.id);
          await onChanged();
        },
      },
    ]);
  }

  async function openMarking(labour: Labour) {
    setMarkDate(formatDate(new Date()));
    setMarkingLabour(labour);
  }

  async function saveMarking() {
    if (!markingLabour) return;
    const amount = Number(advance || 0);
    if (Number.isNaN(amount) || amount < 0) {
      Alert.alert('Invalid amount', 'Advance must be zero or a positive number.');
      return;
    }

    await saveAttendance(db, markingLabour.id, markDate, status, amount);
    setMarkingLabour(null);
    Alert.alert('Saved', 'Attendance has been saved.');
  }

  function handleMarkDateChange(_: unknown, selectedDate?: Date) {
    if (Platform.OS === 'android') {
      setShowMarkCalendar(false);
    }
    if (selectedDate) {
      setMarkDate(formatDate(selectedDate));
    }
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.topBar}>
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search labour name or number"
            placeholderTextColor={colors.textMuted}
            style={styles.searchInput}
          />
        </View>
        <Pressable style={styles.addButton} onPress={openContacts}>
          <Ionicons name="add" size={26} color="#FFFFFF" />
        </Pressable>
      </View>

      <FlatList
        data={filteredLabours}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={filteredLabours.length ? undefined : styles.emptyWrap}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="person-add-outline" size={28} color={colors.textMuted} />
            <Text style={styles.emptyText}>Tap + to add labour from contacts.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable style={styles.labourCard} onPress={() => openMarking(item)}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{item.name.charAt(0).toUpperCase()}</Text>
            </View>
            <View style={styles.labourInfo}>
              <Text numberOfLines={1} style={styles.name}>{item.name}</Text>
              <Text numberOfLines={1} style={styles.phone}>{item.phone}</Text>
            </View>
            <Pressable style={styles.deleteButton} onPress={() => confirmDelete(item)}>
              <Ionicons name="trash-outline" size={14} color={colors.danger} />
              <Text style={styles.deleteText}>Delete</Text>
            </Pressable>
          </Pressable>
        )}
      />

      <Modal visible={contactModal} animationType="slide" onRequestClose={() => setContactModal(false)}>
        <KeyboardAvoidingView
          style={[styles.modal, { paddingTop: insets.top + 14, paddingBottom: Math.max(insets.bottom, 14) }]}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select Contact</Text>
            <Pressable style={styles.closeButton} onPress={() => setContactModal(false)}>
              <Ionicons name="close" size={20} color={colors.primary} />
            </Pressable>
          </View>
          <View style={styles.searchWrap}>
            <Ionicons name="search" size={18} color={colors.textMuted} />
            <TextInput
              value={contactSearch}
              onChangeText={setContactSearch}
              placeholder="Search contact name or number"
              placeholderTextColor={colors.textMuted}
              style={styles.searchInput}
            />
          </View>
          <FlatList
            data={filteredContacts}
            keyExtractor={(item, index) => `${item.phone}-${index}`}
            ListEmptyComponent={<Text style={styles.empty}>No contact found.</Text>}
            renderItem={({ item }) => (
              <Pressable style={styles.contactRow} onPress={() => selectContact(item)}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{item.name.charAt(0).toUpperCase()}</Text>
                </View>
                <View style={styles.labourInfo}>
                  <Text style={styles.name}>{item.name}</Text>
                  <Text style={styles.phone}>{item.phone}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </Pressable>
            )}
          />
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={Boolean(markingLabour)} transparent animationType="fade" onRequestClose={() => setMarkingLabour(null)}>
        <View style={styles.backdrop}>
          <ScrollView contentContainerStyle={styles.modalScrollContent} keyboardShouldPersistTaps="handled">
            <View style={styles.markingBox}>
              <View style={styles.markingHeaderRow}>
                <View style={styles.avatarLg}>
                  <Text style={styles.avatarLgText}>{markingLabour?.name.charAt(0).toUpperCase()}</Text>
                </View>
                <View style={styles.labourInfo}>
                  <Text style={styles.modalTitle}>{markingLabour?.name}</Text>
                  <Text style={styles.phone}>{markingLabour?.phone}</Text>
                </View>
              </View>

              <Pressable style={styles.dateButton} onPress={() => setShowMarkCalendar(true)}>
                <View style={styles.dateButtonLeft}>
                  <Ionicons name="calendar-outline" size={18} color={colors.primary} />
                  <View>
                    <Text style={styles.dateLabel}>Attendance Date</Text>
                    <Text style={styles.dateValue}>{markDate}</Text>
                  </View>
                </View>
                <View style={styles.chooseChip}>
                  <Text style={styles.calendarIcon}>Choose</Text>
                </View>
              </Pressable>
              {showMarkCalendar && (
                <DateTimePicker
                  value={dateFromKey(markDate)}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={handleMarkDateChange}
                />
              )}
              <View style={styles.optionGrid}>
                {attendanceOptions.map((option) => {
                  const active = status === option.value;
                  return (
                    <Pressable
                      key={option.value}
                      style={[styles.option, active && styles.optionActive]}
                      onPress={() => setStatus(option.value)}
                    >
                      {active ? <Ionicons name="checkmark-circle" size={16} color="#FFFFFF" /> : null}
                      <Text style={[styles.optionText, active && styles.optionTextActive]}>{option.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <View style={styles.inputWrap}>
                <Ionicons name="cash-outline" size={18} color={colors.textMuted} />
                <TextInput
                  value={advance}
                  onChangeText={setAdvance}
                  keyboardType="numeric"
                  placeholder="Advance amount (optional)"
                  placeholderTextColor={colors.textMuted}
                  style={styles.input}
                />
              </View>
              <View style={styles.actionRow}>
                <Pressable style={styles.cancelButton} onPress={() => setMarkingLabour(null)}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </Pressable>
                <Pressable style={styles.saveButton} onPress={saveMarking}>
                  <Ionicons name="checkmark" size={18} color="#FFFFFF" />
                  <Text style={styles.saveText}>Save</Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.lg,
  },
  topBar: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  searchWrap: {
    flex: 1,
    minHeight: 48,
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
    fontWeight: '600',
  },
  addButton: {
    width: 50,
    minHeight: 48,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...cardShadow,
  },
  labourCard: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...cardShadow,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: colors.accentDark,
    fontWeight: '900',
  },
  avatarLg: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLgText: {
    color: colors.accentDark,
    fontWeight: '900',
    fontSize: 18,
  },
  labourInfo: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '900',
  },
  phone: {
    color: colors.textSecondary,
    marginTop: 3,
    fontWeight: '600',
  },
  deleteButton: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    backgroundColor: colors.dangerBg,
    justifyContent: 'center',
  },
  deleteText: {
    color: colors.danger,
    fontWeight: '800',
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
  modal: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.lg,
  },
  modalScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  modalTitle: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: '900',
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.chipInactiveBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  markingBox: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    ...cardShadow,
  },
  markingHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  dateButton: {
    minHeight: 58,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateButtonLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dateLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '800',
  },
  dateValue: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '900',
    marginTop: 2,
  },
  chooseChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.accentLight,
  },
  calendarIcon: {
    color: colors.accentDark,
    fontWeight: '900',
    fontSize: 12,
  },
  input: {
    flex: 1,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  inputWrap: {
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
  },
  optionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  option: {
    width: '48%',
    minHeight: 46,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    backgroundColor: colors.background,
  },
  optionActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  optionText: {
    color: colors.textSecondary,
    fontWeight: '800',
  },
  optionTextActive: {
    color: '#FFFFFF',
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  cancelButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  cancelText: {
    color: colors.textSecondary,
    fontWeight: '900',
  },
  saveText: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
});