---
cursor:
  subagentId: "bc-be08b781-cd09-5bdf-bc60-ef998b24a4f6"
---

# SlipSheet — Deploy Readiness Handover (05)

**For:** River  
**Repo:** [RickyNiemandt/SlipSheet](https://github.com/RickyNiemandt/SlipSheet) @ `main`  
**Date:** 2026-09-19  
**Code status:** M1–M4 complete; CI green offline; workers logic QC **PASS** (`docs/review/workers-qc.md`). Deploy config **FAIL** — placeholders remain.

This checklist covers infrastructure and configuration only. **Credential values** (API keys, OAuth client secret) are listed as required bindings; River wires the actual secrets.

---

## Executive summary

SlipSheet is **not deploy-ready** until Cloudflare KV namespaces, worker URLs, domain/email routing, and Google OAuth are configured. Both `wrangler.toml` files still use placeholder KV IDs and example URLs. No production domain or Email Routing rule exists in repo config.

**Deploy order:** Google Cloud project → KV namespaces → web worker → intake worker → Email Routing → OAuth connect → E2E forward test.

Reference: [docs/DEPLOY.md](../docs/DEPLOY.md).

---

## P0 — Blockers (must complete before any live email)

### 1. Cloudflare KV namespace IDs (both workers)

Placeholder IDs in repo must be replaced with real namespace IDs from `wrangler kv namespace create`.

| Binding | Worker(s) | Current placeholder | Create command |
|---------|-----------|---------------------|----------------|
| `IDEMPOTENCY` | intake-email | `00000000000000000000000000000000` | `wrangler kv namespace create IDEMPOTENCY` |
| `USERS` | intake-email **and** web | `00000000000000000000000000000001` | `wrangler kv namespace create USERS` — **same ID in both toml files** |
| `OAUTH_STATE` | web | `00000000000000000000000000000002` | `wrangler kv namespace create OAUTH_STATE` |

**Files to edit:**

- `workers/intake-email/wrangler.toml` — `IDEMPOTENCY`, `USERS`
- `workers/web/wrangler.toml` — `USERS`, `OAUTH_STATE`

Deploy will fail or bind to wrong/empty KV if placeholders remain.

### 2. Worker public URLs (`APP_URL` / `STATUS_URL`)

| Var | Worker | Current | Must become |
|-----|--------|---------|-------------|
| `APP_URL` | web | `https://slipsheet.example.com` | Deployed web worker URL (e.g. `https://slipsheet-web.<account>.workers.dev` or custom domain) |
| `STATUS_URL` | intake-email | `https://slipsheet.example.com` | **Same URL as `APP_URL`** |

**Critical:** Error replies and OAuth redirect both depend on these matching the live web worker. Mismatch breaks OAuth callback and “connect Sheet” links in email replies.

OAuth redirect URI registered in Google Cloud must be exactly:

```text
{APP_URL}/oauth/callback
```

### 3. Production domain + Cloudflare Email Routing

Prerequisites from plan §4 and `docs/DEPLOY.md` §5:

- [ ] Domain on Cloudflare (DNS managed by Cloudflare)
- [ ] **Email Routing** enabled for domain
- [ ] MX records verified (Cloudflare auto-provisions)
- [ ] Route rule: `inbox@<yourdomain>` → **Send to Worker** → `slipsheet-intake-email`
- [ ] Outbound reply deliverability: SPF/DKIM via Cloudflare Email Routing (automatic when routing enabled)

**Open from plan §8:** Final brand/domain not decided (SlipSheet / TillDrop / ParseSlip). Inbox address (`inbox@…`) depends on this choice.

Landing page still shows generic `inbox@yourdomain.com` — update copy after domain is chosen.

### 4. Google Cloud OAuth application

One OAuth 2.0 **Web application** client serves both workers.

| Step | Action |
|------|--------|
| APIs | Enable **Google Sheets API** and **Google People API** (userinfo) |
| Consent screen | External app; scopes: `spreadsheets`, `userinfo.email` |
| Redirect URI | `{APP_URL}/oauth/callback` (must match deployed web worker **exactly**) |
| Test users | If app not published: add each connecting Google account as test user |

**OAuth flow (already implemented — no code changes needed):**

1. User visits `GET /oauth/start?sheetId={SPREADSHEET_ID}` on web worker
2. Web stores `{ sheetId, spreadsheetUrl }` in `OAUTH_STATE` KV (10 min TTL)
3. Redirect to Google with `access_type=offline`, `prompt=consent` (forces refresh token)
4. Google redirects to `/oauth/callback?code&state`
5. Exchange code → refresh token; fetch email via userinfo; store in `USERS` KV keyed by **lowercased email**
6. Intake worker looks up sender by `message.from` — **must match OAuth email exactly**

**Known failure modes:**

- No refresh token → revoke app at [Google Account Permissions](https://myaccount.google.com/permissions), retry (code uses `prompt=consent`)
- “Sheet not connected” reply → forward from same address used in OAuth
- Missing `sheetId` on `/oauth/start` → HTTP 400

### 5. Wrangler secrets (list only — River adds values)

**`workers/web`** (`slipsheet-web`):

| Secret | Purpose |
|--------|---------|
| `GOOGLE_CLIENT_ID` | OAuth authorize + token exchange |
| `GOOGLE_CLIENT_SECRET` | OAuth token exchange |

**`workers/intake-email`** (`slipsheet-intake-email`):

| Secret | Purpose |
|--------|---------|
| `GEMINI_API_KEY` | Gemini 2.5 Flash-Lite parse (`parseDocument`) |
| `GOOGLE_CLIENT_ID` | Token refresh for Sheets append |
| `GOOGLE_CLIENT_SECRET` | Token refresh |

Set via `npx wrangler secret put <NAME>` from each worker directory after `wrangler login`.

Local dev reference: `.env.example` (`GEMINI_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`).

---

## P1 — Deploy procedure (after P0)

Execute in order:

```bash
# From repo root — packages must be built before worker deploy
npm ci && npm run generate:fixtures && npm run typecheck && npm run build

# 1. Create KV (once) and patch both wrangler.toml files with returned IDs

# 2. Web worker
cd workers/web
# Set APP_URL in wrangler.toml to final URL
# wrangler secret put GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
npx wrangler deploy

# 3. Intake worker
cd ../intake-email
# Set STATUS_URL in wrangler.toml to same URL as APP_URL
# wrangler secret put GEMINI_API_KEY / GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
npx wrangler deploy

# 4. Cloudflare dashboard — Email Routing rule (see P0 §3)

# 5. User onboarding
# Visit: {APP_URL}/oauth/start?sheetId={SHEET_ID}
# Sign in with the Google account that will forward emails

# 6. E2E test — forward PDF from that account to inbox@domain
```

Dry-run validation (no deploy):

```bash
cd workers/web && npx wrangler deploy --dry-run
cd workers/intake-email && npm run build
```

---

## P2 — Post-deploy verification

| Check | Expected |
|-------|----------|
| `GET {APP_URL}/` | Status page with OAuth link |
| `GET {APP_URL}/oauth/start?sheetId=…` | Google consent → Connected page |
| Forward PDF to `inbox@…` | Reply ~30s; row in Sheet tab **SlipSheet** |
| Unknown sender | Reply with connect link (`STATUS_URL`) |
| Duplicate forward | “Already processed” reply |
| No attachment | “No PDF or image” reply |

**Sheet prerequisites:** Target spreadsheet must allow the OAuth account to edit. Code calls `ensureSheetHeaders` to create/write headers on tab `SlipSheet` (hard-coded tab name).

---

## P3 — Open items from v1 plan (non-deploy but pre-production)

From v1 plan and `notes.md`:

| Item | Status | Owner action |
|------|--------|--------------|
| **M5–M6 milestone** | Plan todo `m5-qa-readme` still **pending** | Live QA sign-off |
| **M5 live sign-off** | Photo/adversarial fixtures are 1×1 PNG placeholders | Replace `fixtures/photos/` and `fixtures/adversarial/` with real redacted SA till slips; run `GEMINI_API_KEY=… npm run qa:slips` |
| **Final brand / domain** | Open §8 | Choose domain → set inbox address, update landing copy |
| **Privacy policy stub** | Plan §3 mentions need | State ephemeral processing, Google as processor, user-owned Sheet (POPIA-light) |
| **Google OAuth app publish** | If >100 users or external | Submit consent screen for verification |

CI runs `qa:slips` offline only (no `GEMINI_API_KEY` in GitHub Actions) — by design per integration QC.

---

## Configuration reference (current repo state)

### `workers/web/wrangler.toml`

```toml
name = "slipsheet-web"
# KV: USERS → 000…01 (placeholder)
# KV: OAUTH_STATE → 000…02 (placeholder)
[vars]
APP_URL = "https://slipsheet.example.com"   # ← replace
# secrets: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
```

### `workers/intake-email/wrangler.toml`

```toml
name = "slipsheet-intake-email"
# KV: IDEMPOTENCY → 000…00 (placeholder)
# KV: USERS → 000…01 (placeholder, must match web)
[vars]
STATUS_URL = "https://slipsheet.example.com"   # ← replace (match APP_URL)
# secrets: GEMINI_API_KEY, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
```

No `[[send_email]]` or custom domain bindings in toml — Email Routing is dashboard-only for v1.

---

## Residual risks (documented, not deploy blockers)

From workers QC — acceptable for v0.1 launch awareness:

- **Partial failure:** Sheet append succeeds but idempotency KV write fails → retry could duplicate row
- **KV race:** Same content, different Message-IDs, concurrent delivery → possible duplicate append
- **Sheet tab:** Hard-coded `"SlipSheet"`; missing tab may cause Google API error until headers run successfully

---

## Quick reference links

| Doc | Path |
|-----|------|
| Deploy guide | `docs/DEPLOY.md` |
| E2E flow | `docs/FLOW.md` |
| Workers QC | `docs/review/workers-qc.md` |
| Integration QC | `docs/review/integration-qc.md` |
| Project notes | `notes.md` |

---

## Sign-off checklist for River

- [ ] P0.1 — Real KV IDs in both wrangler.toml files (`USERS` shared)
- [ ] P0.2 — `APP_URL` and `STATUS_URL` set to live web worker URL
- [ ] P0.3 — Domain on Cloudflare; Email Routing → `slipsheet-intake-email`
- [ ] P0.4 — Google OAuth client + redirect URI + APIs enabled
- [ ] P0.5 — All five secrets set on correct workers
- [ ] P1 — Both workers deployed; packages built first
- [ ] P2 — OAuth connect + forward test → Sheet row + reply
- [ ] P3 — M5 live photo QA + brand/domain decision (pre-production polish)
