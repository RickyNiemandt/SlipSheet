# Integration QC — SlipSheet

**Date:** 2026-09-18  
**Scope:** `fixtures/`, `scripts/`, `.github/workflows/ci.yml`, `docs/DEPLOY.md`, `README.md`, end-to-end app flow  
**Command:** `npm install && npm run generate:fixtures && npm run build && npm test && npm run qa:slips`

## Summary

| Step | Result |
|------|--------|
| `npm install` | PASS |
| `npm run generate:fixtures` | PASS |
| `npm run build` | PASS (after fix — see findings) |
| `npm test` | PASS — 9 files, 27 tests |
| `npm run qa:slips` | PASS — 6 passed, 0 failed, 6 skipped |

## Findings

### 1. Build failure — stale `tsconfig.tsbuildinfo` (fixed)

**Severity:** High (CI blocker)

**Symptom:** Fresh clone + `npm run build` failed with `Cannot find module '@slipsheet/schema'` in `packages/parse`, even though schema build appeared to succeed.

**Cause:** Five `*.tsbuildinfo` files were **tracked in git** while `dist/` is gitignored. TypeScript incremental build saw up-to-date cache and **skipped emit**, so dependent packages could not resolve types.

**Fix applied:**

- Removed tracked `tsconfig.tsbuildinfo` files from the repository (already listed in `.gitignore`).
- Changed root `build` script from per-workspace `tsc` to `tsc -b --force` for reliable clean builds in CI and fresh checkouts.

### 2. CI workflow — adequate, no change required

`.github/workflows/ci.yml` runs the same sequence as the integration QC command on Node 20 with `npm ci`. Matches local full QC after the build fix.

### 3. Fixtures & scripts — healthy

| Asset | Notes |
|-------|--------|
| `scripts/generate-fixtures.ts` | Regenerates synthetic PDFs, 1×1 PNG placeholders, sample `.eml`, and golden JSON |
| `scripts/parse-fixture.ts` | CLI for live Gemini parse of a single file |
| `scripts/qa-slips.ts` | M5 sign-off: offline golden normalization always; live parse for PDFs when `GEMINI_API_KEY` set; photo/adversarial placeholders skip live QA by design |
| `fixtures/golden/*.json` | Anti-hallucination expectations (null totals, warnings) |

**Note:** Photo/adversarial fixtures use minimal PNG placeholders until real redacted SA till slips are added for live M5 sign-off.

### 4. Documentation gaps (addressed)

| Gap | Action |
|-----|--------|
| No single "how it works" doc | Added [FLOW.md](../FLOW.md) with Mermaid diagram and edge-case behavior |
| README missing full QC one-liner | Added CI-matching command and link to FLOW.md |
| DEPLOY.md isolated from architecture | Added cross-link to FLOW.md |

## Test detail

```
Test Files  9 passed (9)
     Tests  27 passed (27)
```

Coverage includes: schema validation, money formatting, Gemini normalize/golden, idempotency keys, email attachment extraction, reply formatting, Sheets row mapping, CSV export.

## QA slips detail

```
6 passed, 0 failed, 6 skipped
```

- **Offline (6 PASS):** All fixtures pass golden + anti-hallucination normalization.
- **Live (6 SKIP):** No `GEMINI_API_KEY` in CI; photo/adversarial cases intentionally skip live parse until real slip images replace placeholders.

## Recommendations

1. **Before production M5 sign-off:** Replace `fixtures/photos/` and `fixtures/adversarial/` placeholders with redacted real SA till slips; run `GEMINI_API_KEY=... npm run qa:slips` and confirm live PASS rows.
2. **Optional:** Add a CI job matrix entry with `GEMINI_API_KEY` secret for live PDF QA on main (currently offline-only in CI by design).
3. **Do not re-commit `*.tsbuildinfo`** — `.gitignore` already excludes them.

## Artifacts

- Application flow doc: [docs/FLOW.md](../FLOW.md)
- Deploy guide: [docs/DEPLOY.md](../DEPLOY.md)
