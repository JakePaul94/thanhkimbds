import { WebSocketServer, WebSocket } from "ws";
import { registry }    from "../registry/SkillRegistry";
import { RedisMemory } from "../memory/short/RedisMemory";
import { QdrantMemory } from "../memory/long/QdrantMemory";
import { upsertUser } from "../db/queries/users";
import { insertChatMessage } from "../db/queries/chatHistory";
import { ChatHistoryStore } from "../services/ChatHistoryStore";
import { intentRouter } from "../intents/IntentRouter";
import {
  getPendingChoice,
  setPendingChoice,
  clearPendingChoice,
  parseChoiceIndex,
  type PropertyCandidate,
} from "../intents/PendingChoiceStore";
import type { IntentResult, SupervisorIntent } from "../intents/types";
import { log }         from "../utils/logger";
import { registerExpoBroadcast } from "./expoBroadcast";

const SUPERVISOR_PLATFORM = "supervisor_expo";

const WRITE_INTENTS: SupervisorIntent[] = ["write_post_product", "write_post_experience", "write_post_news", "write_post_news_video"];

// Message types — chỉ cho Supervisor (Expo). Customer dùng CustomerGateway.
type GatewayMessage =
  | { type: "ping" }
  | { type: "run_skill"; skillName: string; input: Record<string, unknown>; jobId: string }
  | { type: "chat"; message: string; supervisorId?: string }
  | { type: "request_post"; message: string; supervisorId?: string }
  | { type: "job_status"; jobId: string }
  | { type: "approve"; jobId: string }
  | { type: "reject";  jobId: string; reason: string }
  | { type: "list_skills" };

export class ExpoGateway {
  private wss: WebSocketServer;
  private clients = new Set<WebSocket>();
  private chatStore = new ChatHistoryStore();

  constructor(port = Number(process.env.WS_SUPERVISOR_PORT ?? 3003)) {
    this.wss = new WebSocketServer({ port });
    this.wss.on("connection", (ws) => this.onConnect(ws));
    registerExpoBroadcast((event) => this.broadcast(event));
    log.info(`📡 ExpoGateway (supervisor) → ws://localhost:${port}`);
  }

  private onConnect(ws: WebSocket) {
    this.clients.add(ws);
    log.info("Supervisor (Expo) connected");

    ws.on("message", async (raw) => {
      try {
        const msg: GatewayMessage = JSON.parse(raw.toString());
        const res = await this.handle(msg);
        ws.send(JSON.stringify(res));
      } catch (err: any) {
        ws.send(JSON.stringify({ type: "error", message: err.message }));
      }
    });

    ws.on("close", () => {
      this.clients.delete(ws);
      log.info("Supervisor (Expo) disconnected");
    });
  }

