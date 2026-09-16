import {
  buildAuthUrl,
  exchangeCodeForTokens,
  getUserEmail,
  type StoredUserTokens,
} from "@slipsheet/sheets";

export interface Env {
  USERS: KVNamespace;
  OAUTH_STATE: KVNamespace;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  APP_URL: string;
}

function html(body: string, status = 200): Response {
  return new Response(`<!doctype html><html><head><meta charset="utf-8"><title>SlipSheet</title><style>body{font-family:system-ui;max-width:40rem;margin:2rem auto;padding:0 1rem;line-height:1.5}code{background:#f4f4f5;padding:.1rem .3rem;border-radius:.25rem}</style></head><body>${body}</body></html>`, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const oauth = {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      redirectUri: `${env.APP_URL}/oauth/callback`,
    };

    if (url.pathname === "/" || url.pathname === "/status") {
      return html(`
        <h1>SlipSheet</h1>
        <p>Forward a receipt or till slip to your SlipSheet inbox. Parsed rows land in your Google Sheet.</p>
        <p><a href="/oauth/start">Connect Google Sheet</a></p>
        <p>After connecting, forward invoices to <code>inbox@yourdomain.com</code>.</p>
      `);
    }

    if (url.pathname === "/oauth/start") {
      const sheetId = url.searchParams.get("sheetId");
      if (!sheetId) {
        return html("<h1>Missing sheetId</h1><p>Add <code>?sheetId=YOUR_SPREADSHEET_ID</code> to the URL.</p>", 400);
      }

      const state = crypto.randomUUID();
      await env.OAUTH_STATE.put(
        state,
        JSON.stringify({ sheetId, spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${sheetId}` }),
        { expirationTtl: 600 },
      );

      return Response.redirect(buildAuthUrl(oauth, state), 302);
    }

    if (url.pathname === "/oauth/callback") {
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      if (!code || !state) {
        return html("<h1>OAuth failed</h1><p>Missing code or state.</p>", 400);
      }

      const stateRaw = await env.OAUTH_STATE.get(state);
      if (!stateRaw) {
        return html("<h1>OAuth expired</h1><p>Please start again from /oauth/start.</p>", 400);
      }

      const stateData = JSON.parse(stateRaw) as { sheetId: string; spreadsheetUrl: string };
      const tokens = await exchangeCodeForTokens(oauth, code);
      if (!tokens.refresh_token) {
        return html("<h1>OAuth incomplete</h1><p>No refresh token returned. Revoke app access and retry.</p>", 400);
      }

      const email = await getUserEmail(tokens.access_token);
      const record: StoredUserTokens = {
        refreshToken: tokens.refresh_token,
        sheetId: stateData.sheetId,
        spreadsheetUrl: stateData.spreadsheetUrl,
        email,
      };

      await env.USERS.put(email.toLowerCase(), JSON.stringify(record));
      await env.OAUTH_STATE.delete(state);

      return html(`
        <h1>Connected</h1>
        <p>SlipSheet is linked for <strong>${email}</strong>.</p>
        <p>Forward receipts from this address to your SlipSheet inbox.</p>
        <p><a href="${stateData.spreadsheetUrl}">Open your Sheet</a></p>
      `);
    }

    return html("<h1>Not found</h1>", 404);
  },
};
