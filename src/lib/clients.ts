import { ClientProfile } from '../types';

const sheetyClientsUrl = 'https://api.sheety.co/0e48fad6658810dd1abf0d491789e405/labourManagement/clients';

export type NewClientInput = {
  userId: string;
  loginId: string;
  password: string;
  contractorName: string;
  phoneNumber: string;
  contractorTitle: string;
  active: boolean;
};

export async function loadClientsFromSheety() {
  try {
    const response = await fetch(`${sheetyClientsUrl}?_=${Date.now()}`);
    if (!response.ok) return [];

    const payload = await response.json();
    if (!payload || !Array.isArray(payload.clients)) return [];

    return parseSheetyClients(payload.clients);
  } catch {
    return [];
  }
}

export async function addClientToSheety(client: NewClientInput) {
  const response = await fetch(sheetyClientsUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client: {
        userId: client.userId,
        loginId: client.loginId,
        password: client.password,
        contractorName: client.contractorName,
        phoneNumber: client.phoneNumber,
        contractorTitle: client.contractorTitle,
        role: 'client',
        active: client.active ? 1 : 0,
        loggedIn: 0,
      },
    }),
  });

  if (!response.ok) {
    const detail = await readSheetyError(response);
    throw new Error(detail || `Sheety add failed: ${response.status}`);
  }
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
  const response = await fetch(`${sheetyClientsUrl}/${sheetyObjectId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client: fields,
    }),
  });

  if (!response.ok) {
    const detail = await readSheetyError(response);
    throw new Error(detail || `Sheety update failed: ${response.status}`);
  }
}

async function readSheetyError(response: Response) {
  try {
    const payload = await response.json();
    const detail = payload?.errors?.[0]?.detail;
    return typeof detail === 'string' ? detail : '';
  } catch {
    return '';
  }
}

export function findClientByCredentials(clients: ClientProfile[], id: string, password: string) {
  const cleanId = id.trim().toLowerCase();
  return (
    clients.find((client) => client.active && client.id.toLowerCase() === cleanId && client.password === password.trim()) ??
    null
  );
}

export function findClientById(clients: ClientProfile[], id: string) {
  const cleanId = id.trim().toLowerCase();
  return clients.find((client) => client.id.toLowerCase() === cleanId) ?? null;
}

function parseSheetyClients(rows: Array<Record<string, unknown>>): ClientProfile[] {
  return rows
    .map((record) => {
      const role = stringValue(record.role) === 'admin' ? 'admin' : 'client';
      return {
        sheetyObjectId: parseSheetyObjectId(record.id),
        userId: firstString(record.userId, record.user_id),
        id: firstString(record.loginId, record.login_id),
        password: stringValue(record.password),
        contractorName: firstString(record.contractorName, record.contractor_name),
        phoneNumber: firstString(record.phoneNumber, record.phone_number),
        contractorTitle: firstString(record.contractorTitle, record.contractor_title),
        role,
        active: parseActive(record.active),
        lastLoginAt: firstString(record.lastLoginAt, record.last_login_at),
        lastDeviceId: firstString(record.lastDeviceId, record.last_device_id),
        loggedIn: parseBoolean(firstString(record.loggedIn, record.logged_in)),
      } satisfies ClientProfile;
    })
    .filter((client) => client.userId && client.id && client.password && client.contractorName && client.contractorTitle);
}

function firstString(...values: unknown[]) {
  return values.map(stringValue).find(Boolean) ?? '';
}

function stringValue(value: unknown) {
  return String(value ?? '').trim();
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
