/**
 * Lưu lịch sử chat vào Qdrant (semantic search).
 * Dùng chung cho customer (web) và supervisor (expo).
 */
import { QdrantClient } from "@qdrant/js-client-rest";
import { GoogleGenAI } from "@google/genai";

const COLLECTION = "chat_history";
const VECTOR_DIM = 3072;

export class ChatHistoryStore {
  private qdrant: QdrantClient;
  private genai: GoogleGenAI;

  constructor() {
    this.qdrant = new QdrantClient({ url: process.env.QDRANT_URL });
    this.genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }

  private async ensureCollection() {
    const collections = await this.qdrant.getCollections();
    if (!collections.collections.some((c) => c.name === COLLECTION)) {
      await this.qdrant.createCollection(COLLECTION, {
        vectors: { size: VECTOR_DIM, distance: "Cosine" },
      });
    }
  }

  private async embed(text: string): Promise<number[]> {
    const res = await this.genai.models.embedContent({
      model: "gemini-embedding-001",
      contents: text,
    });
    return res.embeddings![0].values ?? [];
  }

  async upsertChatMessage(
    id: string,
    userId: string,
    role: string,
    message: string,
    platform: string
  ): Promise<void> {
    try {
      await this.ensureCollection();
      const vector = await this.embed(message);
      // id từ insertChatMessage giờ là UUID đầy đủ, hợp lệ cho Qdrant
      await this.qdrant.upsert(COLLECTION, {
        wait: true,
        points: [
          {
            id,
            vector,
            payload: {
              text: message,
              userId,
              role,
              platform,
              type: "chat",
            },
          },
        ],
      });
    } catch (err) {
      const { log } = await import("../utils/logger");
      log.warn({ err: (err as Error).message, id }, "ChatHistoryStore upsert failed");
    }
  }

  async searchByUser(userId: string, query: string, topK = 10) {
    try {
      await this.ensureCollection();
      const vector = await this.embed(query);
      const results = await this.qdrant.search(COLLECTION, {
        vector,
        limit: topK,
        filter: {
          must: [{ key: "userId", match: { value: userId } }],
        },
        with_payload: true,
      });
      return results.map((r) => ({
        id: String(r.id),
        text: (r.payload?.text as string) ?? "",
        role: r.payload?.role,
        score: r.score,
      }));
    } catch {
      return [];
    }
  }
}
