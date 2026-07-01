export type Labour = {
  id: number;
  name: string;
  phone: string;
};

export type ClientProfile = {
  userId: string;
  id: string;
  password: string;
  contractorName: string;
  phoneNumber: string;
  contractorTitle: string;
  role: 'client' | 'admin';
  active: boolean;
  sheetyObjectId?: number;
  lastLoginAt?: string;
  lastDeviceId?: string;
  loggedIn?: boolean;
};

export type AttendanceStatus = 'present' | 'absent' | 'half' | 'one_half';

export type Attendance = {
  id?: number;
  labour_id: number;
  date: string;
  status: AttendanceStatus;
  advance_amount: number;
};

export type ReportRow = {
  day: number;
  date: string;
  status?: AttendanceStatus;
  advance: number;
};

export type ReportTotals = {
  advance: number;
  days: number;
};

export type TabKey = 'dashboard' | 'labours' | 'reports';
