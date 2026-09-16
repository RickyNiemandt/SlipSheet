import {
  CONFIDENCE_LOW_THRESHOLD,
  ParsedReceipt,
  type ConfidenceField,
} from "@slipsheet/schema";
import { assertIntegerCents } from "@slipsheet/money";

function coerceCentsField(field: ConfidenceField, fieldName: string): ConfidenceField {
  if (field.value === null) {
    return field;
  }

  if (typeof field.value === "number") {
    try {
      assertIntegerCents(field.value, fieldName);
      return field;
    } catch {
      return { value: null, confidence: Math.min(field.confidence, 0.3) };
    }
  }

  return { value: null, confidence: Math.min(field.confidence, 0.3) };
}

function blankIfLowConfidence(field: ConfidenceField, warning: string, warnings: string[]): ConfidenceField {
  if (field.confidence < CONFIDENCE_LOW_THRESHOLD) {
    if (field.value !== null) {
      warnings.push(`${warning}_low_confidence`);
    }
    return { value: null, confidence: field.confidence };
  }
  return field;
}

function normalizeDateField(field: ConfidenceField, warnings: string[]): ConfidenceField {
  if (field.value === null) return field;
  if (typeof field.value !== "string") {
    return { value: null, confidence: Math.min(field.confidence, 0.3) };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(field.value)) {
    warnings.push("invalid_date_format");
    return { value: null, confidence: Math.min(field.confidence, 0.4) };
  }
  return field;
}

function sumLineTotals(receipt: ParsedReceipt): number | null {
  let sum = 0;
  let any = false;
  for (const line of receipt.line_items) {
    if (typeof line.line_total_cents.value === "number") {
      sum += line.line_total_cents.value;
      any = true;
    }
  }
  return any ? sum : null;
}

export function normalizeReceipt(raw: ParsedReceipt): ParsedReceipt {
  const warnings = [...raw.warnings];

  let total_cents = coerceCentsField(raw.total_cents, "total_cents");
  let tax_cents = coerceCentsField(raw.tax_cents, "tax_cents");
  let subtotal_cents = coerceCentsField(raw.subtotal_cents, "subtotal_cents");

  total_cents = blankIfLowConfidence(total_cents, "total", warnings);
  tax_cents = blankIfLowConfidence(tax_cents, "tax", warnings);
  subtotal_cents = blankIfLowConfidence(subtotal_cents, "subtotal", warnings);

  if (total_cents.value === null && total_cents.confidence >= CONFIDENCE_LOW_THRESHOLD) {
    warnings.push("total_not_visible");
    total_cents = { value: null, confidence: Math.min(total_cents.confidence, 0.5) };
  }

  const invoice_date = normalizeDateField(raw.invoice_date, warnings);
  const vendor = blankIfLowConfidence(raw.vendor, "vendor", warnings);

  const line_items = raw.line_items.map((line: ParsedReceipt["line_items"][number]) => ({
    description: line.description,
    quantity: line.quantity,
    unit_price_cents: coerceCentsField(line.unit_price_cents, "unit_price_cents"),
    line_total_cents: coerceCentsField(line.line_total_cents, "line_total_cents"),
  }));

  const normalized: ParsedReceipt = {
    ...raw,
    vendor,
    invoice_date,
    subtotal_cents,
    tax_cents,
    total_cents,
    line_items,
    warnings: [...new Set(warnings)],
  };

  const lineSum = sumLineTotals(normalized);
  if (
    lineSum !== null &&
    typeof normalized.total_cents.value === "number" &&
    Math.abs(lineSum - normalized.total_cents.value) > 2
  ) {
    normalized.warnings.push("line_sum_mismatch");
    normalized.total_cents = {
      value: normalized.total_cents.value,
      confidence: Math.min(normalized.total_cents.confidence, 0.55),
    };
    if (normalized.total_cents.confidence < CONFIDENCE_LOW_THRESHOLD) {
      normalized.total_cents = { value: null, confidence: normalized.total_cents.confidence };
    }
  }

  return {
    ...normalized,
    warnings: [...new Set(normalized.warnings)],
  };
}
