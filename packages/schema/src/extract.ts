import { z } from "zod";

/** 0.0–1.0; <0.6 low, 0.6–0.85 medium, >0.85 high */
export const ConfidenceField = z.object({
  value: z.union([z.string(), z.number(), z.null()]),
  confidence: z.number().min(0).max(1),
});

export type ConfidenceField = z.infer<typeof ConfidenceField>;

export const LineItem = z.object({
  description: ConfidenceField,
  quantity: ConfidenceField,
  unit_price_cents: ConfidenceField,
  line_total_cents: ConfidenceField,
});

export type LineItem = z.infer<typeof LineItem>;

export const ParsedReceipt = z.object({
  schema_version: z.literal(1),
  vendor: ConfidenceField,
  invoice_date: ConfidenceField,
  currency: z.literal("ZAR").default("ZAR"),
  subtotal_cents: ConfidenceField,
  tax_cents: ConfidenceField,
  total_cents: ConfidenceField,
  line_items: z.array(LineItem),
  warnings: z.array(z.string()),
  raw_notes: z.string().optional(),
});

export type ParsedReceipt = z.infer<typeof ParsedReceipt>;

export const IntakeMeta = z.object({
  channel: z.literal("email"),
  message_id: z.string(),
  sender_email: z.string().email(),
  content_hash: z.string(),
  received_at: z.string().datetime(),
  mime_type: z.string(),
  filename: z.string().optional(),
  page_count: z.number().int().positive().optional(),
});

export type IntakeMeta = z.infer<typeof IntakeMeta>;

export const CONFIDENCE_LOW_THRESHOLD = 0.6;
export const CONFIDENCE_MEDIUM_THRESHOLD = 0.85;

export function confidenceLabel(confidence: number): "low" | "medium" | "high" {
  if (confidence < CONFIDENCE_LOW_THRESHOLD) return "low";
  if (confidence <= CONFIDENCE_MEDIUM_THRESHOLD) return "medium";
  return "high";
}

export function lowConfidenceFields(receipt: ParsedReceipt): string[] {
  const fields: string[] = [];
  const check = (name: string, field: ConfidenceField) => {
    if (field.value !== null && confidenceLabel(field.confidence) === "low") {
      fields.push(name);
    }
    if (name === "total" && field.value === null) {
      fields.push("total");
    }
  };

  check("vendor", receipt.vendor);
  check("invoice_date", receipt.invoice_date);
  check("subtotal", receipt.subtotal_cents);
  check("tax", receipt.tax_cents);
  check("total", receipt.total_cents);

  return fields;
}
