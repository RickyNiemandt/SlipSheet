# SlipSheet

Micro-bot for SA freelancers, small agencies, and bookkeepers: **forward a photo or PDF of an invoice/receipt by email** → vision parse → structured row in **Google Sheets** → short confirm reply with low-confidence warnings.

## v1 scope

- **Intake:** email only (`inbox@yourdomain.com` via Cloudflare Email Routing)
- **Parse:** Gemini 2.5 Flash-Lite → vendor, date, total, VAT (if present), line items + per-field confidence
- **Output:** Google Sheet append (OAuth) or CSV export helper
- **Privacy:** ephemeral processing — no long-term receipt storage in v1

## Monorepo layout

```
packages/schema       Shared Zod types + Sheet row mapping
packages/money        ZAR integer cents helpers
packages/parse        Gemini vision pipeline + normalize rules
packages/sheets       Google OAuth + Sheets append + CSV
packages/email-intake PostalMime attachment extraction
workers/intake-email  Cloudflare Email Worker (main bot)
workers/web           OAuth connect + minimal status UI
fixtures/             Sample PDFs, photos, .eml, golden JSON
```

## How it works

End-to-end flow (email → parse → Sheet → reply): **[docs/FLOW.md](docs/FLOW.md)**

## Quick start (development)

```bash
npm install
npm run generate:fixtures   # synthetic PDFs/photos + golden JSON (required before tests)
npm run build
npm test
npm run qa:slips            # M5 anti-hallucination sign-off (offline in CI)
```

Full local QC (matches CI):

```bash
npm install && npm run generate:fixtures && npm run build && npm test && npm run qa:slips
```

Parse a fixture (requires `GEMINI_API_KEY`):

```bash
export GEMINI_API_KEY=your-key
npm run parse -- fixtures/pdf/pdf-invoice-supplier-a.pdf
```

Seed Sheet headers:

```bash
npx tsx scripts/seed-sheet-headers.ts
```

## Connect Google Sheet

1. Create a Google Cloud project → enable **Google Sheets API**
2. Create OAuth 2.0 credentials (Web application)
3. Deploy `workers/web` and set secrets: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `APP_URL`
4. Visit `https://YOUR_APP/oauth/start?sheetId=YOUR_SPREADSHEET_ID`
5. Authorise with the Google account that will receive parsed rows

## Deploy email intake

1. Domain on Cloudflare with **Email Routing** enabled
2. Route `inbox@yourdomain.com` → `slipsheet-intake-email` Worker
3. Create KV namespaces for `IDEMPOTENCY` and `USERS` (shared with web worker)
4. Set secrets on `workers/intake-email`:
   - `GEMINI_API_KEY`
   - `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
   - `STATUS_URL` (web worker URL)

```bash
cd workers/intake-email && npx wrangler deploy
cd workers/web && npx wrangler deploy
```

## Non-negotiables

1. Money stored as **integer cents**; display as `R x.xx`
2. **Never invent totals** — low confidence → blank + warning
3. **Idempotent** intake via Message-ID + content hash (KV, 7-day TTL)
4. **Ephemeral** file handling — process in memory, append to Sheet, discard
5. No WhatsApp in v1

## QA (M5)

```bash
npm test          # unit + golden + anti-hallucination (CI)
npm run qa:slips  # M5 sign-off table (offline always; live if GEMINI_API_KEY set)
npm run parse -- fixtures/pdf/pdf-invoice-supplier-a.pdf
```

Replace placeholder photos in `fixtures/photos/` with real redacted SA till slips before final M5 live sign-off.

## Deploy (M6)

- **Architecture & edge cases:** [docs/FLOW.md](docs/FLOW.md)
- **Step-by-step deploy:** [docs/DEPLOY.md](docs/DEPLOY.md) — Cloudflare KV, Email Routing, Google OAuth, worker secrets

**CSV fallback** (no Sheet connected): POST parsed receipt JSON to `/export.csv` on the web worker.

## Environment variables

See [`.env.example`](.env.example).
