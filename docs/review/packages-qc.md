# Packages QC Review

**Date:** 2026-09-18  
**Scope:** `packages/schema`, `packages/money`, `packages/parse`, `packages/sheets`, `packages/email-intake`  
**Commands run:** `npm run build`, `npm test` (27 tests, all package-related suites)

---

## Section-by-section health

| Package | Status | Notes |
|---------|--------|-------|
| `packages/schema` | **PASS** | Zod schemas (`ParsedReceipt`, `LineItem`, `IntakeMeta`), confidence helpers, and `toSheetRow` mapping are coherent. Golden fixtures validate cleanly. |
| `packages/money` | **PASS** | ZAR display ↔ integer cents round-trip works. Rejects floats and invalid strings. Used by schema sheet rows and parse normalization. |
| `packages/parse` | **PASS** | Gemini client (mock + live path), prompt, and `normalizeReceipt` behave correctly against unit and golden tests. Build dependency resolution fixed (see below). |
| `packages/sheets` | **PASS** | OAuth helpers, row append, header seeding, and CSV export align with `SHEET_HEADERS`. No unit tests for live OAuth/API (expected). |
| `packages/email-intake` | **PASS** | Extracts first supported attachment/inline (PDF, JPEG, PNG, WebP) from `.eml` via PostalMime. All three email fixture tests pass. |

---

## Bugs found & fixed

### 1. Root build fails on clean checkout (FIXED)

**Symptom:** `npm run build` failed at `@slipsheet/parse` with `Cannot find module '@slipsheet/schema'` / `'@slipsheet/money'`, even after schema and money reported success.

**Root cause:** The root script ran each workspace with `tsc -p` sequentially. Composite projects kept stale `*.tsbuildinfo` (outputs gitignored) and skipped emit when `dist/` was missing, so downstream packages had no type declarations to resolve.

**Fix:** Changed root `package.json` build script from per-workspace `tsc -p` chain to:

```json
"build": "tsc -b --force"
```

This rebuilds the full project graph in dependency order and avoids stale incremental state.

**Verified:** `rm -rf packages/*/dist packages/*/*.tsbuildinfo && npm run build && npm test` — all green.

### 2. No other package bugs found

Reviewed normalize rules, money cents coercion, schema validation, Gemini client flow, sheets OAuth/append, and email extraction. All 27 tests pass; no code changes required beyond the build fix.

---

## Open / blocked items

| Item | Status |
|------|--------|
| Live Gemini API parsing | Not exercised in CI (requires `GEMINI_API_KEY`). Mock path and golden normalization fully tested. |
| Google Sheets OAuth / append | No integration tests (requires credentials). URL construction and CSV fallback covered by unit tests. |
| OAuth unit tests | None in repo — acceptable for v0.1; manual QA needed for connect flow. |

---

## Parse pipeline: how packages fit together

```
Raw email (.eml)
       │
       ▼
┌─────────────────────┐
│  email-intake       │  PostalMime → first PDF/image bytes + mimeType
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  parse (gemini)     │  Gemini 2.5 Flash Lite → JSON → ParsedReceipt.parse()
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  parse (normalize)  │  Integer cents, low-confidence blanking, date format,
│                     │  line-sum mismatch warnings (uses @slipsheet/money)
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  schema             │  ParsedReceipt type, lowConfidenceFields, toSheetRow()
│  + money            │  formatCentsAsZar for total_display column
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  sheets             │  appendSheetRow (Google Sheets) or sheetRowsToCsv (fallback)
└─────────────────────┘
```

**Data contract:** All monetary values are stored as **integer cents** end-to-end. Display formatting (`R 1 234.56`) happens only at sheet/CSV export via `@slipsheet/money`.

**Confidence gate:** Fields below 0.6 confidence are nulled in normalization and flagged in `low_confidence_fields` / `status: needs_review` on the sheet row.

---

## Test coverage (packages)

| Test file | Package(s) |
|-----------|------------|
| `tests/schema.test.ts` | schema, money |
| `tests/money.test.ts` | money |
| `tests/normalize.test.ts` | parse, schema |
| `tests/parse-golden.test.ts` | parse, schema |
| `tests/parse-email.test.ts` | email-intake |
| `tests/sheets.test.ts` | sheets, schema, money |
| `tests/export-csv.test.ts` | sheets, schema, money |

**Result:** 9 files, 27 tests — all passing after build fix.
