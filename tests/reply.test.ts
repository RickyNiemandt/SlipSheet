import { describe, expect, it } from "vitest";
import type { ParsedReceipt } from "@slipsheet/schema";

// Inline minimal copy to avoid workers bundling in unit tests
function buildConfirmReply(receipt: ParsedReceipt): string {
  const lines = ["SlipSheet — parsed your receipt"];
  if (typeof receipt.total_cents.value === "number" && receipt.total_cents.confidence >= 0.6) {
    lines.push(`Total: R ${(receipt.total_cents.value / 100).toFixed(2)}`);
  } else {
    lines.push("Total: (not read — please check manually)");
  }
  if (receipt.warnings.length) {
    lines.push(`Warnings: ${receipt.warnings.join("; ")}`);
  }
  return lines.join("\n");
}

describe("reply template", () => {
  it("shows unread total for adversarial fixture shape", () => {
    const receipt: ParsedReceipt = {
      schema_version: 1,
      vendor: { value: null, confidence: 0.2 },
      invoice_date: { value: null, confidence: 0.2 },
      currency: "ZAR",
      subtotal_cents: { value: null, confidence: 0.1 },
      tax_cents: { value: null, confidence: 0.1 },
      total_cents: { value: null, confidence: 0.2 },
      line_items: [],
      warnings: ["total_not_visible"],
    };
    const text = buildConfirmReply(receipt);
    expect(text).toContain("not read");
    expect(text).toContain("total_not_visible");
  });
});
