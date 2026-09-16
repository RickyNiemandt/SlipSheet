import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { extractSlipFromEmail } from "@slipsheet/email-intake";

const EMAIL_DIR = join(import.meta.dirname, "..", "fixtures", "email");

describe("parse-email", () => {
  it("extracts PDF attachment from .eml fixture", async () => {
    const raw = await readFile(join(EMAIL_DIR, "with-attachment.eml"), "utf8");
    const slip = await extractSlipFromEmail(raw);
    expect(slip).not.toBeNull();
    expect(slip!.mimeType).toBe("application/pdf");
    expect(slip!.source).toBe("attachment");
    expect(slip!.content.length).toBeGreaterThan(100);
  });

  it("extracts inline PNG from .eml fixture", async () => {
    const raw = await readFile(join(EMAIL_DIR, "with-inline-image.eml"), "utf8");
    const slip = await extractSlipFromEmail(raw);
    expect(slip).not.toBeNull();
    expect(slip!.mimeType).toBe("image/png");
    expect(slip!.source).toBe("inline");
  });

  it("returns null when no supported attachment", async () => {
    const raw = `From: a@b.com
To: inbox@test.com
Subject: Empty
Message-ID: <empty@test.com>
Content-Type: text/plain

No attachment here.`;
    const slip = await extractSlipFromEmail(raw);
    expect(slip).toBeNull();
  });
});
