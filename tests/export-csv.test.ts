import { describe, expect, it } from "vitest";
import { formatCentsAsZar } from "@slipsheet/money";
import { ParsedReceipt, toSheetRow } from "@slipsheet/schema";
import { sheetRowsToCsv } from "@slipsheet/sheets";

describe("CSV export fallback", () => {
  it("builds downloadable CSV from parsed receipt", () => {
    const receipt: ParsedReceipt = {
      schema_version: 1,
      vendor: { value: "Cape Stationers", confidence: 0.9 },
      invoice_date: { value: "2026-01-22", confidence: 0.88 },
      currency: "ZAR",
      subtotal_cents: { value: 100000, confidence: 0.85 },
      tax_cents: { value: 15000, confidence: 0.85 },
      total_cents: { value: 115000, confidence: 0.92 },
      line_items: [],
      warnings: [],
    };

    const row = toSheetRow({
      receipt,
      ingestedAt: "2026-01-22T10:00:00.000Z",
      messageId: "<test@example.com>",
      contentHash: "deadbeef",
      formatZar: formatCentsAsZar,
    });

    const csv = sheetRowsToCsv([row]);
    expect(csv).toContain("ingested_at");
    expect(csv).toContain("R 1 150.00");
    expect(csv).toContain("Cape Stationers");
  });
});
