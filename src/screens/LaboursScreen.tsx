import * as Contacts from 'expo-contacts';
import * as SQLite from 'expo-sqlite';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { addLabour, deleteLabour, getAttendanceForDate, saveAttendance } from '../lib/db';
import { attendanceOptions, cleanPhone, dateFromKey, formatDate, normalize } from '../lib/format';
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
    <View style={styles.screen}>
      <View style={styles.topBar}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search labour name or number"
          placeholderTextColor="#6F7F79"
          style={styles.search}
        />
        <Pressable style={styles.addButton} onPress={openContacts}>
          <Text style={styles.addText}>+</Text>
        </Pressable>
      </View>

      <FlatList
        data={filteredLabours}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={filteredLabours.length ? undefined : styles.emptyWrap}
        ListEmptyComponent={<Text style={styles.empty}>Tap + to add labour from contacts.</Text>}
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
              <Text style={styles.deleteText}>Delete</Text>
            </Pressable>
          </Pressable>
        )}
      />

      <Modal visible={contactModal} animationType="slide" onRequestClose={() => setContactModal(false)}>
        <View style={[styles.modal, { paddingTop: insets.top + 14, paddingBottom: Math.max(insets.bottom, 14) }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select Contact</Text>
            <Pressable onPress={() => setContactModal(false)}>
              <Text style={styles.closeText}>Close</Text>
            </Pressable>
          </View>
          <TextInput
            value={contactSearch}
            onChangeText={setContactSearch}
            placeholder="Search contact name or number"
            placeholderTextColor="#6F7F79"
            style={styles.search}
          />
          <FlatList
            data={filteredContacts}
            keyExtractor={(item, index) => `${item.phone}-${index}`}
            ListEmptyComponent={<Text style={styles.empty}>No contact found.</Text>}
            renderItem={({ item }) => (
              <Pressable style={styles.contactRow} onPress={() => selectContact(item)}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.phone}>{item.phone}</Text>
              </Pressable>
            )}
          />
        </View>
      </Modal>

      <Modal visible={Boolean(markingLabour)} transparent animationType="fade" onRequestClose={() => setMarkingLabour(null)}>
        <View style={styles.backdrop}>
          <View style={styles.markingBox}>
            <Text style={styles.modalTitle}>{markingLabour?.name}</Text>
            <Text style={styles.phone}>{markingLabour?.phone}</Text>
            <Pressable style={styles.dateButton} onPress={() => setShowMarkCalendar(true)}>
              <View>
                <Text style={styles.dateLabel}>Attendance Date</Text>
                <Text style={styles.dateValue}>{markDate}</Text>
              </View>
              <Text style={styles.calendarIcon}>Choose</Text>
            </Pressable>
            {showMarkCalendar && (
              <DateTimePicker
                value={dateFromKey(markDate)}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={handleMarkDateChange}
              />
            )}
            <View style={styles.optionWrap}>
              {attendanceOptions.map((option) => (
                <Pressable
                  key={option.value}
                  style={[styles.option, status === option.value && styles.optionActive]}
                  onPress={() => setStatus(option.value)}
                >
                  <Text style={[styles.optionText, status === option.value && styles.optionTextActive]}>{option.label}</Text>
                </Pressable>
              ))}
            </View>
            <TextInput
              value={advance}
              onChangeText={setAdvance}
              keyboardType="numeric"
              placeholder="Advance amount"
              placeholderTextColor="#6F7F79"
              style={styles.input}
            />
            <View style={styles.actionRow}>
              <Pressable style={styles.cancelButton} onPress={() => setMarkingLabour(null)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.saveButton} onPress={saveMarking}>
                <Text style={styles.saveText}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F3F6F1',
    padding: 14,
  },
  topBar: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  search: {
    flex: 1,
    minHeight: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD8D2',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    color: '#17231F',
  },
  addButton: {
    width: 50,
    minHeight: 48,
    borderRadius: 8,
    backgroundColor: '#153D36',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addText: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '600',
    marginTop: -2,
  },
  labourCard: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D7E0DA',
    padding: 12,
    marginBottom: 10,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#CBE0B8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#153D36',
    fontWeight: '900',
  },
  labourInfo: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    color: '#17231F',
    fontSize: 15,
    fontWeight: '900',
  },
  phone: {
    color: '#66756F',
    marginTop: 3,
  },
  deleteButton: {
    minHeight: 38,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D85A4F',
    justifyContent: 'center',
  },
  deleteText: {
    color: '#B7352C',
    fontWeight: '800',
  },
  emptyWrap: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  empty: {
    color: '#687871',
    textAlign: 'center',
    padding: 18,
  },
  modal: {
    flex: 1,
    backgroundColor: '#F3F6F1',
    padding: 14,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  modalTitle: {
    color: '#17231F',
    fontSize: 20,
    fontWeight: '900',
  },
  closeText: {
    color: '#153D36',
    fontWeight: '900',
  },
  contactRow: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D7E0DA',
    padding: 14,
    marginBottom: 8,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    padding: 18,
  },
  markingBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 16,
  },
  dateButton: {
    minHeight: 56,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD8D2',
    backgroundColor: '#F7FAF8',
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateLabel: {
    color: '#66756F',
    fontSize: 12,
    fontWeight: '800',
  },
  dateValue: {
    color: '#17231F',
    fontSize: 16,
    fontWeight: '900',
    marginTop: 2,
  },
  calendarIcon: {
    color: '#153D36',
    fontWeight: '900',
  },
  input: {
    minHeight: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD8D2',
    paddingHorizontal: 12,
    marginTop: 12,
    color: '#153D36',
  },
  optionWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  option: {
    minHeight: 42,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD8D2',
    paddingHorizontal: 12,
    justifyContent: 'center',
    backgroundColor: '#F7FAF8',
  },
  optionActive: {
    backgroundColor: '#153D36',
    borderColor: '#153D36',
  },
  optionText: {
    color: '#44574F',
    fontWeight: '800',
  },
  optionTextActive: {
    color: '#FFFFFF',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  cancelButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD8D2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 8,
    backgroundColor: '#153D36',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    color: '#52625B',
    fontWeight: '900',
  },
  saveText: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
});
