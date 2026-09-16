import PostalMime from "postal-mime";

const SUPPORTED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export interface ExtractedSlipFile {
  filename: string | null;
  mimeType: string;
  content: Uint8Array;
  source: "attachment" | "inline";
}

export async function extractSlipFromEmail(raw: string | ArrayBuffer | ReadableStream): Promise<ExtractedSlipFile | null> {
  const email = await PostalMime.parse(raw);

  for (const attachment of email.attachments) {
    const mimeType = attachment.mimeType ?? "application/octet-stream";
    if (!SUPPORTED_MIME.has(mimeType)) continue;

    const content = toUint8Array(attachment.content);
    if (content.length === 0) continue;

    return {
      filename: attachment.filename ?? null,
      mimeType,
      content,
      source: attachment.disposition === "inline" ? "inline" : "attachment",
    };
  }

  return null;
}

function toUint8Array(content: unknown): Uint8Array {
  if (content instanceof ArrayBuffer) {
    return new Uint8Array(content);
  }
  if (content instanceof Uint8Array) {
    return content;
  }
  if (typeof content === "string") {
    return new TextEncoder().encode(content);
  }
  return new Uint8Array();
}
