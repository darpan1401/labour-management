import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Alert } from 'react-native';
import { ClientProfile, Labour, ReportRow, ReportTotals } from '../types';
import { money, statusLabels } from './format';

export async function shareLabourReport(
  client: ClientProfile,
  labour: Labour,
  month: string,
  rows: ReportRow[],
  totals: ReportTotals,
) {
  const html = buildReportHtml(client, labour, month, rows, totals);
  const file = await Print.printToFileAsync({ html, base64: false });
  const canShare = await Sharing.isAvailableAsync();

  if (!canShare) {
    Alert.alert('Report created', file.uri);
    return;
  }

  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/pdf',
    dialogTitle: `${labour.name} ${month} Report`,
    UTI: 'com.adobe.pdf',
  });
}

function buildReportHtml(client: ClientProfile, labour: Labour, month: string, rows: ReportRow[], totals: ReportTotals) {
  const tableRows = rows
    .map(
      (row) => `
        <tr>
          <td>${row.date}</td>
          <td>${row.status ? statusLabels[row.status] : ''}</td>
          <td class="amount">${row.advance ? money(row.advance) : ''}</td>
        </tr>
      `,
    )
    .join('');

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: Arial, sans-serif; color: #171f1b; padding: 26px; }
          .brand { font-size: 22px; font-weight: 800; text-align: center; border-bottom: 2px solid #111; padding-bottom: 10px; margin-bottom: 18px; }
          .meta { font-size: 13px; line-height: 1.7; margin-bottom: 16px; }
          .summary { display: flex; gap: 12px; margin: 16px 0; }
          .box { border: 1px solid #b8c5bf; padding: 12px; flex: 1; border-radius: 6px; }
          .label { color: #65756f; font-size: 12px; }
          .value { font-size: 18px; font-weight: 800; margin-top: 4px; }
          table { width: 100%; border-collapse: collapse; margin-top: 16px; }
          th, td { border: 1px solid #cfd8d3; padding: 8px; font-size: 12px; text-align: left; }
          th { background: #edf4f1; }
          .amount { text-align: right; }
        </style>
      </head>
      <body>
        <div class="brand">${escapeHtml(client.contractorTitle)}</div>
        <div class="meta">
          <strong>CONTRACTOR NAME:</strong> ${escapeHtml(client.contractorName)}<br />
          <strong>CONTRACTOR PHONE:</strong> ${escapeHtml(client.phoneNumber || '-')}<br />
          <strong>LABOUR NAME:</strong> ${escapeHtml(labour.name)}<br />
          <strong>LABOUR NUMBER:</strong> ${escapeHtml(labour.phone)}<br />
          <strong>MONTH:</strong> ${month}
        </div>
        <div class="summary">
          <div class="box"><div class="label">MONTH WORKING DAYS</div><div class="value">${totals.days}</div></div>
          <div class="box"><div class="label">MONTH ADVANCE</div><div class="value">${money(totals.advance)}</div></div>
        </div>
        <table>
          <thead><tr><th>Date</th><th>Attendance</th><th class="amount">Advance</th></tr></thead>
          <tbody>${tableRows}</tbody>
        </table>
      </body>
    </html>
  `;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
