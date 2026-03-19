import { Hono } from "hono";
import { db } from "../db/client";
import { facebookMessages } from "../db/schema";
import { log } from "../utils/logger";
import { v4 as uuid } from "uuid";
import { FacebookMessageStore } from "../services/FacebookMessageStore";
import { customerAgentReply } from "../agents/CustomerAgent";
import { sendFacebookMessage } from "../services/FacebookSend";

const VERIFY_TOKEN = process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN ?? "thanhkim_bds_verify";

export const facebookWebhookRouter = new Hono();

/** POST /test: Test webhook — gửi payload mẫu (không body) HOẶC body JSON tùy chỉnh, in data vào log */
facebookWebhookRouter.post("/test", async (c) => {
  let payload: object;
  try {
    const body = (await c.req.json()) as object;
    payload = body && Object.keys(body).length > 0 ? body : null!;
  } catch {
    payload = null!;
  }
  const samplePayload = payload ?? {
    object: "page",
    entry: [
      {
        id: "61581589693292",
        time: Date.now(),
        messaging: [
          {
            sender: { id: "USER_PSID_123" },
            recipient: { id: "61581589693292" },
            timestamp: Date.now(),
            message: {
              mid: "mid.test-" + Date.now(),
              text: "Xin chào, tôi muốn tư vấn nhà đất",
            },
          },
        ],
      },
    ],
  };
  log.info({ webhook: samplePayload }, "Facebook webhook TEST — payload (xem log server)");
  // Gọi lại handler chính với payload mẫu
  const base = c.req.url.replace(/\/webhook\/facebook\/test.*$/, "");
  const res = await fetch(`${base}/webhook/facebook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(samplePayload),
  });
  const text = await res.text();
  return c.json({ ok: true, message: "Payload đã xử lý, xem log server", status: res.status }, 200);
});

/** GET: Facebook webhook verification */
facebookWebhookRouter.get("/", (c) => {
  const mode = c.req.query("hub.mode");
  const token = c.req.query("hub.verify_token");
  const challenge = c.req.query("hub.challenge");

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    log.info("Facebook webhook verified");
    return c.text(challenge ?? "", 200);
  }
  log.warn({ mode, tokenMatch: token === VERIFY_TOKEN }, "Facebook webhook verification failed");
  return c.json({ error: "Forbidden" }, 403);
});

/** POST: Facebook webhook events (messages, etc.) */
facebookWebhookRouter.post("/", async (c) => {
  const body = (await c.req.json()) as {
    object?: string;
    entry?: Array<{
      id: string;
      time: number;
      messaging?: Array<{
        sender: { id: string };
        recipient: { id: string };
        timestamp: number;
        message?: {
          mid: string;
          text?: string;
          attachments?: Array<{ type: string; payload?: { url?: string } }>;
        };
        message_echo?: { mid: string; text?: string };
        delivery?: unknown;
        read?: unknown;
      }>;
    }>;
  };

  // Log raw webhook payload để debug
  log.info({ webhook: body }, "Facebook webhook received");

  if (body.object !== "page") {
    return c.json({ ok: true }, 200);
  }

  const store = new FacebookMessageStore();

  for (const entry of body.entry ?? []) {
    for (const event of entry.messaging ?? []) {
      // Chỉ lưu tin nhắn từ user (bỏ qua echo, delivery, read)
      const msg = event.message;
      if (!msg || event.message_echo) continue;

      const text = msg.text?.trim();
      const hasContent = !!text || (msg.attachments?.length ?? 0) > 0;

      if (!hasContent) continue;

      const senderId = event.sender.id;
      const recipientId = event.recipient.id;
      const messageId = msg.mid;
      const timestamp = new Date(event.timestamp);

      const attachments = (msg.attachments ?? []).map((a) => ({
        type: a.type,
        url: a.payload?.url,
      }));

      try {
        const id = `fb-msg-${Date.now()}-${uuid().slice(0, 8)}`;
        await db
          .insert(facebookMessages)
          .values({
            id,
            messageId,
            senderId,
            recipientId,
            text: text ?? null,
            attachments,
            timestamp,
          })
          .onConflictDoNothing({ target: facebookMessages.messageId });

        // Lưu vào Qdrant để tìm kiếm ngữ nghĩa (chỉ khi có text)
        if (text) {
          await store.upsertMessage(id, {
            text,
            senderId,
            recipientId,
            messageId,
            timestamp: timestamp.toISOString(),
          });
        }

        log.info(
          { messageId, senderId, textLen: text?.length ?? 0 },
          "Facebook message saved"
        );

        // Trả lời qua Customer Agent (chỉ khi có text)
        if (text) {
          customerAgentReply(text)
            .then((reply) => sendFacebookMessage(senderId, reply))
            .catch((err) => log.error({ err: (err as Error).message, senderId }, "Facebook reply failed"));
        }
      } catch (err) {
        log.error({ err: (err as Error).message, messageId }, "Save Facebook message failed");
      }
    }
  }

  return c.json({ ok: true }, 200);
});
