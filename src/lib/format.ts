import { AttendanceStatus } from '../types';

export const attendanceOptions: Array<{ label: string; value: AttendanceStatus }> = [
  { label: 'Full Day', value: 'present' },
  { label: 'Absent', value: 'absent' },
  { label: 'Half Day', value: 'half' },
  { label: 'One & Half', value: 'one_half' },
];

export const statusLabels: Record<AttendanceStatus, string> = {
  present: 'Full Day',
  absent: 'Absent',
  half: 'Half Day',
  one_half: 'One & Half Day',
};

export const statusValue: Record<AttendanceStatus, number> = {
  present: 1,
  absent: 0,
  half: 0.5,
  one_half: 1.5,
};

export function formatDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function monthKey(date: Date) {
  return formatDate(date).slice(0, 7);
}

export function dateFromKey(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

export function monthFromKey(value: string) {
  const [year, month] = value.split('-').map(Number);
  return new Date(year, (month || 1) - 1, 1);
}

export function cleanPhone(value: string) {
  return value.replace(/[^\d+]/g, '').trim();
}

export function money(value: number) {
  return `Rs. ${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

export function normalize(value: string) {
  return value.trim().toLowerCase();
}
