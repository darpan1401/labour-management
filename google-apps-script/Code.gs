const SHEET_NAME = 'clients';

function doGet(e) {
  try {
    const action = String(e.parameter.action || 'list');
    if (action !== 'list') {
      return jsonResponse({ error: 'Unsupported GET action.' }, 400);
    }

    return jsonResponse({ clients: listClients() });
  } catch (error) {
    return jsonResponse({ error: String(error && error.message ? error.message : error) }, 500);
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData && e.postData.contents ? e.postData.contents : '{}');
    const action = String(body.action || '').toLowerCase();

    if (action === 'add') {
      return jsonResponse({ client: addClient(body.client || {}) });
    }

    if (action === 'update') {
      return jsonResponse({ client: updateClient(Number(body.id), body.client || {}) });
    }

    if (action === 'delete') {
      deleteClient(Number(body.id));
      return jsonResponse({ ok: true });
    }

    return jsonResponse({ error: 'Unsupported POST action.' }, 400);
  } catch (error) {
    return jsonResponse({ error: String(error && error.message ? error.message : error) }, 500);
  }
}

function listClients() {
  const sheet = getClientsSheet();
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  const headers = values[0].map(String);
  return values.slice(1).map(function (row, index) {
    const client = { id: index + 2 };
    headers.forEach(function (header, columnIndex) {
      client[header] = row[columnIndex];
    });
    return client;
  });
}

function addClient(client) {
  const sheet = getClientsSheet();
  const headers = getHeaders(sheet);
  const row = headers.map(function (header) {
    return clientValue(client, header);
  });

  sheet.appendRow(row);
  const rowNumber = sheet.getLastRow();
  return Object.assign({ id: rowNumber }, client);
}

function updateClient(rowNumber, fields) {
  const sheet = getClientsSheet();
  if (!rowNumber || rowNumber < 2 || rowNumber > sheet.getLastRow()) {
    throw new Error('Invalid row id.');
  }

  const headers = getHeaders(sheet);
  headers.forEach(function (header, index) {
    const value = clientValue(fields, header);
    if (value !== undefined) {
      sheet.getRange(rowNumber, index + 1).setValue(value);
    }
  });

  return Object.assign({ id: rowNumber }, fields);
}

function deleteClient(rowNumber) {
  const sheet = getClientsSheet();
  if (!rowNumber || rowNumber < 2 || rowNumber > sheet.getLastRow()) {
    throw new Error('Invalid row id.');
  }

  sheet.deleteRow(rowNumber);
}

function getClientsSheet() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = spreadsheet.getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('Sheet tab not found: ' + SHEET_NAME);
  return sheet;
}

function getHeaders(sheet) {
  return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
}

function clientValue(client, header) {
  const aliases = {
    user_id: ['user_id', 'userId'],
    login_id: ['login_id', 'loginId'],
    contractor_name: ['contractor_name', 'contractorName'],
    phone_number: ['phone_number', 'phoneNumber'],
    contractor_title: ['contractor_title', 'contractorTitle'],
    loggedIn: ['loggedIn', 'logged_in'],
    lastDeviceId: ['lastDeviceId', 'last_device_id'],
    lastLoginAt: ['lastLoginAt', 'last_login_at'],
  };

  const keys = aliases[header] || [header];
  for (var i = 0; i < keys.length; i += 1) {
    if (Object.prototype.hasOwnProperty.call(client, keys[i])) {
      return client[keys[i]];
    }
  }

  return undefined;
}

function jsonResponse(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
