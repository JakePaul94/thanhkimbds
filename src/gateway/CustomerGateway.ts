/**
 * Customer Gateway — WebSocket cho khách hàng (web chatbot).
 * Chỉ xử lý chat qua Customer Agent, không có request_post, approve, reject.
 * Lưu user + lịch sử chat (SQL + Qdrant).
 */
import { WebSocketServer, WebSocket } from "ws";
import { customerAgentReply } from "../agents/CustomerAgent";
import { upsertUser } from "../db/queries/users";
import { insertChatMessage } from "../db/queries/chatHistory";
import { ChatHistoryStore } from "../services/ChatHistoryStore";
import { log } from "../utils/logger";

const PLATFORM = "web";

type CustomerMessage =
  | { type: "ping" }
  | { type: "chat"; message: string; userId?: string };

export class CustomerGateway {
  private wss: WebSocketServer;
  private chatStore = new ChatHistoryStore();

  constructor(port = Number(process.env.WS_CUSTOMER_PORT ?? process.env.WS_PORT ?? 3001)) {
    this.wss = new WebSocketServer({ port });
    this.wss.on("connection", (ws) => this.onConnect(ws));
    log.info(`📡 CustomerGateway (web) → ws://localhost:${port}`);
  }

  private onConnect(ws: WebSocket) {
    log.info("Customer (web) connected");

    ws.on("message", async (raw) => {
      try {
        const msg: CustomerMessage = JSON.parse(raw.toString());
        const res = await this.handle(msg);
        ws.send(JSON.stringify(res));
      } catch (err: unknown) {
        ws.send(JSON.stringify({ type: "error", message: (err as Error).message }));
      }
    });

    ws.on("close", () => {
      log.info("Customer (web) disconnected");
    });
  }

  private async handle(msg: CustomerMessage): Promise<unknown> {
    switch (msg.type) {
      case "ping":
        return { type: "pong", ts: Date.now() };
      case "chat": {
        const userId = msg.userId ?? `anon-${Date.now()}`;
        const userMessage = msg.message;

        await upsertUser(userId, PLATFORM);
        const userMsgId = await insertChatMessage(userId, "user", userMessage, PLATFORM);
        await this.chatStore.upsertChatMessage(userMsgId, userId, "user", userMessage, PLATFORM);

        const text = await customerAgentReply(userMessage);

        const botMsgId = await insertChatMessage(userId, "bot", text, PLATFORM);
        await this.chatStore.upsertChatMessage(botMsgId, userId, "bot", text, PLATFORM);

        return { type: "chat_response", text };
      }
      default:
        return { type: "error", message: "Unknown message type" };
    }
  }
}
