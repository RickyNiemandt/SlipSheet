import { ParsedReceipt } from "@slipsheet/schema";
import { EXTRACTION_SYSTEM_PROMPT, buildUserPrompt } from "./prompt.js";
import { normalizeReceipt } from "./normalize.js";

const GEMINI_MODEL = "gemini-2.5-flash-lite";
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";

export interface ParseDocumentInput {
  bytes: Uint8Array;
  mimeType: string;
  filename?: string;
  apiKey?: string;
}

export interface ParseDocumentOptions {
  mockReceipt?: ParsedReceipt;
}

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    schema_version: { type: "integer" },
    vendor: confidenceFieldSchema("string"),
    invoice_date: confidenceFieldSchema("string"),
    currency: { type: "string" },
    subtotal_cents: confidenceFieldSchema("integer"),
    tax_cents: confidenceFieldSchema("integer"),
    total_cents: confidenceFieldSchema("integer"),
    line_items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          description: confidenceFieldSchema("string"),
          quantity: confidenceFieldSchema("number"),
          unit_price_cents: confidenceFieldSchema("integer"),
          line_total_cents: confidenceFieldSchema("integer"),
        },
        required: ["description", "quantity", "unit_price_cents", "line_total_cents"],
      },
    },
    warnings: { type: "array", items: { type: "string" } },
    raw_notes: { type: "string" },
  },
  required: [
    "schema_version",
    "vendor",
    "invoice_date",
    "currency",
    "subtotal_cents",
    "tax_cents",
    "total_cents",
    "line_items",
    "warnings",
  ],
};

function confidenceFieldSchema(valueType: string) {
  return {
    type: "object",
    properties: {
      value:
        valueType === "integer" || valueType === "number"
          ? { type: ["integer", "number", "null"] }
          : { type: ["string", "null"] },
      confidence: { type: "number" },
    },
    required: ["value", "confidence"],
  };
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export async function parseDocument(
  input: ParseDocumentInput,
  options: ParseDocumentOptions = {},
): Promise<ParsedReceipt> {
  if (options.mockReceipt) {
    return normalizeReceipt(options.mockReceipt);
  }

  const apiKey = input.apiKey ?? process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is required for live parsing (use mockReceipt in tests)");
  }

  const base64 = bytesToBase64(input.bytes);
  const url = `${GEMINI_API_BASE}/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: EXTRACTION_SYSTEM_PROMPT }] },
      contents: [
        {
          role: "user",
          parts: [
            { text: buildUserPrompt(input.mimeType, input.filename) },
            { inlineData: { mimeType: input.mimeType, data: base64 } },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
        temperature: 0.1,
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${body}`);
  }

  const payload = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };

  const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("Gemini returned empty response");
  }

  const parsed = JSON.parse(text) as ParsedReceipt;
  parsed.schema_version = 1;
  parsed.currency = "ZAR";

  const validated = ParsedReceipt.parse(parsed);
  return normalizeReceipt(validated);
}
