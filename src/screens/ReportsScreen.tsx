import { Ionicons } from '@expo/vector-icons';
import * as SQLite from 'expo-sqlite';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { getMonthlyReport } from '../lib/db';
import { money, monthFromKey, monthKey, normalize, statusLabels } from '../lib/format';
import { shareLabourReport } from '../lib/pdf';
import { colors, radius, spacing, cardShadow, statusColors } from '../theme';
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
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.selector}>
        <View style={styles.titleRow}>
          <View style={styles.titleIconWrap}>
            <Ionicons name="document-text-outline" size={18} color={colors.primary} />
          </View>
          <Text style={styles.title}>Monthly Report</Text>
        </View>
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={16} color={colors.textMuted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search labour name or number"
            placeholderTextColor={colors.textMuted}
            style={styles.searchInput}
          />
        </View>
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
              <Ionicons
                name="person"
                size={13}
                color={selectedLabour?.id === item.id ? '#FFFFFF' : colors.textSecondary}
              />
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
            <Ionicons name="document-attach-outline" size={16} color="#FFFFFF" />
            <Text style={styles.shareText}>PDF</Text>
          </Pressable>
        </View>

        <Pressable style={styles.dateButton} onPress={() => setShowMonthCalendar(true)}>
          <View style={styles.dateButtonLeft}>
            <Ionicons name="calendar-outline" size={16} color={colors.primary} />
            <View>
              <Text style={styles.dateLabel}>Report Month</Text>
              <Text style={styles.dateValue}>{month}</Text>
            </View>
          </View>
          <View style={styles.chooseChip}>
            <Text style={styles.calendarText}>Choose</Text>
          </View>
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
            <View style={styles.summaryIconRow}>
              <Ionicons name="calendar-clear-outline" size={14} color={colors.primary} />
              <Text style={styles.summaryLabel}>Working Days</Text>
            </View>
            <Text style={styles.summaryValue}>{totals.days}</Text>
          </View>
          <View style={styles.summaryBox}>
            <View style={styles.summaryIconRow}>
              <Ionicons name="cash-outline" size={14} color={colors.primary} />
              <Text style={styles.summaryLabel}>Advance</Text>
            </View>
            <Text style={styles.summaryValue}>{money(totals.advance)}</Text>
          </View>
        </View>
      </View>

      <View style={styles.tableWrap}>
        <View style={styles.tableHeader}>
          <Text style={[styles.cell, styles.headerCell, styles.dateCell]}>Date</Text>
          <Text style={[styles.cell, styles.headerCell, styles.statusCell]}>Attendance</Text>
          <Text style={[styles.cell, styles.headerCell, styles.amountCell]}>Advance</Text>
        </View>
        <FlatList
          data={rows}
          keyExtractor={(item) => item.date}
          style={styles.tableList}
          contentContainerStyle={rows.length ? undefined : styles.tableEmptyWrap}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="stats-chart-outline" size={26} color={colors.textMuted} />
              <Text style={styles.emptyText}>Select a labour to view the monthly report.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.tableRow}>
              <Text style={[styles.cell, styles.dateCell]}>{item.date}</Text>
              <Text
                style={[
                  styles.cell,
                  styles.statusCell,
                  styles.statusText,
                  item.status ? { color: statusColors[item.status] } : null,
                ]}
              >
                {item.status ? statusLabels[item.status] : '-'}
              </Text>
              <Text style={[styles.cell, styles.amountCell]}>{item.advance ? money(item.advance) : '-'}</Text>
            </View>
          )}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.md,
  },
  selector: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    ...cardShadow,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  titleIconWrap: {
    width: 30,
    height: 30,
    borderRadius: radius.sm,
    backgroundColor: colors.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '900',
  },
  searchWrap: {
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  searchInput: {
    flex: 1,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  labourPill: {
    maxWidth: 160,
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginRight: spacing.sm,
  },
  labourPillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  labourPillText: {
    color: colors.textSecondary,
    fontWeight: '800',
  },
  labourPillTextActive: {
    color: '#FFFFFF',
  },
  emptyInline: {
    color: colors.textMuted,
    paddingVertical: 10,
  },
  reportCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginTop: spacing.sm,
    ...cardShadow,
  },
  reportTopRow: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  selectedInfo: {
    flex: 1,
    minWidth: 0,
  },
  metaLabel: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '800',
  },
  selectedName: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '900',
    marginTop: 1,
  },
  selectedPhone: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 1,
  },
  dateButton: {
    minHeight: 46,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    marginTop: spacing.sm,
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
    fontSize: 11,
    fontWeight: '800',
  },
  dateValue: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '900',
  },
  chooseChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.accentLight,
  },
  calendarText: {
    color: colors.accentDark,
    fontWeight: '900',
    fontSize: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  summaryBox: {
    flex: 1,
    backgroundColor: colors.successBg,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  summaryIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  summaryLabel: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '800',
  },
  summaryValue: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: '900',
    marginTop: 4,
  },
  shareButton: {
    minWidth: 76,
    minHeight: 42,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: spacing.sm,
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
    marginTop: spacing.sm,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    ...cardShadow,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: colors.chipInactiveBg,
  },
  headerCell: {
    fontWeight: '900',
    color: colors.textSecondary,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  tableList: {
    flex: 1,
  },
  tableRow: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  cell: {
    minHeight: 36,
    paddingHorizontal: 8,
    paddingVertical: 8,
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: '600',
  },
  statusText: {
    fontWeight: '800',
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
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.xl,
  },
  emptyText: {
    color: colors.textMuted,
    textAlign: 'center',
  },
});