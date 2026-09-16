import type { ParsedReceipt } from "./extract.js";
import { lowConfidenceFields } from "./extract.js";

export const SHEET_HEADERS = [
  "ingested_at",
  "message_id",
  "content_hash",
  "vendor",
  "invoice_date",
  "total_display",
  "total_cents",
  "tax_cents",
  "line_items_json",
  "low_confidence_fields",
  "warnings",
  "parse_confidence_avg",
  "status",
] as const;

export type SheetRow = Record<(typeof SHEET_HEADERS)[number], string | number>;

export interface SheetRowInput {
  receipt: ParsedReceipt;
  ingestedAt: string;
  messageId: string;
  contentHash: string;
  formatZar: (cents: number) => string;
}

function avgConfidence(receipt: ParsedReceipt): number {
  const scores = [
    receipt.vendor.confidence,
    receipt.invoice_date.confidence,
    receipt.total_cents.confidence,
    receipt.tax_cents.confidence,
  ];
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

export function toSheetRow(input: SheetRowInput): SheetRow {
  const { receipt, ingestedAt, messageId, contentHash, formatZar } = input;
  const lowFields = lowConfidenceFields(receipt);
  const totalCents =
    typeof receipt.total_cents.value === "number" ? receipt.total_cents.value : null;
  const taxCents =
    typeof receipt.tax_cents.value === "number" ? receipt.tax_cents.value : null;

  const status =
    lowFields.includes("total") || receipt.warnings.length > 0
      ? "needs_review"
      : "parsed";

  return {
    ingested_at: ingestedAt,
    message_id: messageId,
    content_hash: contentHash,
    vendor:
      typeof receipt.vendor.value === "string" && receipt.vendor.confidence >= 0.6
        ? receipt.vendor.value
        : "",
    invoice_date:
      typeof receipt.invoice_date.value === "string" &&
      receipt.invoice_date.confidence >= 0.6
        ? receipt.invoice_date.value
        : "",
    total_display: totalCents !== null ? formatZar(totalCents) : "",
    total_cents: totalCents ?? "",
    tax_cents: taxCents ?? "",
    line_items_json: JSON.stringify(receipt.line_items),
    low_confidence_fields: lowFields.join(","),
    warnings: receipt.warnings.join(";"),
    parse_confidence_avg: Math.round(avgConfidence(receipt) * 1000) / 1000,
    status,
  };
}
