import { SHEET_HEADERS, type SheetRow } from "@slipsheet/schema";

function escapeCsv(value: string | number): string {
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function sheetRowToCsvLine(row: SheetRow): string {
  return SHEET_HEADERS.map((header) => escapeCsv(row[header] ?? "")).join(",");
}

export function sheetRowsToCsv(rows: SheetRow[]): string {
  const headerLine = SHEET_HEADERS.join(",");
  const lines = rows.map(sheetRowToCsvLine);
  return [headerLine, ...lines].join("\n") + "\n";
}
