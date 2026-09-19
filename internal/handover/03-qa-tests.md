---
cursor:
  subagentId: "bc-62c3934b-6db7-56a3-b0db-bb384c32a61e"
---

# 03 — QA & Tests Handover

**Date:** 2026-09-19  
**Repo:** SlipSheet (`/workspace`, branch `main`)  
**QC command:** `npm ci && npm run generate:fixtures && npm run build && npm test && npm run qa:slips`

---

## Full QC suite result (2026-09-19)

| Step | Result | Detail |
|------|--------|--------|
| `npm ci` | PASS | 113 packages |
| `npm run generate:fixtures` | PASS | Synthetic PDFs, 1×1 PNG placeholders, `.eml`, golden JSON |
| `npm run build` | PASS | `tsc -b --force` |
| `npm run typecheck` | PASS | (not in CI; run locally) |
| `npm test` | PASS | **9 files, 27 tests** |
| `npm run qa:slips` | PASS | **6 passed, 0 failed, 6 skipped** |

All gates green. No code changes required from this QC pass.

---

## Test counts by file

| File | Tests | Packages / area |
|------|-------|-----------------|
| `tests/money.test.ts` | 5 | `@slipsheet/money` |
| `tests/schema.test.ts` | 4 | `@slipsheet/schema` |
| `tests/normalize.test.ts` | 4 | `@slipsheet/parse` normalize |
| `tests/parse-golden.test.ts` | 5 | Golden fixtures + anti-hallucination |
| `tests/idempotency.test.ts` | 2 | Idempotency logic (inline reimplementation) |
| `tests/parse-email.test.ts` | 3 | `@slipsheet/email-intake` |
| `tests/sheets.test.ts` | 2 | `@slipsheet/sheets` row + CSV |
| `tests/export-csv.test.ts` | 1 | CSV export fallback |
| `tests/reply.test.ts` | 1 | Reply template (inline reimplementation) |
| **Total** | **27** | |

Vitest config: `tests/**/*.test.ts` and `packages/**/*.test.ts` (no package-level tests exist yet).

---

## M5 live QA status

**Status: NOT SIGNED OFF** — offline golden path passes; live Gemini parse not exercised.

### `npm run qa:slips` breakdown (12 rows = 6 fixtures × 2 modes)

| Fixture | Offline | Live |
|---------|---------|------|
| `pdf-invoice-supplier-a` | PASS | SKIP — no `GEMINI_API_KEY` |
| `pdf-invoice-supplier-b` | PASS | SKIP — no `GEMINI_API_KEY` |
| `photo-till-slip-checkers` | PASS | SKIP — placeholder 1×1 PNG |
| `photo-till-slip-spar` | PASS | SKIP — placeholder 1×1 PNG |
| `adversarial-no-total` | PASS | SKIP — placeholder 1×1 PNG |
| `adversarial-blurry` | PASS | SKIP — placeholder 1×1 PNG |

### Blockers for M5 sign-off

1. **`GEMINI_API_KEY` not set** in this environment or CI — PDF live parse never runs.
2. **Photo/adversarial fixtures are synthetic 1×1 PNG placeholders** (`scripts/generate-fixtures.ts`). `qa-slips.ts` intentionally skips live QA for `photos/` and `adversarial/` until real redacted SA till slips replace placeholders.
3. **No live regression in CI** — `.github/workflows/ci.yml` runs `qa:slips` but without API key; only offline normalization is gated.

### To complete M5

```bash
# 1. Replace fixtures/photos/*.png and fixtures/adversarial/*.png with real redacted SA slips
# 2. Update golden JSON if needed after first live parse (npm run parse fixtures/...)
export GEMINI_API_KEY=...
npm run qa:slips
# Expect: 12 PASS rows (6 offline + 6 live) with 0 FAIL, 0 SKIP for live PDFs + real photos
```

---

## Fixtures inventory

| Path | Count | Purpose |
|------|-------|---------|
| `fixtures/pdf/` | 2 | Synthetic invoice PDFs (supplier A/B) |
| `fixtures/photos/` | 2 | Placeholder PNGs (Checkers, SPAR golden only) |
| `fixtures/adversarial/` | 2 | Placeholder PNGs (no-total, blurry golden) |
| `fixtures/golden/` | 6 | Expected parse output + anti-hallucination rules |
| `fixtures/email/` | 2 | `.eml` with attachment + inline image |

