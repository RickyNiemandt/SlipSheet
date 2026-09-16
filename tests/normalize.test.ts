import { describe, expect, it } from "vitest";
import { ParsedReceipt } from "@slipsheet/schema";
import { normalizeReceipt } from "@slipsheet/parse";

const base: ParsedReceipt = {
  schema_version: 1,
  vendor: { value: "Test Vendor", confidence: 0.9 },
  invoice_date: { value: "2026-01-10", confidence: 0.9 },
  currency: "ZAR",
  subtotal_cents: { value: 10000, confidence: 0.9 },
  tax_cents: { value: null, confidence: 0.2 },
  total_cents: { value: 10000, confidence: 0.9 },
  line_items: [],
  warnings: [],
};

describe("normalizeReceipt", () => {
  it("blanks total when confidence below threshold", () => {
    const raw: ParsedReceipt = {
      ...base,
      total_cents: { value: 99999, confidence: 0.4 },
    };
    const out = normalizeReceipt(raw);
    expect(out.total_cents.value).toBeNull();
    expect(out.warnings).toContain("total_low_confidence");
  });

  it("rejects invalid date format", () => {
    const raw: ParsedReceipt = {
      ...base,
      invoice_date: { value: "10/01/2026", confidence: 0.9 },
    };
    const out = normalizeReceipt(raw);
    expect(out.invoice_date.value).toBeNull();
    expect(out.warnings).toContain("invalid_date_format");
  });

  it("flags line sum mismatch and lowers total confidence", () => {
    const raw: ParsedReceipt = {
      ...base,
      total_cents: { value: 10000, confidence: 0.95 },
      line_items: [
        {
          description: { value: "Item A", confidence: 0.9 },
          quantity: { value: 1, confidence: 0.9 },
          unit_price_cents: { value: 3000, confidence: 0.9 },
          line_total_cents: { value: 3000, confidence: 0.9 },
        },
        {
          description: { value: "Item B", confidence: 0.9 },
          quantity: { value: 1, confidence: 0.9 },
          unit_price_cents: { value: 4000, confidence: 0.9 },
          line_total_cents: { value: 4000, confidence: 0.9 },
        },
      ],
    };
    const out = normalizeReceipt(raw);
    expect(out.warnings).toContain("line_sum_mismatch");
    expect(out.total_cents.confidence).toBeLessThan(0.6);
  });

  it("coerces float cents to null", () => {
    const raw: ParsedReceipt = {
      ...base,
      total_cents: { value: 100.5 as unknown as number, confidence: 0.9 },
    };
    const out = normalizeReceipt(raw);
    expect(out.total_cents.value).toBeNull();
  });
});
