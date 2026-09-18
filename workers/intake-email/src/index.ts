import { extractSlipFromEmail } from "@slipsheet/email-intake";
import type { IntakeMeta } from "@slipsheet/schema";
import { KvIdempotencyStore } from "./idempotency.js";
import { KvUserStore, PipelineError, runPipeline } from "./pipeline.js";
import {
  buildConfirmReply,
  buildDuplicateReply,
  buildErrorReply,
} from "./reply.js";

export interface Env {
  IDEMPOTENCY: KVNamespace;
  USERS: KVNamespace;
  GEMINI_API_KEY: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  STATUS_URL: string;
}

function messageIdFromHeaders(headers: Headers): string {
  return headers.get("Message-ID") ?? `generated-${Date.now()}@slipsheet.local`;
}

export default {
  async email(message: ForwardableEmailMessage, env: Env): Promise<void> {
    const idempotency = new KvIdempotencyStore(env.IDEMPOTENCY);
    const users = new KvUserStore(env.USERS);
    const oauth = {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      redirectUri: `${env.STATUS_URL}/oauth/callback`,
    };

    try {
      const slip = await extractSlipFromEmail(message.raw);
      if (!slip) {
        await message.reply({
          from: message.to,
          to: message.from,
          subject: "Re: SlipSheet — no attachment found",
          text: buildErrorReply(
            "No PDF or image attachment found. Forward the invoice with the slip attached, or attach a photo/PDF directly.",
            env.STATUS_URL,
          ),
        } as unknown as EmailMessage);
        return;
      }

      const meta: IntakeMeta = {
        channel: "email",
        message_id: messageIdFromHeaders(message.headers),
        sender_email: message.from,
        content_hash: "pending",
        received_at: new Date().toISOString(),
        mime_type: slip.mimeType,
        filename: slip.filename ?? undefined,
      };

      const result = await runPipeline({
        bytes: slip.content,
        mimeType: slip.mimeType,
        filename: slip.filename ?? undefined,
        meta,
        idempotency,
        users,
        oauth,
        geminiApiKey: env.GEMINI_API_KEY,
      });

      if (result.duplicate) {
        await message.reply({
          from: message.to,
          to: message.from,
          subject: "Re: SlipSheet — duplicate",
          text: buildDuplicateReply(),
        } as unknown as EmailMessage);
        return;
      }

      const user = await users.get(message.from);
      await message.reply({
        from: message.to,
        to: message.from,
        subject: "Re: SlipSheet — receipt captured",
        text: buildConfirmReply(result.receipt!, user?.spreadsheetUrl),
      } as unknown as EmailMessage);
    } catch (err) {
      const text =
        err instanceof PipelineError && err.code === "USER_NOT_CONNECTED"
          ? buildErrorReply(
              "Your Google Sheet is not connected yet. Visit the link below to authorise SlipSheet.",
              env.STATUS_URL,
            )
          : buildErrorReply(
              err instanceof Error ? err.message : "Unexpected error during processing.",
              env.STATUS_URL,
            );

      await message.reply({
        from: message.to,
        to: message.from,
        subject: "Re: SlipSheet — processing failed",
        text,
      } as unknown as EmailMessage);
    }
  },
};