  private async handle(msg: GatewayMessage): Promise<unknown> {
    switch (msg.type) {
      case "ping":
        return { type: "pong", ts: Date.now() };

      case "list_skills":
        return { type: "skills", data: registry.list() };

      case "chat": {
        const supervisorId = msg.supervisorId ?? "supervisor-default";
        const userMessage = msg.message;

        await upsertUser(supervisorId, SUPERVISOR_PLATFORM);
        const userMsgId = await insertChatMessage(supervisorId, "user", userMessage, SUPERVISOR_PLATFORM);
        await this.chatStore.upsertChatMessage(userMsgId, supervisorId, "user", userMessage, SUPERVISOR_PLATFORM);

        const res = await this.routeByIntent(supervisorId, userMessage);
        const botMsgId = await insertChatMessage(supervisorId, "bot", res.message, SUPERVISOR_PLATFORM);
        await this.chatStore.upsertChatMessage(botMsgId, supervisorId, "bot", res.message, SUPERVISOR_PLATFORM);

        if (res.type === "post_requested") return res;
        return { type: "chat_response", text: res.message };
      }

      case "request_post": {
        const supervisorId = msg.supervisorId ?? "supervisor-default";
        const userMessage = msg.message;
        await upsertUser(supervisorId, SUPERVISOR_PLATFORM);
        const userMsgId = await insertChatMessage(supervisorId, "user", userMessage, SUPERVISOR_PLATFORM);
        await this.chatStore.upsertChatMessage(userMsgId, supervisorId, "user", userMessage, SUPERVISOR_PLATFORM);

        const intent = await intentRouter.classify(userMessage);
        const res = await this.handleRequestPost(supervisorId, userMessage, intent);
        const botMsgId = await insertChatMessage(supervisorId, "bot", res.message, SUPERVISOR_PLATFORM);
        await this.chatStore.upsertChatMessage(botMsgId, supervisorId, "bot", res.message, SUPERVISOR_PLATFORM);
        return res;
      }

      case "run_skill": {
        const shortMemory = new RedisMemory();
        const longMemory  = new QdrantMemory();
        const ctx = { jobId: msg.jobId, shortMemory, longMemory, tracer: null };
        const result = await registry.run(msg.skillName, msg.input, ctx);
        return { type: "skill_result", skillName: msg.skillName, result };
      }

      case "job_status": {
        const mem = new RedisMemory();
        const job = await mem.getJob(msg.jobId);
        return { type: "job_status", data: job };
      }

      case "approve": {
        const { jobQueue } = await import("../queue/JobQueue");
        const { jobRepo }  = await import("../db/repositories/JobRepository");
        await jobRepo.setState(msg.jobId, "APPROVED");
        await jobQueue.resumeJob(msg.jobId, "facebook_post");
        return { type: "approved", jobId: msg.jobId };
      }

      case "reject": {
        const { jobRepo } = await import("../db/repositories/JobRepository");
        await jobRepo.setState(msg.jobId, "REJECTED");
        return { type: "rejected", jobId: msg.jobId };
      }

      default:
        return { type: "error", message: "Unknown message type" };
    }
  }

  private async routeByIntent(supervisorId: string, userMessage: string): Promise<{ message: string; type?: "post_requested"; jobId?: string; topic?: string }> {
    const pending = await getPendingChoice(supervisorId);
    if (pending) {
      const idx = parseChoiceIndex(userMessage, pending.candidates.length - 1);
      if (idx !== null) {
        await clearPendingChoice(supervisorId);
        const chosen = pending.candidates[idx];
        return this.handleRequestPost(supervisorId, userMessage, {
          intent: "write_post_product",
          extractedTopic: chosen.title,
          skipVideo: true,
        }, chosen.id);
      }
      return { message: "Em chưa hiểu. Sếp chọn số 1, 2 hoặc 3 ạ." };
    }

    const intent = await intentRouter.classify(userMessage);

    if (WRITE_INTENTS.includes(intent.intent)) {
      return this.handleRequestPost(supervisorId, userMessage, intent);
    }

    switch (intent.intent) {
      case "track_posts":
        return { message: "Để theo dõi bài đăng, sếp vào Menu → Theo dõi bài đăng ạ." };
      case "analyze_engagement":
        return { message: "Tính năng phân tích tương tác đang phát triển. Sếp có thể vào Menu → Theo dõi bài đăng để xem danh sách bài ạ." };
      case "cost_stats":
        return { message: "Để xem thống kê chi phí, sếp vào Menu → Theo dõi chi phí ạ." };
      case "list_properties":
        return { message: "Để xem danh sách BĐS, sếp vào Menu → Quản lý bất động sản ạ." };
      default: {
        const shortMemory = new RedisMemory();
        const longMemory = new QdrantMemory();
        await longMemory.init();
        const ctx = { jobId: `supervisor-${Date.now()}`, shortMemory, longMemory, tracer: null };
        const result = await registry.run("agent_chat", { message: userMessage }, ctx);
        const text = (result as { data?: { text?: string } })?.data?.text ?? "Xin lỗi, vui lòng thử lại.";
        return { message: text };
      }
    }
  }

