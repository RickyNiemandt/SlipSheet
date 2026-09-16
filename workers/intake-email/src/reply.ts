import { formatCentsAsZar } from "@slipsheet/money";
import { confidenceLabel, lowConfidenceFields, type ParsedReceipt } from "@slipsheet/schema";

export function buildConfirmReply(receipt: ParsedReceipt, sheetUrl?: string): string {
  const lines: string[] = ["SlipSheet — parsed your receipt", ""];

  const vendor =
    receipt.vendor.value && receipt.vendor.confidence >= 0.6
      ? String(receipt.vendor.value)
      : "(not read)";
  lines.push(`Vendor: ${vendor}`);

  const date =
    receipt.invoice_date.value && receipt.invoice_date.confidence >= 0.6
      ? String(receipt.invoice_date.value)
      : "(not read)";
  lines.push(`Date: ${date}`);

  if (typeof receipt.total_cents.value === "number" && receipt.total_cents.confidence >= 0.6) {
    lines.push(`Total: ${formatCentsAsZar(receipt.total_cents.value)}`);
  } else {
    lines.push("Total: (not read — please check manually)");
  }

  if (typeof receipt.tax_cents.value === "number" && receipt.tax_cents.confidence >= 0.6) {
    lines.push(`VAT: ${formatCentsAsZar(receipt.tax_cents.value)}`);
  }

  const lowFields = lowConfidenceFields(receipt);
  if (lowFields.length > 0) {
    lines.push("", `Low confidence: ${lowFields.join(", ")}`);
  }

  if (receipt.warnings.length > 0) {
    lines.push("", `Warnings: ${receipt.warnings.join("; ")}`);
  }

  if (sheetUrl) {
    lines.push("", `Sheet: ${sheetUrl}`);
  }

  lines.push("", "— SlipSheet");
  return lines.join("\n");
}

export function buildErrorReply(message: string, statusUrl?: string): string {
  const lines = ["SlipSheet — could not process your email", "", message];
  if (statusUrl) {
    lines.push("", `Connect your Google Sheet: ${statusUrl}`);
  }
  lines.push("", "— SlipSheet");
  return lines.join("\n");
}

export function buildDuplicateReply(): string {
  return [
    "SlipSheet — already processed",
    "",
    "This receipt was already captured (duplicate Message-ID or file).",
    "",
    "— SlipSheet",
  ].join("\n");
}

export function fieldConfidenceSummary(receipt: ParsedReceipt): string {
  return [
    `vendor=${confidenceLabel(receipt.vendor.confidence)}`,
    `total=${confidenceLabel(receipt.total_cents.confidence)}`,
  ].join(", ");
}
