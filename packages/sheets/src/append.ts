import { SHEET_HEADERS, type SheetRow } from "@slipsheet/schema";

const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";

export interface AppendRowInput {
  accessToken: string;
  spreadsheetId: string;
  sheetName?: string;
  row: SheetRow;
}

export interface AppendRowResult {
  updatedRange: string;
  updatedRows: number;
}

export function rowToValues(row: SheetRow): (string | number)[] {
  return SHEET_HEADERS.map((header) => {
    const value = row[header];
    return value === "" ? "" : value;
  });
}

export async function appendSheetRow(input: AppendRowInput): Promise<AppendRowResult> {
  const sheetName = input.sheetName ?? "SlipSheet";
  const range = `${sheetName}!A:M`;
  const url = `${SHEETS_API}/${input.spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      values: [rowToValues(input.row)],
    }),
  });

  if (!response.ok) {
    throw new Error(`Sheets append failed: ${await response.text()}`);
  }

  const payload = (await response.json()) as {
    updates?: { updatedRange?: string; updatedRows?: number };
  };

  return {
    updatedRange: payload.updates?.updatedRange ?? range,
    updatedRows: payload.updates?.updatedRows ?? 1,
  };
}

export async function ensureSheetHeaders(input: {
  accessToken: string;
  spreadsheetId: string;
  sheetName?: string;
}): Promise<void> {
  const sheetName = input.sheetName ?? "SlipSheet";
  const range = `${sheetName}!A1:M1`;
  const url = `${SHEETS_API}/${input.spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=RAW`;

  const getResp = await fetch(`${SHEETS_API}/${input.spreadsheetId}/values/${encodeURIComponent(range)}`, {
    headers: { Authorization: `Bearer ${input.accessToken}` },
  });

  if (getResp.ok) {
    const existing = (await getResp.json()) as { values?: string[][] };
    if (existing.values?.[0]?.[0] === SHEET_HEADERS[0]) {
      return;
    }
  }

  const putResp = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ values: [SHEET_HEADERS as unknown as string[]] }),
  });

  if (!putResp.ok) {
    throw new Error(`Failed to seed headers: ${await putResp.text()}`);
  }
}
