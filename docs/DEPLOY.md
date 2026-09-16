# SlipSheet — Deploy Guide (M6)

Step-by-step to get email intake live on Cloudflare with Google Sheets.

## Prerequisites

- Cloudflare account with a domain (DNS on Cloudflare)
- Google Cloud project
- Gemini API key ([Google AI Studio](https://aistudio.google.com/apikey))

## 1. Google Cloud setup

1. Create a project at [Google Cloud Console](https://console.cloud.google.com/)
2. Enable **Google Sheets API** and **Google People API** (userinfo)
3. **OAuth consent screen** → External → add scopes:
   - `https://www.googleapis.com/auth/spreadsheets`
   - `https://www.googleapis.com/auth/userinfo.email`
4. **Credentials** → Create OAuth 2.0 Client ID → **Web application**
   - Authorized redirect URI: `https://YOUR_WEB_WORKER_URL/oauth/callback`
5. Copy **Client ID** and **Client secret**

## 2. Cloudflare KV namespaces

```bash
npx wrangler kv namespace create IDEMPOTENCY
npx wrangler kv namespace create USERS
npx wrangler kv namespace create OAUTH_STATE
```

Update `workers/intake-email/wrangler.toml` and `workers/web/wrangler.toml` with the returned namespace IDs.

## 3. Deploy web worker (OAuth + status)

```bash
cd workers/web
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
# Set APP_URL in wrangler.toml to your worker URL, e.g. https://slipsheet-web.YOUR_SUBDOMAIN.workers.dev
npx wrangler deploy
```

## 4. Deploy email intake worker

```bash
cd workers/intake-email
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
# Set STATUS_URL in wrangler.toml to the web worker URL from step 3
npx wrangler deploy
```

## 5. Email Routing

1. Cloudflare dashboard → **Email** → **Email Routing**
2. Enable routing for your domain
3. Add route: `inbox@yourdomain.com` → **Send to Worker** → `slipsheet-intake-email`
4. Verify MX records (Cloudflare adds these automatically)

## 6. Connect a Google Sheet

1. Create a new Google Sheet (or use an existing one)
2. Copy the spreadsheet ID from the URL: `https://docs.google.com/spreadsheets/d/{SHEET_ID}/edit`
3. Visit: `https://YOUR_WEB_WORKER/oauth/start?sheetId={SHEET_ID}`
4. Sign in with the Google account you will **forward emails from**

SlipSheet stores the refresh token keyed by that email address.

## 7. End-to-end test

1. From the connected Gmail/account, forward a PDF invoice to `inbox@yourdomain.com`
2. Expect a reply within ~30s with parsed fields
3. Confirm a new row in the **SlipSheet** tab

## 8. QA sign-off (M5)

```bash
export GEMINI_API_KEY=your-key
npm run qa:slips
```

Replace placeholder photos in `fixtures/photos/` with real redacted SA till slips before final M5 sign-off.

## Troubleshooting

| Issue | Fix |
|-------|-----|
| "Sheet not connected" reply | Complete OAuth at `/oauth/start?sheetId=...` using the **same email** you forward from |
| Duplicate rows | Idempotency uses Message-ID; some clients regenerate IDs on resend |
| No attachment found | Forward with attachment, or attach PDF/PNG directly (not link-only) |
| OAuth no refresh token | Revoke app at [Google Account Permissions](https://myaccount.google.com/permissions) and retry with `prompt=consent` |

## Cost estimate (Gemini 2.5 Flash-Lite)

~**R0.005–0.008 per receipt** at ~R16.74/USD (Mar 2026). Under 1 cent ZAR per page for typical slips.
