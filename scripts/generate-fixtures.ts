#!/usr/bin/env tsx
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures");

/** Minimal valid PDF with SA invoice-like text (synthetic, no real PII). */
function buildInvoicePdf(vendor: string, date: string, total: string, vat: string): string {
  const lines = [
    "TAX INVOICE",
    vendor,
    `Date: ${date}`,
    "Item A          R 100.00",
    "Item B          R 150.00",
    `Subtotal:       R 250.00`,
    `VAT 15%:        ${vat}`,
    `TOTAL:          ${total}`,
  ];
  const stream = lines.map((l) => `(${l.replace(/[()\\]/g, "")}) Tj T*`).join("\n");
  return `%PDF-1.4
1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj
2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj
3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources<< /Font<< /F1 5 0 R >> >> >>endobj
4 0 obj<< /Length ${200 + stream.length} >>stream
BT /F1 12 Tf 50 750 Td
${stream}
ET
endstream endobj
5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000260 00000 n 
0000000500 00000 n 
trailer<< /Size 6 /Root 1 0 R >>
startxref
580
%%EOF`;
}

/** Minimal PNG (1x1 white pixel) — stand-in for photo fixtures in CI. */
const MINIMAL_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

async function main() {
  await mkdir(join(ROOT, "pdf"), { recursive: true });
  await mkdir(join(ROOT, "photos"), { recursive: true });
  await mkdir(join(ROOT, "adversarial"), { recursive: true });
  await mkdir(join(ROOT, "email"), { recursive: true });
  await mkdir(join(ROOT, "golden"), { recursive: true });

  await writeFile(
    join(ROOT, "pdf", "pdf-invoice-supplier-a.pdf"),
    buildInvoicePdf("BuildRight (Pty) Ltd", "2026-02-14", "R 287.50", "R 37.50"),
  );
  await writeFile(
    join(ROOT, "pdf", "pdf-invoice-supplier-b.pdf"),
    buildInvoicePdf("Cape Stationers CC", "2026-01-22", "R 1 150.00", "R 150.00"),
  );

  const png = Buffer.from(MINIMAL_PNG_BASE64, "base64");
  await writeFile(join(ROOT, "photos", "photo-till-slip-checkers.png"), png);
  await writeFile(join(ROOT, "photos", "photo-till-slip-spar.png"), png);
  await writeFile(join(ROOT, "adversarial", "adversarial-no-total.png"), png);
  await writeFile(join(ROOT, "adversarial", "adversarial-blurry.png"), png);

  const attachmentEml = `From: user@example.com
To: inbox@slipsheet.test
Subject: Fwd: Invoice Feb
Message-ID: <fixture-attachment@slipsheet.test>
MIME-Version: 1.0
Content-Type: multipart/mixed; boundary="boundary42"

--boundary42
Content-Type: text/plain

Please capture this invoice.

--boundary42
Content-Type: application/pdf; name="invoice.pdf"
Content-Disposition: attachment; filename="invoice.pdf"
Content-Transfer-Encoding: base64

${Buffer.from(buildInvoicePdf("BuildRight (Pty) Ltd", "2026-02-14", "R 287.50", "R 37.50")).toString("base64")}
--boundary42--
`;

  const inlineEml = `From: phone@example.com
To: inbox@slipsheet.test
Subject: Till slip photo
Message-ID: <fixture-inline@slipsheet.test>
MIME-Version: 1.0
Content-Type: multipart/related; boundary="boundary99"

--boundary99
Content-Type: text/html; charset=utf-8

<html><body><img src="cid:slip1"></body></html>

--boundary99
Content-Type: image/png; name="slip.png"
Content-Disposition: inline
Content-Transfer-Encoding: base64
Content-ID: <slip1>

${MINIMAL_PNG_BASE64}
--boundary99--
`;

  await writeFile(join(ROOT, "email", "with-attachment.eml"), attachmentEml);
  await writeFile(join(ROOT, "email", "with-inline-image.eml"), inlineEml);

  const golden = {
    "pdf-invoice-supplier-a": {
      schema_version: 1,
      vendor: { value: "BuildRight (Pty) Ltd", confidence: 0.9 },
      invoice_date: { value: "2026-02-14", confidence: 0.88 },
      currency: "ZAR",
      subtotal_cents: { value: 25000, confidence: 0.85 },
      tax_cents: { value: 3750, confidence: 0.85 },
      total_cents: { value: 28750, confidence: 0.92 },
      line_items: [
        {
          description: { value: "Item A", confidence: 0.8 },
          quantity: { value: 1, confidence: 0.7 },
          unit_price_cents: { value: 10000, confidence: 0.8 },
          line_total_cents: { value: 10000, confidence: 0.8 },
        },
        {
          description: { value: "Item B", confidence: 0.8 },
          quantity: { value: 1, confidence: 0.7 },
          unit_price_cents: { value: 15000, confidence: 0.8 },
          line_total_cents: { value: 15000, confidence: 0.8 },
        },
      ],
      warnings: [],
    },
    "pdf-invoice-supplier-b": {
      schema_version: 1,
      vendor: { value: "Cape Stationers CC", confidence: 0.9 },
      invoice_date: { value: "2026-01-22", confidence: 0.88 },
      currency: "ZAR",
      subtotal_cents: { value: 100000, confidence: 0.85 },
      tax_cents: { value: 15000, confidence: 0.85 },
      total_cents: { value: 115000, confidence: 0.92 },
      line_items: [],
      warnings: [],
    },
    "photo-till-slip-checkers": {
      schema_version: 1,
      vendor: { value: "Checkers", confidence: 0.85 },
      invoice_date: { value: "2026-03-01", confidence: 0.75 },
      currency: "ZAR",
      subtotal_cents: { value: null, confidence: 0.3 },
      tax_cents: { value: null, confidence: 0.2 },
      total_cents: { value: 45678, confidence: 0.82 },
      line_items: [],
      warnings: [],
    },
    "photo-till-slip-spar": {
      schema_version: 1,
      vendor: { value: "SPAR", confidence: 0.84 },
      invoice_date: { value: "2026-03-02", confidence: 0.72 },
      currency: "ZAR",
      subtotal_cents: { value: null, confidence: 0.3 },
      tax_cents: { value: null, confidence: 0.2 },
      total_cents: { value: 12345, confidence: 0.8 },
      line_items: [],
      warnings: [],
    },
    "adversarial-no-total": {
      schema_version: 1,
      vendor: { value: "Unknown Store", confidence: 0.5 },
      invoice_date: { value: null, confidence: 0.3 },
      currency: "ZAR",
      subtotal_cents: { value: null, confidence: 0.2 },
      tax_cents: { value: null, confidence: 0.2 },
      total_cents: { value: null, confidence: 0.25 },
      line_items: [],
      warnings: ["total_not_visible"],
    },
    "adversarial-blurry": {
      schema_version: 1,
      vendor: { value: null, confidence: 0.2 },
      invoice_date: { value: null, confidence: 0.15 },
      currency: "ZAR",
      subtotal_cents: { value: null, confidence: 0.1 },
      tax_cents: { value: null, confidence: 0.1 },
      total_cents: { value: null, confidence: 0.15 },
      line_items: [],
      warnings: ["low_image_quality", "total_not_visible"],
    },
  };

  for (const [name, data] of Object.entries(golden)) {
    await writeFile(
      join(ROOT, "golden", `${name}.json`),
      JSON.stringify(data, null, 2) + "\n",
    );
  }

  console.log("Fixtures generated.");
}

main().catch(console.error);
