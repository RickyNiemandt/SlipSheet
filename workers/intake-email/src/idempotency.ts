export interface IdempotencyRecord {
  sheetRowId: string;
  processedAt: string;
}

export interface IdempotencyStore {
  get(key: string): Promise<IdempotencyRecord | null>;
  put(key: string, record: IdempotencyRecord, ttlSeconds?: number): Promise<void>;
}

export class KvIdempotencyStore implements IdempotencyStore {
  constructor(private kv: KVNamespace) {}

  async get(key: string): Promise<IdempotencyRecord | null> {
    return (await this.kv.get<IdempotencyRecord>(key, "json")) ?? null;
  }

  async put(key: string, record: IdempotencyRecord, ttlSeconds = 604800): Promise<void> {
    await this.kv.put(key, JSON.stringify(record), { expirationTtl: ttlSeconds });
  }
}

export function emailMessageKey(messageId: string): string {
  return `email:${messageId}`;
}

export function emailHashKey(contentHash: string): string {
  return `email:hash:${contentHash}`;
}

export async function hashContent(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function checkDuplicate(
  store: IdempotencyStore,
  messageId: string,
  contentHash: string,
): Promise<{ duplicate: boolean; key: string }> {
  const messageKey = emailMessageKey(messageId);
  if (await store.get(messageKey)) {
    return { duplicate: true, key: messageKey };
  }

  const hashKey = emailHashKey(contentHash);
  if (await store.get(hashKey)) {
    return { duplicate: true, key: hashKey };
  }

  return { duplicate: false, key: messageKey };
}

export async function recordProcessed(
  store: IdempotencyStore,
  messageId: string,
  contentHash: string,
  sheetRowId: string,
): Promise<void> {
  const record: IdempotencyRecord = {
    sheetRowId,
    processedAt: new Date().toISOString(),
  };
  await store.put(emailMessageKey(messageId), record);
  await store.put(emailHashKey(contentHash), record);
}
