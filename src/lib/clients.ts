import { ClientProfile } from '../types';
import { clientsApiUrl } from './config';

export type NewClientInput = {
  userId: string;
  loginId: string;
  password: string;
  contractorName: string;
  phoneNumber: string;
  contractorTitle: string;
  active: boolean;
};

export async function loadClientsFromSheety(options: { throwOnError?: boolean } = {}) {
  try {
    const payload = await requestClientsApi('list', { method: 'GET' });
    const rows = Array.isArray(payload) ? payload : payload?.clients;
    if (!Array.isArray(rows)) {
      if (options.throwOnError) throw new Error('Google Sheet API returned an invalid users response.');
      return [];
    }

    return parseSheetyClients(rows);
  } catch (error) {
    if (options.throwOnError) throw error;
    return [];
  }
}

export async function addClientToSheety(client: NewClientInput) {
  await requestClientsApi('add', {
    client: {
      user_id: client.userId,
      login_id: client.loginId,
      password: client.password,
      contractor_name: client.contractorName,
      phone_number: client.phoneNumber,
      contractor_title: client.contractorTitle,
      role: 'client',
      active: client.active ? 1 : 0,
      loggedIn: 0,
    },
  });
}

export async function updateClientLoginState(client: ClientProfile, deviceId: string, loggedIn: boolean) {
  if (!client.sheetyObjectId) {
    if (loggedIn) throw new Error('Sheet row ID not found for this user.');
    return;
  }

  try {
    await updateSheetyClient(client.sheetyObjectId, {
      lastLoginAt: new Date().toISOString(),
      lastDeviceId: deviceId,
      loggedIn: loggedIn ? 1 : 0,
    });
  } catch (error) {
    if (loggedIn) throw error;
    // Logout should not block the user if the sheet is temporarily unavailable.
  }
}

export async function updateClientActiveState(client: ClientProfile, active: boolean) {
  if (!client.sheetyObjectId) throw new Error('Sheet row ID not found for this user.');

  await updateSheetyClient(client.sheetyObjectId, {
    active: active ? 1 : 0,
    ...(active ? {} : { loggedIn: 0 }),
  });
}

async function updateSheetyClient(sheetyObjectId: number, fields: Record<string, string | number>) {
  await requestClientsApi('update', {
    id: sheetyObjectId,
    client: fields,
  });
}

async function requestClientsApi(
  action: 'list' | 'add' | 'update' | 'delete',
  body: Record<string, unknown> & { method?: 'GET' | 'POST' } = {},
) {
  const method = body.method ?? 'POST';
  const response = await fetch(method === 'GET' ? buildApiUrl(action) : clientsApiUrl, {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
    ...(method === 'GET' ? {} : { body: JSON.stringify({ action, ...body }) }),
  });

  const payload = await readApiJson(response);
  if (!response.ok || payload?.error) {
    throw new Error(payload?.error || `Google Sheet API request failed: ${response.status}`);
  }

  return payload;
}

function buildApiUrl(action: string) {
  return `${clientsApiUrl}?action=${encodeURIComponent(action)}&_=${Date.now()}`;
}

async function readApiJson(response: Response) {
  const text = await response.text();
  const cleanText = text.trim();
  if (cleanText.startsWith('<')) {
    if (cleanText.includes('Script function not found: doGet')) {
      throw new Error('Google Apps Script deployment is not updated. Add doGet/doPost code and deploy a new web app version.');
    }

    if (response.url.includes('accounts.google.com') || cleanText.includes('ServiceLogin')) {
      throw new Error('Google Apps Script returned a Google sign-in page. Use the public /exec web app URL, not the /dev URL.');
    }

    throw new Error('Google Apps Script returned an HTML page instead of JSON. Check the web app deployment access and URL.');
  }

  try {
    return JSON.parse(cleanText || '{}');
  } catch {
    throw new Error('Google Sheet API returned invalid JSON.');
  }
}

export function findClientByCredentials(clients: ClientProfile[], id: string, password: string) {
  const cleanId = normalizeLoginValue(id);
  const cleanPassword = stringValue(password);
  return (
    clients.find(
      (client) =>
        client.active &&
        (normalizeLoginValue(client.id) === cleanId || normalizeLoginValue(client.userId) === cleanId) &&
        stringValue(client.password) === cleanPassword,
    ) ??
    null
  );
}

export function findClientById(clients: ClientProfile[], id: string) {
  const cleanId = normalizeLoginValue(id);
  return clients.find((client) => normalizeLoginValue(client.id) === cleanId) ?? null;
}

function parseSheetyClients(rows: Array<Record<string, unknown>>): ClientProfile[] {
  return rows
    .map((record) => {
      const role = readField(record, 'role').toLowerCase() === 'admin' ? 'admin' : 'client';
      return {
        sheetyObjectId: parseSheetyObjectId(readRawField(record, 'id')),
        userId: readField(record, 'userId', 'user_id', 'user id', 'userid'),
        id: readField(record, 'loginId', 'login_id', 'login id', 'clientId', 'client_id', 'client id', 'id'),
        password: readField(record, 'password', 'pass'),
        contractorName: readField(record, 'contractorName', 'contractor_name', 'contractor name', 'name'),
        phoneNumber: readField(record, 'phoneNumber', 'phone_number', 'phone number', 'phone', 'mobile'),
        contractorTitle: readField(record, 'contractorTitle', 'contractor_title', 'contractor title', 'title'),
        role,
        active: parseActive(readRawField(record, 'active', 'status')),
        lastLoginAt: readField(record, 'lastLoginAt', 'last_login_at', 'last login at'),
        lastDeviceId: readField(record, 'lastDeviceId', 'last_device_id', 'last device id'),
        loggedIn: parseBoolean(readField(record, 'loggedIn', 'logged_in', 'logged in')),
      } satisfies ClientProfile;
    })
    .filter((client) => client.userId && client.id && client.password && client.contractorName && client.contractorTitle);
}

function stringValue(value: unknown) {
  return String(value ?? '').trim();
}

function readField(record: Record<string, unknown>, ...names: string[]) {
  return stringValue(readRawField(record, ...names));
}

function readRawField(record: Record<string, unknown>, ...names: string[]) {
  const keys = Object.keys(record);
  for (const name of names) {
    const normalizedName = normalizeColumnName(name);
    const key = keys.find((recordKey) => normalizeColumnName(recordKey) === normalizedName);
    if (key) return record[key];
  }

  return undefined;
}

function normalizeColumnName(value: string) {
  return value.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

function normalizeLoginValue(value: string) {
  return stringValue(value).toLowerCase();
}

function parseActive(value: unknown) {
  const cleanValue = stringValue(value).toLowerCase();
  if (!cleanValue) return true;
  return cleanValue === '1' || cleanValue === 'true' || cleanValue === 'yes' || cleanValue === 'active';
}

function parseBoolean(value: unknown) {
  const cleanValue = stringValue(value).toLowerCase();
  return cleanValue === '1' || cleanValue === 'true' || cleanValue === 'yes';
}

function parseSheetyObjectId(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