  private async handleRequestPost(
    supervisorId: string,
    rawMessage: string,
    intent: IntentResult,
    forcePropertyId?: string
  ): Promise<{ type?: "post_requested"; jobId?: string; topic?: string; message: string }> {
    const { jobQueue } = await import("../queue/JobQueue");
    const { jobRepo }  = await import("../db/repositories/JobRepository");
    const { searchPropertyByQuery } = await import("../indexing/PropertyIndexer");
    const props = await import("../db/queries/properties");
    const { v4: uuid } = await import("uuid");

    const skipVideo = intent.skipVideo ?? true;
    let topic: string | undefined = intent.extractedTopic ?? (rawMessage
      .replace(/^(viết bài|đăng bài|tạo bài)\s+(về|với nội dung|:)?\s*/i, "")
      .replace(/tạo video\s+/i, "")
      .trim() || rawMessage);
    const vaguePattern = /^(để\s+)?(đăng|post|chia sẻ)\s+(facebook|web|zalo)/i;
    const platformOnly = /^(facebook|web|zalo|đăng)$/i.test(topic?.trim() ?? "");
    const noRealTopic = !topic || vaguePattern.test(topic) || topic.length < 5 || platformOnly;
    if (noRealTopic) {
      topic = undefined; // Không truyền forceTopic → IdeaSkill dùng LLM sinh ý tưởng
    }

    const jobId = `agent-${Date.now()}-${uuid().slice(0, 8)}`;
    await jobRepo.create(jobId);

    let property: Awaited<ReturnType<typeof props.getProperty>> | null = null;
    const isProductIntent = intent.intent === "write_post_product";

    if (isProductIntent && (topic || forcePropertyId)) {
      if (forcePropertyId) {
        property = await props.getProperty(forcePropertyId);
      } else if (topic) {
        const hits = await searchPropertyByQuery(topic, 5);
        if (hits.length === 1 || (hits.length > 0 && (hits[0].score ?? 0) > 0.8)) {
          property = await props.getProperty(hits[0].id);
        } else if (hits.length > 1) {
          const fullCandidates = await Promise.all(hits.map((h) => props.getProperty(h.id)));
          const validCandidates = fullCandidates.filter(Boolean).map((p: any) => ({
            id: p.id, title: p.title, price: p.price, address: p.address,
          }));
          await setPendingChoice(supervisorId, { candidates: validCandidates, query: topic!, createdAt: new Date().toISOString() });
        const list = validCandidates.map((c, i) => `${i + 1}) ${c.title}${c.price ? ` - ${c.price}` : ""}`).join("\n");
        return { message: `Em tìm thấy ${validCandidates.length} căn:\n${list}\n\nSếp chọn căn nào (1, 2 hoặc 3)?` };
        }
      }
    }

    const shortMemory = new RedisMemory();
    if (property) {
      await shortMemory.setJob(jobId, {
        property: {
          id: property.id,
          title: property.title,
          price: property.price,
          area: property.area,
          address: property.address,
          district: property.district,
          description: property.description,
          contactPhone: property.contactPhone,
          imageUrls: (property.imageUrls ?? []) as string[],
          videoUrl: property.videoUrl,
        },
        topic: property.title,
        hook: property.description ?? property.title,
        hashtags: ["#batdongsan", "#nhadat", "#muanha", "#dautu"],
      });
    }

    const forceCategory =
      intent.intent === "write_post_experience" ? "kinh_nghiem"
      : intent.intent === "write_post_news" || intent.intent === "write_post_news_video" ? "tin_tuc"
      : property ? "san_pham" : "tin_tuc";

    await jobQueue.addTestJob(jobId, {
      skipVideo,
      forceCategory,
      forceTopic: property ? undefined : topic,
      forcePropertyId: property?.id,
    });

    const msgText = property
      ? `Đã tạo job viết bài từ BĐS: "${property.title}"`
      : topic
        ? `Đã tạo job viết bài: "${topic}"`
        : "Đã tạo job viết bài. Ý tưởng sẽ được sinh tự động.";
    return { type: "post_requested", jobId, topic, message: msgText };
  }

  // Broadcast event tới tất cả Expo clients (push notification style)
  broadcast(event: unknown) {
    const data = JSON.stringify(event);
    for (const ws of this.clients) {
      if (ws.readyState === WebSocket.OPEN) ws.send(data);
    }
  }
}