**Scripts:**

| Script | Role |
|--------|------|
| `scripts/generate-fixtures.ts` | Regenerates all binary fixtures + golden JSON (CI step 1) |
| `scripts/qa-slips.ts` | M5 sign-off table; offline always, live when key + real images |
| `scripts/parse-fixture.ts` | Single-file live Gemini parse CLI |
| `scripts/seed-sheet-headers.ts` | Manual Sheets header seeding |

---

## CI workflow (`.github/workflows/ci.yml`)

```yaml
npm ci → generate:fixtures → build → test → qa:slips
```

- **Node:** 20 on `ubuntu-latest`
- **Triggers:** push/PR to `main`
- **Gaps vs full local QC:** no explicit `typecheck` step (covered by `build`); no `GEMINI_API_KEY` secret; no worker deploy dry-run

---

## Test coverage gaps

### Critical (blocks production confidence)

| Gap | Impact | Mitigation |
|-----|--------|------------|
| No live Gemini parse tests | Model regressions undetected in CI | Add `GEMINI_API_KEY` secret job or manual M5 run |
| Photo/adversarial placeholders | Live thermal-slip behavior untested | Replace with real redacted SA slips |
| `workers/intake-email` pipeline untested | E2E email→parse→sheet path unverified | Integration test with mocked KV/Gemini/Sheets |
| `workers/web` OAuth untested | Connect flow breaks silently | Manual QA or Playwright against staging |
| Idempotency tests duplicate worker code | Worker `idempotency.ts` drift undetected | Import and test `workers/intake-email/src/idempotency.ts` |
| Reply tests duplicate worker code | Template drift undetected | Import `buildConfirmReply` from `workers/intake-email/src/reply.ts` |

### Medium

| Gap | Notes |
|-----|-------|
| No `parseDocument` unit test (mock path) | `gemini.ts` mock option exists but unused in tests |
| No `@slipsheet/sheets` OAuth/append integration tests | Expected — needs Google credentials |
| No worker HTTP handler tests | `index.ts` error paths documented in `docs/review/workers-qc.md` only |
| No `scripts/parse-fixture.ts` / `seed-sheet-headers.ts` tests | CLI scripts; manual use only |
| `packages/**/*.test.ts` pattern empty | All tests live in root `tests/` |

### Low / acceptable for v0.1

| Gap | Notes |
|-----|-------|
| No snapshot tests for reply HTML/email bodies | Single string assertion only |
| No performance/load tests | Out of scope |
| No POPIA/data-retention automated checks | Documented in architecture only |

---

## Anti-hallucination coverage (plan §6)

| Rule | Covered by | Status |
|------|------------|--------|
| Golden match / wrong-number guard | `parse-golden.test.ts`, `qa-slips.ts` offline | PASS |
| `adversarial-no-total` → null + warning | `parse-golden.test.ts`, `normalize.test.ts` | PASS |
| No VAT inference | `parse-golden.test.ts`, `qa-slips.ts` | PASS |
| Idempotency duplicate | `idempotency.test.ts` (inline, not worker) | PARTIAL |
| Live model does not invent totals | Requires live `qa:slips` | **NOT RUN** |

---

## Related docs

- [docs/review/integration-qc.md](/workspace/docs/review/integration-qc.md) — fixtures, CI, integration QC (2026-09-18)
- [docs/review/packages-qc.md](/workspace/docs/review/packages-qc.md) — package health
- [docs/review/workers-qc.md](/workspace/docs/review/workers-qc.md) — worker E2E, deploy blockers

---

## Handoff summary

**Green:** 27/27 unit tests, 6/6 offline M5 QA cases, CI pipeline matches local QC.  
**Red / open:** M5 live sign-off blocked (no API key, placeholder photos). Worker pipeline and OAuth have zero automated tests.  
**Next owner action:** Real SA slip images + `GEMINI_API_KEY=... npm run qa:slips` → all live rows PASS before production.
