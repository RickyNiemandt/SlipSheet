---
cursor:
  subagentId: "bc-1d5f72f2-1d91-58f5-8ecc-8b17d95df6fa"
---

# Packages Handover — schema, money, parse, sheets, email-intake

**Reviewed:** 2026-09-19  
**Commands:** `npm install && npm run build && npm test`  
**Result:** Build PASS · 9 test files · 27/27 tests PASS  
**Clean-build check:** `rm -rf packages/*/dist packages/*/*.tsbuildinfo && npm run build` — PASS

---

## Section health

| Package | Status | Summary |
|---------|--------|---------|
| `@slipsheet/schema` | **Healthy** | Zod schemas (`ParsedReceipt`, `LineItem`, `IntakeMeta`), confidence helpers, `toSheetRow` mapping. 13-column `SHEET_HEADERS` aligns with sheets append range `A:M`. |
| `@slipsheet/money` | **Healthy** | ZAR display ↔ integer cents round-trip, float rejection, SA thousands spacing. Used by normalize, sheet rows, workers. |
| `@slipsheet/parse` | **Healthy** | Gemini 2.5 Flash Lite client (mock + live), extraction prompt, `normalizeReceipt` (cents coercion, low-confidence blanking, date validation, line-sum mismatch). Golden + adversarial tests pass. |
| `@slipsheet/sheets` | **Healthy** | OAuth URL/exchange/refresh, `appendSheetRow`, `ensureSheetHeaders`, CSV export. Unit-tested mapping; no live API tests (expected). |
| `@slipsheet/email-intake` | **Healthy** | PostalMime extraction for PDF/JPEG/PNG/WebP. Fixture tests for attachment, inline PNG, and no-attachment cases. |

### Pipeline fit

```
.eml → email-intake → parse (Gemini + normalize) → schema/money (toSheetRow) → sheets (append or CSV)
```

Integer cents end-to-end; display formatting only at export via `formatCentsAsZar`.

---

## Bugs

**None found.** Prior build-order bug (`tsc -p` stale tsbuildinfo) is already fixed via root `"build": "tsc -b --force"`. Verified on clean `dist/` wipe.

### Minor inconsistencies (non-blocking)

1. **`toSheetRow` hardcodes `0.6`** for vendor/invoice_date gating instead of importing `CONFIDENCE_LOW_THRESHOLD` from the same package.
2. **`confidenceLabel(0.85)` returns `"medium"`** — consistent with schema comment (`0.6–0.85 medium`, `>0.85 high`) but boundary is untested.
3. **`parseZarToCents("-100")` throws** while `"-100.50"` parses — negative integer-only amounts unsupported (unlikely on SA receipts).

---

## Gaps & open items

| # | Area | Item | Severity |
|---|------|------|----------|
| 1 | parse | Live Gemini parsing not exercised in CI (`GEMINI_API_KEY` required). Mock + golden normalization only. | Expected |
| 2 | sheets | No integration tests for OAuth, token refresh, or Sheets append (credentials required). | Expected |
| 3 | email-intake | Returns **first** supported attachment only — no priority (PDF over image), no multi-slip handling. | Design gap |
| 4 | email-intake | WebP listed in `SUPPORTED_MIME` but no fixture test. | Test gap |
| 5 | schema | `lowConfidenceFields` ignores line-item fields; `avgConfidence` excludes subtotal. | Coverage gap |
| 6 | schema | `toSheetRow` sets `status: needs_review` on **any** warning (e.g. `vat_not_visible`) even when totals are high-confidence. | Design note |
| 7 | sheets | `ensureSheetHeaders` only checks `values[0][0] === ingested_at` — corrupt/partial header rows won't self-heal. | Edge case |
| 8 | deps | `npm audit` reports 2 moderate vulnerabilities (dev deps). | Housekeeping |
| 9 | workers | `IntakeMeta` built ad hoc in intake worker — not validated with `IntakeMeta.parse()` before pipeline. | Integration gap |

---

## Test coverage (packages)

| Test file | Packages |
|-----------|----------|
| `tests/schema.test.ts` | schema, money |
| `tests/money.test.ts` | money |
| `tests/normalize.test.ts` | parse, schema |
| `tests/parse-golden.test.ts` | parse, schema |
| `tests/parse-email.test.ts` | email-intake |
| `tests/sheets.test.ts` | sheets, schema, money |
| `tests/export-csv.test.ts` | sheets, schema, money |

No package-local `*.test.ts` files — all tests live at repo root under `tests/`.

---

## What River should verify

1. **Live parse smoke** — `export GEMINI_API_KEY=… && npm run parse -- fixtures/pdf/pdf-invoice-supplier-a.pdf` on a real key; confirm JSON validates and totals match fixture expectations.
2. **M5 QA sign-off** — `npm run qa:slips` (offline always green; live path if key set). Replace placeholder photos in `fixtures/photos/` with redacted SA till slips before final live sign-off.
3. **Google OAuth E2E** — Deploy `workers/web`, run connect flow (`/oauth/start?sheetId=…`), confirm headers seed and a parsed row appends to the user's sheet.
4. **Email intake edge cases** — Forward email with multiple attachments (PDF + image); confirm first-match behaviour is acceptable or needs priority logic.
5. **Duplicate/idempotency** — Re-send same Message-ID and same content hash; confirm duplicate reply and no double append (worker-level, uses packages output).
6. **CSV fallback** — POST parsed receipt to web worker `/export.csv`; confirm ZAR display and header row match `SHEET_HEADERS`.
7. **Clean clone CI path** — `npm install && npm run generate:fixtures && npm run build && npm test && npm run qa:slips` on a fresh checkout (README documents this; fixtures must be generated before first test run on empty clone).

---

## Issues count

| Category | Count |
|----------|-------|
| Blocking bugs | **0** |
| Minor inconsistencies | **3** |
| Gaps / open items | **9** |
| **Total tracked items** | **12** |
