/**
 * Gửi tin nhắn qua Facebook Messenger Send API.
 * Dùng bởi Customer Agent khi trả lời khách qua webhook.
 */
import { log } from "../utils/logger";

const GRAPH_API = "https://graph.facebook.com/v21.0";

export async function sendFacebookMessage(recipientId: string, text: string): Promise<boolean> {
  const token = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
  const pageId = process.env.FACEBOOK_PAGE_ID;
  if (!token || !pageId) {
    log.warn("Facebook Send: missing FACEBOOK_PAGE_ACCESS_TOKEN or FACEBOOK_PAGE_ID");
    return false;
  }

  try {
    const url = `${GRAPH_API}/${pageId}/messages`;
    const body = new URLSearchParams({
      recipient: JSON.stringify({ id: recipientId }),
      messaging_type: "RESPONSE",
      message: JSON.stringify({ text }),
      access_token: token,
    });

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    const data = (await res.json()) as { error?: { message: string }; message_id?: string };
    if (data.error) {
      log.error({ err: data.error.message, recipientId }, "Facebook Send failed");
      return false;
    }
    log.info({ recipientId, messageId: data.message_id }, "Facebook message sent");
    return true;
  } catch (err) {
    log.error({ err: (err as Error).message, recipientId }, "Facebook Send error");
    return false;
  }
}
