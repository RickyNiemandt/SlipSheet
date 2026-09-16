import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";

export interface IdempotencyRecord {
  sheetRowId: string;
  processedAt: string;
}

export class MemoryIdempotencyStore {
  private records = new Map<string, IdempotencyRecord>();

  async get(key: string): Promise<IdempotencyRecord | null> {
    return this.records.get(key) ?? null;
  }

  async put(key: string, record: IdempotencyRecord): Promise<void> {
    this.records.set(key, record);
  }
}

export function emailMessageKey(messageId: string): string {
  return `email:${messageId}`;
}

export function emailHashKey(contentHash: string): string {
  return `email:hash:${contentHash}`;
}

export function hashContent(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function checkAndRecord(
  store: MemoryIdempotencyStore,
  messageId: string,
  bytes: Uint8Array,
): Promise<{ duplicate: boolean; key: string }> {
  const messageKey = emailMessageKey(messageId);
  const existing = await store.get(messageKey);
  if (existing) {
    return { duplicate: true, key: messageKey };
  }

  const contentHash = hashContent(bytes);
  const hashKey = emailHashKey(contentHash);
  const hashExisting = await store.get(hashKey);
  if (hashExisting) {
    return { duplicate: true, key: hashKey };
  }

  const record = { sheetRowId: "row-1", processedAt: new Date().toISOString() };
  await store.put(messageKey, record);
  await store.put(hashKey, record);
  return { duplicate: false, key: messageKey };
}

describe("idempotency", () => {
  it("dedupes by message id", async () => {
    const store = new MemoryIdempotencyStore();
    const bytes = new Uint8Array([1, 2, 3]);
    const first = await checkAndRecord(store, "<msg-1@example.com>", bytes);
    const second = await checkAndRecord(store, "<msg-1@example.com>", bytes);
    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
  });

  it("dedupes by content hash when message id differs", async () => {
    const store = new MemoryIdempotencyStore();
    const bytes = new Uint8Array([4, 5, 6]);
    await checkAndRecord(store, "<msg-a@example.com>", bytes);
    const second = await checkAndRecord(store, "<msg-b@example.com>", bytes);
    expect(second.duplicate).toBe(true);
  });
});
