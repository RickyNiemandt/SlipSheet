import { describe, expect, it } from "vitest";
import {
  ParsedReceipt,
  confidenceLabel,
  lowConfidenceFields,
  toSheetRow,
} from "@slipsheet/schema";
import { formatCentsAsZar } from "@slipsheet/money";

const sampleReceipt: ParsedReceipt = {
  schema_version: 1,
  vendor: { value: "Acme Supplies", confidence: 0.92 },
  invoice_date: { value: "2026-03-15", confidence: 0.88 },
  currency: "ZAR",
  subtotal_cents: { value: 10000, confidence: 0.9 },
  tax_cents: { value: 1500, confidence: 0.85 },
  total_cents: { value: 11500, confidence: 0.95 },
  line_items: [],
  warnings: [],
};

describe("schema", () => {
  it("validates ParsedReceipt", () => {
    expect(ParsedReceipt.parse(sampleReceipt)).toEqual(sampleReceipt);
  });

  it("labels confidence bands", () => {
    expect(confidenceLabel(0.4)).toBe("low");
    expect(confidenceLabel(0.7)).toBe("medium");
    expect(confidenceLabel(0.9)).toBe("high");
  });

  it("maps to sheet row with ZAR display", () => {
    const row = toSheetRow({
      receipt: sampleReceipt,
      ingestedAt: "2026-03-16T10:00:00.000Z",
      messageId: "<test@example.com>",
      contentHash: "abc123",
      formatZar: formatCentsAsZar,
    });

    expect(row.total_display).toBe("R 115.00");
    expect(row.total_cents).toBe(11500);
    expect(row.status).toBe("parsed");
  });

  it("flags low confidence total", () => {
    const receipt: ParsedReceipt = {
      ...sampleReceipt,
      total_cents: { value: null, confidence: 0.3 },
      warnings: ["total_not_visible"],
    };
    expect(lowConfidenceFields(receipt)).toContain("total");
  });
});
