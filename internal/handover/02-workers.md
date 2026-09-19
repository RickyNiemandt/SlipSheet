---
cursor:
  subagentId: "bc-1b783fc9-96d8-58cf-be19-9556724a70b7"
---

# Handover 02 — Workers (`intake-email` + `web`)

**Reviewed:** 2026-09-19  
**Repo:** SlipSheet `/workspace` @ `main` (`0e25084`)  
**Reviewer:** workers E2E subagent

---

## Summary

Both workers compile and bundle after `npm run build`. Wrangler dry-run deploy succeeds for each. Runtime logic is sound; **production deploy is blocked** by placeholder KV IDs, placeholder URLs, unset secrets, and Cloudflare Email Routing not yet wired. No new code defects found beyond documented residual risks.

---

## Email → parse → sheet → reply flow

### Prerequisite: OAuth (web worker)

1. User visits `GET /oauth/start?sheetId={SPREADSHEET_ID}` on **slipsheet-web**.
2. Web worker stores CSRF `state` + `{ sheetId, spreadsheetUrl }` in KV `OAUTH_STATE` (600s TTL).
3. Redirect to Google OAuth (`offline` + `prompt=consent`) with redirect `{APP_URL}/oauth/callback`.
4. On callback: exchange code → require `refresh_token` → `getUserEmail` → `USERS.put(email.toLowerCase(), { refreshToken, sheetId, spreadsheetUrl, email })`.
5. User must forward receipts from **the same Google email** used in OAuth.

### Intake path (intake-email worker)

| Step | Module | Action |
|------|--------|--------|
| 1 | Cloudflare Email Routing | Delivers raw MIME to `email(message)` handler |
| 2 | `@slipsheet/email-intake` | `extractSlipFromEmail` — first PDF/PNG/JPEG/WebP attachment or inline |
| 3 | `index.ts` | Build `IntakeMeta` (channel, Message-ID, sender, mime, filename) |
| 4 | `idempotency.ts` | SHA-256 content hash; check KV for `email:{messageId}` and `email:hash:{hash}` |
| 5 | `pipeline.ts` | `USERS.get(sender)` — fail if not connected |
| 6 | `@slipsheet/parse` | Gemini 2.5 Flash-Lite vision → `ParsedReceipt` → normalize |
| 7 | `@slipsheet/sheets` | `refreshAccessToken` → `ensureSheetHeaders` → `appendSheetRow` on **SlipSheet** tab |
| 8 | `idempotency.ts` | `recordProcessed` both keys (7-day KV TTL) |
| 9 | `reply.ts` | Plain-text reply with vendor/date/total, low-confidence fields, warnings, sheet URL |

### Reply outcomes

| Condition | Subject | Body |
|-----------|---------|------|
| No supported attachment | `Re: SlipSheet — no attachment found` | Error + `STATUS_URL` connect link |
| Duplicate Message-ID or hash | `Re: SlipSheet — duplicate` | Already processed |
| Sender not in USERS KV | `Re: SlipSheet — processing failed` | Connect Sheet + `STATUS_URL` |
| Parse/Sheets/token error | `Re: SlipSheet — processing failed` | Error message + `STATUS_URL` |
| Success | `Re: SlipSheet — receipt captured` | Parsed summary + optional sheet URL |

### Web worker routes (non-email)

| Route | Method | Purpose |
|-------|--------|---------|
| `/`, `/status` | GET | Landing + OAuth link |
| `/oauth/start?sheetId=` | GET | Begin OAuth (requires sheetId) |
| `/oauth/callback` | GET | Complete OAuth, write USERS KV |
| `/export.csv` | POST | Manual CSV export from `ParsedReceipt` JSON (fallback path) |
| * | * | 404 HTML |

### Shared KV contract

- **`USERS`** must be the **same namespace** on both workers (key = lowercased sender email).
- **`IDEMPOTENCY`** — intake-email only.
- **`OAUTH_STATE`** — web only.

**Critical URL alignment:** `STATUS_URL` (intake-email) and `APP_URL` (web) must both point to the deployed web worker URL so error replies link to a working OAuth entry point.

---

## Wrangler dry-run results

Commands (2026-09-19):

```bash
npm run build   # required first — workers resolve @slipsheet/* from packages/*/dist/
cd workers/intake-email && npx wrangler deploy --dry-run   # PASS — 276.61 KiB
cd workers/web && npx wrangler deploy --dry-run              # PASS — 154.87 KiB
```

**Without `npm run build` first:** both workers **fail** with `Could not resolve "@slipsheet/*"` — `dist/index.js` missing.

