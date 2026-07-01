import * as SQLite from 'expo-sqlite';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { getMonthlyReport } from '../lib/db';
import { money, monthFromKey, monthKey, normalize, statusLabels } from '../lib/format';
import { shareLabourReport } from '../lib/pdf';
import { ClientProfile, Labour, ReportRow, ReportTotals } from '../types';

type Props = {
  db: SQLite.SQLiteDatabase;
  labours: Labour[];
  client: ClientProfile;
};

export function ReportsScreen({ db, labours, client }: Props) {
  const [search, setSearch] = useState('');
  const [selectedLabour, setSelectedLabour] = useState<Labour | null>(null);
  const [month, setMonth] = useState(monthKey(new Date()));
  const [showMonthCalendar, setShowMonthCalendar] = useState(false);
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [totals, setTotals] = useState<ReportTotals>({ advance: 0, days: 0 });

  useEffect(() => {
    if (selectedLabour && !labours.some((labour) => labour.id === selectedLabour.id)) {
      setSelectedLabour(null);
    }
  }, [labours, selectedLabour]);

  useEffect(() => {
    async function load() {
      if (!selectedLabour) {
        setRows([]);
        setTotals({ advance: 0, days: 0 });
        return;
      }

      const report = await getMonthlyReport(db, selectedLabour.id, month);
      setRows(report.rows);
      setTotals(report.totals);
    }

    load().catch((error) => Alert.alert('Report error', String(error)));
  }, [db, month, selectedLabour]);

  const filteredLabours = useMemo(() => {
    const term = normalize(search);
    return labours.filter((labour) => `${labour.name} ${labour.phone}`.toLowerCase().includes(term));
  }, [labours, search]);

  async function shareReport() {
    if (!selectedLabour) {
      Alert.alert('Select labour', 'Please select a labour before creating the PDF.');
      return;
    }

    await shareLabourReport(client, selectedLabour, month, rows, totals);
  }

  function handleMonthChange(_: unknown, selectedDate?: Date) {
    if (Platform.OS === 'android') {
      setShowMonthCalendar(false);
    }
    if (selectedDate) {
      setMonth(monthKey(selectedDate));
    }
  }

  return (
    <View style={styles.screen}>
      <View style={styles.selector}>
        <Text style={styles.title}>Monthly Report</Text>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search labour name or number"
          placeholderTextColor="#6F7F79"
          style={styles.input}
        />
        <FlatList
          horizontal
          data={filteredLabours}
          keyExtractor={(item) => String(item.id)}
          showsHorizontalScrollIndicator={false}
          ListEmptyComponent={<Text style={styles.emptyInline}>No labour found</Text>}
          renderItem={({ item }) => (
            <Pressable
              style={[styles.labourPill, selectedLabour?.id === item.id && styles.labourPillActive]}
              onPress={() => setSelectedLabour(item)}
            >
              <Text style={[styles.labourPillText, selectedLabour?.id === item.id && styles.labourPillTextActive]} numberOfLines={1}>
                {item.name}
              </Text>
            </Pressable>
          )}
        />
      </View>

      <View style={styles.reportCard}>
        <View style={styles.reportTopRow}>
          <View style={styles.selectedInfo}>
            <Text style={styles.metaLabel}>Selected Labour</Text>
            <Text numberOfLines={1} style={styles.selectedName}>{selectedLabour?.name ?? 'Select a labour'}</Text>
            <Text numberOfLines={1} style={styles.selectedPhone}>{selectedLabour?.phone ?? 'No labour selected'}</Text>
          </View>
          <Pressable
            style={[styles.shareButton, !selectedLabour && styles.shareButtonDisabled]}
            onPress={shareReport}
            disabled={!selectedLabour}
          >
            <Text style={styles.shareText}>PDF</Text>
          </Pressable>
        </View>

        <Pressable style={styles.dateButton} onPress={() => setShowMonthCalendar(true)}>
          <View>
            <Text style={styles.dateLabel}>Report Month</Text>
            <Text style={styles.dateValue}>{month}</Text>
          </View>
          <Text style={styles.calendarText}>Choose</Text>
        </Pressable>
        {showMonthCalendar && (
          <DateTimePicker
            value={monthFromKey(month)}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={handleMonthChange}
          />
        )}

        <View style={styles.summaryRow}>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>Working Days</Text>
            <Text style={styles.summaryValue}>{totals.days}</Text>
          </View>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>Advance</Text>
            <Text style={styles.summaryValue}>{money(totals.advance)}</Text>
          </View>
        </View>
      </View>

      <View style={styles.tableWrap}>
        <View style={styles.tableHeader}>
          <Text style={[styles.cell, styles.dateCell]}>Date</Text>
          <Text style={[styles.cell, styles.statusCell]}>Attendance</Text>
          <Text style={[styles.cell, styles.amountCell]}>Advance</Text>
        </View>
        <FlatList
          data={rows}
          keyExtractor={(item) => item.date}
          style={styles.tableList}
          contentContainerStyle={rows.length ? undefined : styles.tableEmptyWrap}
          ListEmptyComponent={<Text style={styles.empty}>Select a labour to view the monthly report.</Text>}
          renderItem={({ item }) => (
            <View style={styles.tableRow}>
              <Text style={[styles.cell, styles.dateCell]}>{item.date}</Text>
              <Text style={[styles.cell, styles.statusCell]}>{item.status ? statusLabels[item.status] : '-'}</Text>
              <Text style={[styles.cell, styles.amountCell]}>{item.advance ? money(item.advance) : '-'}</Text>
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
    backgroundColor: '#F3F6F1',
    padding: 12,
  },
  selector: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D7E0DA',
    padding: 10,
  },
  title: {
    color: '#17231F',
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 8,
  },
  input: {
    minHeight: 42,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD8D2',
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  labourPill: {
    maxWidth: 150,
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD8D2',
    justifyContent: 'center',
    marginRight: 8,
  },
  labourPillActive: {
    backgroundColor: '#153D36',
    borderColor: '#153D36',
  },
  labourPillText: {
    color: '#40534B',
    fontWeight: '800',
  },
  labourPillTextActive: {
    color: '#FFFFFF',
  },
  emptyInline: {
    color: '#687871',
    paddingVertical: 10,
  },
  reportCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D7E0DA',
    padding: 10,
    marginTop: 10,
  },
  reportTopRow: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  selectedInfo: {
    flex: 1,
    minWidth: 0,
  },
  metaLabel: {
    color: '#66756F',
    fontSize: 11,
    fontWeight: '800',
  },
  selectedName: {
    color: '#17231F',
    fontSize: 16,
    fontWeight: '900',
    marginTop: 1,
  },
  selectedPhone: {
    color: '#66756F',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 1,
  },
  dateButton: {
    minHeight: 42,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD8D2',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateLabel: {
    color: '#66756F',
    fontSize: 11,
    fontWeight: '800',
  },
  dateValue: {
    color: '#17231F',
    fontSize: 15,
    fontWeight: '900',
  },
  calendarText: {
    color: '#153D36',
    fontWeight: '900',
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  summaryBox: {
    flex: 1,
    backgroundColor: '#EEF4EC',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  summaryLabel: {
    color: '#66756F',
    fontSize: 11,
    fontWeight: '800',
  },
  summaryValue: {
    color: '#17231F',
    fontSize: 17,
    fontWeight: '900',
    marginTop: 2,
  },
  shareButton: {
    width: 72,
    minHeight: 42,
    borderRadius: 8,
    backgroundColor: '#153D36',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareButtonDisabled: {
    backgroundColor: '#8FA19A',
  },
  shareText: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
  tableWrap: {
    flex: 1,
    marginTop: 10,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#D7E0DA',
    backgroundColor: '#FFFFFF',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#DDE9E4',
  },
  tableList: {
    flex: 1,
  },
  tableRow: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E1E9E5',
  },
  cell: {
    minHeight: 34,
    paddingHorizontal: 8,
    paddingVertical: 7,
    color: '#17231F',
    fontSize: 12,
  },
  dateCell: {
    flex: 1.05,
  },
  statusCell: {
    flex: 1.25,
  },
  amountCell: {
    flex: 0.9,
    textAlign: 'right',
  },
  tableEmptyWrap: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  empty: {
    color: '#687871',
    textAlign: 'center',
    padding: 18,
  },
});
