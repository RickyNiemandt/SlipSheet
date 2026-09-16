import { describe, expect, it } from "vitest";
import { SHEET_HEADERS, toSheetRow, type ParsedReceipt } from "@slipsheet/schema";
import { formatCentsAsZar } from "@slipsheet/money";
import { rowToValues, sheetRowsToCsv } from "@slipsheet/sheets";

const receipt: ParsedReceipt = {
  schema_version: 1,
  vendor: { value: "Test", confidence: 0.9 },
  invoice_date: { value: "2026-03-01", confidence: 0.9 },
  currency: "ZAR",
  subtotal_cents: { value: null, confidence: 0.2 },
  tax_cents: { value: null, confidence: 0.2 },
  total_cents: { value: 5000, confidence: 0.9 },
  line_items: [],
  warnings: [],
};

describe("sheets", () => {
  it("maps row to values in header order", () => {
    const row = toSheetRow({
      receipt,
      ingestedAt: "2026-03-01T12:00:00.000Z",
      messageId: "<id@test>",
      contentHash: "abc",
      formatZar: formatCentsAsZar,
    });
    const values = rowToValues(row);
    expect(values).toHaveLength(SHEET_HEADERS.length);
    expect(values[5]).toBe("R 50.00");
  });

  it("exports CSV with header row", () => {
    const row = toSheetRow({
      receipt,
      ingestedAt: "2026-03-01T12:00:00.000Z",
      messageId: "<id@test>",
      contentHash: "abc",
      formatZar: formatCentsAsZar,
    });
    const csv = sheetRowsToCsv([row]);
    expect(csv.startsWith(SHEET_HEADERS.join(","))).toBe(true);
    expect(csv).toContain("R 50.00");
  });
});
