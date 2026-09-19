---
cursor:
  subagentId: "bc-85ecdc62-9fc2-5158-b3a4-740f17672dac"
---

# SlipSheet — Documentation Quality Handover (04)

**For:** River (new engineer)  
**Repo:** [RickyNiemandt/SlipSheet](https://github.com/RickyNiemandt/SlipSheet) @ `main`  
**Date:** 2026-09-19  
**Scope reviewed:** `README.md`, `docs/FLOW.md`, `docs/DEPLOY.md`, `docs/review/*.md`  
**Verification:** Ran `npm install && npm run generate:fixtures && npm run build && npm test` — all green (27 tests).

---

## Executive verdict

**Doc quality: B+ — usable for onboarding with gaps in deploy prerequisites and local worker dev.**

The three user-facing docs (`README`, `FLOW`, `DEPLOY`) form a coherent story: what SlipSheet is → how it works → how to ship it. A new engineer can clone, build, and test offline in under 10 minutes using README alone. Production deploy is *directionally* correct but missing several steps that will block a first deploy unless River reads `docs/review/workers-qc.md` or handover `05-deploy-readiness.md`.

The `docs/review/` reports are valuable deep-dives but read as **QC snapshots (2026-09-18)**, not maintained runbooks. One item in `workers-qc.md` is **stale** after the root build-script fix.

---

## Recommended reading order for River

| Order | Doc | Purpose |
|-------|-----|---------|
| 1 | `README.md` | Scope, monorepo layout, quick start, non-negotiables |
| 2 | `docs/FLOW.md` | E2E sequence, edge cases, local vs prod table |
| 3 | `docs/DEPLOY.md` | Production checklist (Cloudflare + Google) |
| 4 | `docs/review/integration-qc.md` | CI truth, known build fix history |
| 5 | `docs/review/packages-qc.md` | Package graph and data contract |
| 6 | `docs/review/workers-qc.md` | Worker bindings, error paths, deploy blockers |
| 7 | `internal/handover/05-deploy-readiness.md` | P0/P1 deploy checklist (fills DEPLOY gaps) |

---

## Doc-by-doc assessment

### `README.md`

| Aspect | Rating | Notes |
|--------|--------|-------|
| Clarity | Good | Clear v1 scope, monorepo tree, non-negotiables |
| Completeness | Partial | Dev path solid; deploy path abbreviated |
| Accuracy | Good | Commands match `package.json` and CI |

**Strengths**

- Quick start matches CI: `generate:fixtures` before tests is called out (easy to miss).
- Links to `FLOW.md` and `DEPLOY.md` for depth.
- Non-negotiables (cents, anti-hallucination, idempotency) are explicit.

**Gaps / outdated**

1. **Node version** — `package.json` requires Node ≥20; README silent. CI uses Node 20.
2. **Deploy email section (steps 3–4)** — Lists only `IDEMPOTENCY` and `USERS` KV namespaces; omits **`OAUTH_STATE`** (required by web worker). Order differs from `DEPLOY.md` (KV creation not mentioned before deploy).
3. **Build before worker deploy** — Not stated. Workers import `@slipsheet/*` from `packages/*/dist/`; deploy fails without `npm run build` first.
4. **`wrangler login`** — Not mentioned anywhere in user-facing docs.
5. **Placeholder naming** — OAuth URL uses `YOUR_APP`; DEPLOY uses `YOUR_WEB_WORKER_URL` / `YOUR_WEB_WORKER`. Same thing, inconsistent labels.
6. **`seed-sheet-headers.ts`** — README presents it as "Seed Sheet headers" but the script **only prints** tab-separated header names to stdout; headers are auto-created in production via `ensureSheetHeaders`. Misleading for River.
7. **Google People API** — Not listed in README OAuth steps; required in `DEPLOY.md` for `userinfo.email`.
8. **`.env.example`** — Points here but file only lists three vars; `APP_URL` / `STATUS_URL` live in `wrangler.toml`, not `.env`.

---

### `docs/FLOW.md`

| Aspect | Rating | Notes |
|--------|--------|-------|
| Clarity | Excellent | Mermaid diagram + component table + edge cases |
| Completeness | Good | Covers duplicates, unknown sender, attachments, confidence |
| Accuracy | Good | Aligns with worker/pipeline code |

**Strengths**

- Best single doc for "what happens when I forward an email."
- Edge-case section matches runtime replies in `workers/intake-email`.
- Local vs production table is practical.

**Gaps**

1. **KV bindings table** — Lists `IDEMPOTENCY` and `USERS` only; omits **`OAUTH_STATE`** (web worker OAuth CSRF).
2. **`wrangler dev`** — Mentioned in one line with no command, port, or secret/KV binding setup. River cannot exercise email intake locally from this doc alone.
3. **Shared `USERS` namespace** — Critical deploy detail (same KV ID in both workers) not stated here; only in `workers-qc.md` / handover 05.
4. **Sheet tab** — Implies **SlipSheet** tab; code uses hard-coded `"SlipSheet"` (`ensureSheetHeaders` / `appendSheetRow`). Worth stating explicitly so River knows the tab name is not configurable in v1.
5. **Residual risks** — Partial failure / KV race (documented in `workers-qc.md`) not surfaced for operators.

---

### `docs/DEPLOY.md`

| Aspect | Rating | Notes |
|--------|--------|-------|
| Clarity | Good | Numbered steps, troubleshooting table |
| Completeness | Partial | Missing pre-deploy and auth steps |
| Accuracy | Good | Worker names, secrets, and routing match repo |

**Strengths**

- Correct Google APIs (Sheets + People), OAuth scopes, and redirect URI pattern.
- KV create commands and wrangler secret flow are clear.
- Troubleshooting covers the four most common user-facing failures.
- Cross-link to `FLOW.md` for behavior.

**Gaps / missing steps**

1. **`wrangler login`** — Prerequisite not listed.
2. **`npm install && npm run build`** (or `npm run typecheck`) **before** `wrangler deploy` — Workers resolve compiled packages; omitting this breaks deploy. Documented in `workers-qc.md` §Deploy blockers, not here.
3. **`USERS` namespace must be identical** in `workers/intake-email/wrangler.toml` and `workers/web/wrangler.toml` — implied by shared binding name but never stated; easy misconfiguration.
4. **`APP_URL` / `STATUS_URL` must match** — Same deployed web worker URL; only partially implied via OAuth redirect URI step.
5. **Edit `wrangler.toml`** — Step 2 says "Update … with returned namespace IDs"; step 3 says "Set APP_URL in wrangler.toml" as a comment only. River needs an explicit "edit these files" sub-step.
6. **Deploy order in README vs DEPLOY** — README "Connect Google Sheet" lists deploy web before KV setup; DEPLOY order (KV → web → intake → routing → OAuth) is correct. README deploy snippet could mis-order work.
7. **Custom domain** — Only `*.workers.dev` examples; no note on optional custom domain for `APP_URL` / Email Routing.
8. **Post-deploy verification** — Step 7 is good; no mention of `wrangler tail` or Cloudflare Email Routing logs for debugging silent failures.
9. **M5 vs M6** — Section 8 repeats QA sign-off; fine but blurs "deploy" vs "quality gate" for a new reader.

---

### `docs/review/*.md`

| File | Still accurate? | River should… |
|------|-----------------|---------------|
| `integration-qc.md` | Yes (historical fix noted) | Trust CI command sequence; treat build fix as resolved |
| `packages-qc.md` | Yes | Use parse pipeline diagram; ignore "sequential tsc -p" as current state |
| `workers-qc.md` | **Mostly** | **W-2 row outdated** — root `build` is now `tsc -b --force`, not per-package `tsc -p`. Rest (bindings, error paths, deploy blockers) is current and **more complete than DEPLOY.md** |

**Review doc limitations for onboarding**

- Dated 2026-09-18; test counts (27) still match repo.
- Written for QC sign-off, not as living docs — no "start here" pointer from README.
- `workers-qc.md` marks `wrangler.toml` as **FAIL** because placeholders remain; that is **expected** pre-deploy, not a code defect. Could confuse River without context.

---

## Cross-doc inconsistencies

| Topic | README | FLOW | DEPLOY | Code / truth |
|-------|--------|------|--------|--------------|
| KV namespaces | 2 named | 2 listed | 3 created | 3: `IDEMPOTENCY`, `USERS`, `OAUTH_STATE` |
| OAuth URL placeholder | `YOUR_APP` | — | `YOUR_WEB_WORKER` | Same var: deployed web worker URL |
| Google People API | Omitted | Omitted | Required | Required for email scope |
| Build before deploy | Omitted | Omitted | Omitted | **Required** (`npm run build`) |
| `seed-sheet-headers` | "Seed" | "Optional helper" | — | Prints headers only |

---

## What River can do today (doc-supported)

| Task | Supported by docs? | Command / path |
|------|-------------------|----------------|
| Clone + offline CI parity | Yes | README full QC one-liner |
| Understand email → Sheet flow | Yes | `docs/FLOW.md` |
| Run live parse on PDF | Yes | `GEMINI_API_KEY=… npm run parse -- fixtures/pdf/…` |
| Deploy to production | Partial | `DEPLOY.md` + **05-deploy-readiness** + `workers-qc.md` |
| Debug worker locally | No | No wrangler dev / tail guide |
| Know env var locations | Partial | `.env.example` incomplete; wrangler secrets + toml vars split undocumented |

---

## Priority doc fixes (recommended, not in scope for this pass)

| Priority | Fix |
|----------|-----|
| P0 | Add to `DEPLOY.md`: `wrangler login`, `npm run build` before deploy, shared `USERS` KV ID, `APP_URL` = `STATUS_URL` |
| P0 | Fix README deploy section: add `OAUTH_STATE`, align step order with `DEPLOY.md` |
| P1 | Clarify `seed-sheet-headers.ts` as header preview / paste helper |
| P1 | Add Node ≥20 to README prerequisites |
| P1 | Add `OAUTH_STATE` to FLOW KV table |
| P2 | README link to `docs/review/` with one-line "when to read" |
| P2 | Update `workers-qc.md` W-2 row to reflect `tsc -b --force` build |
| P2 | Short "Local worker dev" subsection in FLOW (`cd workers/web && npm run dev`) |

---

## Sign-off checklist for River (documentation)

- [ ] Run README full QC one-liner locally — expect 27 passing tests
- [ ] Read `FLOW.md` diagram before touching workers
- [ ] Treat `DEPLOY.md` as outline; use handover **05** + `workers-qc.md` for complete deploy blockers
- [ ] Do not trust README "Seed Sheet headers" — use OAuth flow or printed headers from script
- [ ] After doc updates (future), re-run integration QC command from `integration-qc.md`

---

## Related handover

- **05 — Deploy readiness:** `internal/handover/05-deploy-readiness.md` (P0 infra checklist; complements this doc review)
