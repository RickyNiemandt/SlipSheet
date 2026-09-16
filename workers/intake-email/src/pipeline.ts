import { formatCentsAsZar } from "@slipsheet/money";
import { parseDocument } from "@slipsheet/parse";
import { toSheetRow, type IntakeMeta, type ParsedReceipt } from "@slipsheet/schema";
import {
  appendSheetRow,
  ensureSheetHeaders,
  refreshAccessToken,
  type GoogleOAuthConfig,
  type StoredUserTokens,
} from "@slipsheet/sheets";
import {
  checkDuplicate,
  hashContent,
  recordProcessed,
  type IdempotencyStore,
} from "./idempotency.js";

export interface UserStore {
  get(senderEmail: string): Promise<StoredUserTokens | null>;
}

export interface PipelineInput {
  bytes: Uint8Array;
  mimeType: string;
  filename?: string;
  meta: IntakeMeta;
  idempotency: IdempotencyStore;
  users: UserStore;
  oauth: GoogleOAuthConfig;
  geminiApiKey: string;
}

export interface PipelineResult {
  duplicate: boolean;
  receipt?: ParsedReceipt;
  sheetRowId?: string;
}

export class KvUserStore implements UserStore {
  constructor(private kv: KVNamespace) {}

  async get(senderEmail: string): Promise<StoredUserTokens | null> {
    return (await this.kv.get<StoredUserTokens>(senderEmail.toLowerCase(), "json")) ?? null;
  }
}

export async function runPipeline(input: PipelineInput): Promise<PipelineResult> {
  const contentHash = await hashContent(input.bytes);
  const meta = { ...input.meta, content_hash: contentHash };

  const dup = await checkDuplicate(input.idempotency, meta.message_id, contentHash);
  if (dup.duplicate) {
    return { duplicate: true };
  }

  const user = await input.users.get(meta.sender_email);
  if (!user) {
    throw new PipelineError("USER_NOT_CONNECTED", "Sender has not connected Google Sheets");
  }

  const receipt = await parseDocument({
    bytes: input.bytes,
    mimeType: input.mimeType,
    filename: input.filename,
    apiKey: input.geminiApiKey,
  });

  const tokens = await refreshAccessToken(input.oauth, user.refreshToken);
  await ensureSheetHeaders({
    accessToken: tokens.access_token,
    spreadsheetId: user.sheetId,
  });

  const row = toSheetRow({
    receipt,
    ingestedAt: meta.received_at,
    messageId: meta.message_id,
    contentHash,
    formatZar: formatCentsAsZar,
  });

  const appendResult = await appendSheetRow({
    accessToken: tokens.access_token,
    spreadsheetId: user.sheetId,
    row,
  });

  await recordProcessed(input.idempotency, meta.message_id, contentHash, appendResult.updatedRange);

  return {
    duplicate: false,
    receipt,
    sheetRowId: appendResult.updatedRange,
  };
}

export class PipelineError extends Error {
  constructor(
    public code: "USER_NOT_CONNECTED" | "NO_ATTACHMENT" | "PARSE_FAILED",
    message: string,
  ) {
    super(message);
    this.name = "PipelineError";
  }
}
