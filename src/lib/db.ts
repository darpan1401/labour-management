import * as SQLite from 'expo-sqlite';
import { Attendance, AttendanceStatus, Labour, ReportRow } from '../types';
import { statusValue } from './format';

export async function openAppDatabase() {
  const db = await SQLite.openDatabaseAsync('labour-management.db');
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS labours (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      labour_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      status TEXT NOT NULL,
      advance_amount REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(labour_id, date),
      FOREIGN KEY(labour_id) REFERENCES labours(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  return db;
}

export async function getStoredClientId(db: SQLite.SQLiteDatabase) {
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', ['client_id']);
  return row?.value ?? null;
}

export async function saveStoredClientId(db: SQLite.SQLiteDatabase, clientId: string) {
  await saveSetting(db, 'client_id', clientId);
}

export async function clearStoredClientId(db: SQLite.SQLiteDatabase) {
  await db.runAsync('DELETE FROM app_settings WHERE key = ?', ['client_id']);
}

export async function getAppSetting(db: SQLite.SQLiteDatabase, key: string) {
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', [key]);
  return row?.value ?? null;
}

export async function setAppSetting(db: SQLite.SQLiteDatabase, key: string, value: string) {
  await saveSetting(db, key, value);
}

export async function deleteAppSetting(db: SQLite.SQLiteDatabase, key: string) {
  await db.runAsync('DELETE FROM app_settings WHERE key = ?', [key]);
}

export async function getOrCreateDeviceId(db: SQLite.SQLiteDatabase) {
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', ['device_id']);
  if (row?.value) return row.value;

  const deviceId = `device-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  await saveSetting(db, 'device_id', deviceId);
  return deviceId;
}

async function saveSetting(db: SQLite.SQLiteDatabase, key: string, value: string) {
  await db.runAsync(
    `INSERT INTO app_settings (key, value)
     VALUES (?, ?)
     ON CONFLICT(key)
     DO UPDATE SET value = excluded.value,
                   updated_at = CURRENT_TIMESTAMP`,
    [key, value],
  );
}

export async function getLabours(db: SQLite.SQLiteDatabase) {
  return db.getAllAsync<Labour>('SELECT id, name, phone FROM labours ORDER BY name COLLATE NOCASE');
}

export async function addLabour(db: SQLite.SQLiteDatabase, name: string, phone: string) {
  await db.runAsync('INSERT OR IGNORE INTO labours (name, phone) VALUES (?, ?)', [name, phone]);
}

export async function deleteLabour(db: SQLite.SQLiteDatabase, id: number) {
  await db.runAsync('DELETE FROM attendance WHERE labour_id = ?', [id]);
  await db.runAsync('DELETE FROM labours WHERE id = ?', [id]);
}

export async function getAttendanceForDate(db: SQLite.SQLiteDatabase, labourId: number, date: string) {
  return db.getFirstAsync<Attendance>(
    'SELECT id, labour_id, date, status, advance_amount FROM attendance WHERE labour_id = ? AND date = ?',
    [labourId, date],
  );
}

export async function saveAttendance(
  db: SQLite.SQLiteDatabase,
  labourId: number,
  date: string,
  status: AttendanceStatus,
  advanceAmount: number,
) {
  await db.runAsync(
    `INSERT INTO attendance (labour_id, date, status, advance_amount)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(labour_id, date)
     DO UPDATE SET status = excluded.status,
                   advance_amount = excluded.advance_amount,
                   updated_at = CURRENT_TIMESTAMP`,
    [labourId, date, status, advanceAmount],
  );
}

export async function getMonthlyReport(db: SQLite.SQLiteDatabase, labourId: number, month: string) {
  const [year, monthNumber] = month.split('-').map(Number);
  const days = new Date(year, monthNumber, 0).getDate();
  const rows = await db.getAllAsync<Attendance>(
    `SELECT id, labour_id, date, status, advance_amount
     FROM attendance
     WHERE labour_id = ? AND substr(date, 1, 7) = ?
     ORDER BY date`,
    [labourId, month],
  );
  const byDate = new Map(rows.map((row) => [row.date, row]));
  const reportRows: ReportRow[] = Array.from({ length: days }, (_, index) => {
    const day = index + 1;
    const date = `${month}-${String(day).padStart(2, '0')}`;
    const row = byDate.get(date);
    return {
      day,
      date,
      status: row?.status,
      advance: row?.advance_amount ?? 0,
    };
  });

  const totals = reportRows.reduce(
    (sum, row) => {
      sum.advance += row.advance;
      if (row.status) sum.days += statusValue[row.status];
      return sum;
    },
    { advance: 0, days: 0 },
  );

  return { rows: reportRows, totals };
}