Bindings reported at dry-run:

**intake-email:** `IDEMPOTENCY`, `USERS`, `STATUS_URL=https://slipsheet.example.com`  
**web:** `USERS`, `OAUTH_STATE`, `APP_URL=https://slipsheet.example.com`

Secrets (`GEMINI_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`) are not in toml — expected; set via `wrangler secret put`.

---

## Bugs & risks

### Fixed (prior QC — verified still correct)

| ID | Issue | Status |
|----|-------|--------|
| W-1 | `KvIdempotencyStore` imported from wrong module | **Fixed** — now `./idempotency.js` |

### Open — deploy / config blockers

| ID | Severity | Issue |
|----|----------|-------|
| D-1 | **Blocker** | Placeholder KV namespace IDs (`000…00`, `000…01`, `000…02`) in both `wrangler.toml` |
| D-2 | **Blocker** | Placeholder `STATUS_URL` / `APP_URL` (`https://slipsheet.example.com`) |
| D-3 | **Blocker** | Secrets not set on Cloudflare (`GEMINI_API_KEY`, Google OAuth) |
| D-4 | **Blocker** | Google OAuth redirect URI must match live `{APP_URL}/oauth/callback` |
| D-5 | **Blocker** | Email Routing route `inbox@domain` → `slipsheet-intake-email` not configured |
| D-6 | **Blocker** | Must run `npm run build` before worker deploy (packages `dist/` required) |

### Open — runtime / design risks (not fixed)

| ID | Severity | Issue | Notes |
|----|----------|-------|-------|
| R-1 | Medium | **Partial failure:** append succeeds, `recordProcessed` fails → retry may duplicate row | No transactional idempotency |
| R-2 | Medium | **Concurrent race:** two emails, same bytes, different Message-IDs → both may append | KV check/put not atomic |
| R-3 | Medium | **SlipSheet tab must exist** | `ensureSheetHeaders` only writes row 1; does not create tab — append fails if tab missing |
| R-4 | Low | **First attachment only** | Multi-attachment emails ignore additional slips |
| R-5 | Low | **HTML injection** | OAuth callback renders `${email}` unescaped in HTML |
| R-6 | Low | **Dead error codes** | `PipelineError` defines `NO_ATTACHMENT` / `PARSE_FAILED` but pipeline never throws them |
| R-7 | Low | **Type cast** | `message.reply(... as unknown as EmailMessage)` — works but masks types |
| R-8 | Low | **web/package.json** | No `build` dry-run script (intake-email has `"build": "wrangler deploy --dry-run --outdir=dist"`) |
| R-9 | Low | **OAuth redirect in intake** | `redirectUri: ${STATUS_URL}/oauth/callback` passed to oauth config but intake only uses `refreshAccessToken` (harmless) |

---

## Test status

After `npm run build`:

```
npm test — 9 files, 27/27 PASS
```

Includes: email extraction, idempotency, reply templates, schema/sheet row mapping, parse golden, CSV export.

---

## Deploy checklist (unblock production)

1. `npx wrangler kv namespace create IDEMPOTENCY USERS OAUTH_STATE` — paste IDs into both `wrangler.toml` files.
2. Deploy **web** first; set `APP_URL` to deployed URL.
3. Set `STATUS_URL` on intake-email to **same URL** as `APP_URL`.
4. `wrangler secret put` on each worker (see `docs/DEPLOY.md`).
5. Register Google OAuth redirect: `{APP_URL}/oauth/callback`.
6. `npm run build && cd workers/web && wrangler deploy`.
7. `npm run build && cd workers/intake-email && wrangler deploy`.
8. Cloudflare Email Routing → route inbox address to `slipsheet-intake-email`.
9. User creates Sheet with **SlipSheet** tab (or run `scripts/seed-sheet-headers.ts` guidance), then `/oauth/start?sheetId=...`.
10. E2E: forward PDF from connected email → expect reply + new row.

Full steps: `docs/DEPLOY.md`, flow diagram: `docs/FLOW.md`, prior QC: `docs/review/workers-qc.md`.

---

## Files reviewed

```
workers/intake-email/src/index.ts
workers/intake-email/src/pipeline.ts
workers/intake-email/src/idempotency.ts
workers/intake-email/src/reply.ts
workers/intake-email/wrangler.toml
workers/intake-email/package.json
workers/web/src/index.ts
workers/web/wrangler.toml
workers/web/package.json
packages/email-intake/src/index.ts
packages/parse/src/gemini.ts
packages/sheets/src/oauth.ts
packages/sheets/src/append.ts
packages/schema/src/sheet-row.ts
```
