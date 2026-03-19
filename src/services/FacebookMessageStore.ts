import { QdrantClient } from "@qdrant/js-client-rest";
import { GoogleGenAI } from "@google/genai";

const COLLECTION = "facebook_messages";
const VECTOR_DIM = 3072; // gemini-embedding-001

type MessagePayload = {
  text: string;
  senderId: string;
  recipientId: string;
  messageId: string;
  timestamp: string;
};

export class FacebookMessageStore {
  private qdrant: QdrantClient;
  private genai: GoogleGenAI;

  constructor() {
    this.qdrant = new QdrantClient({ url: process.env.QDRANT_URL });
    this.genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }

  private async ensureCollection() {
    const collections = await this.qdrant.getCollections();
    const exists = collections.collections.some((c) => c.name === COLLECTION);
    if (!exists) {
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

  async upsertMessage(id: string, payload: MessagePayload): Promise<void> {
    try {
      await this.ensureCollection();
      const vector = await this.embed(payload.text);
      await this.qdrant.upsert(COLLECTION, {
        wait: true,
        points: [
          {
            id,
            vector,
            payload: {
              text: payload.text,
              senderId: payload.senderId,
              recipientId: payload.recipientId,
              messageId: payload.messageId,
              timestamp: payload.timestamp,
              type: "facebook_message",
            },
          },
        ],
      });
    } catch (err) {
      // Qdrant/Gemini có thể chưa sẵn sàng — log và bỏ qua
      const { log } = await import("../utils/logger");
      log.warn({ err: (err as Error).message, id }, "FacebookMessageStore upsert failed");
    }
  }

  async searchMessages(query: string, topK = 10) {
    await this.ensureCollection();
    const vector = await this.embed(query);
    const results = await this.qdrant.search(COLLECTION, {
      vector,
      limit: topK,
      with_payload: true,
    });
    return results.map((r) => ({
      id: String(r.id),
      score: r.score,
      text: (r.payload?.text as string) ?? "",
      senderId: r.payload?.senderId,
      timestamp: r.payload?.timestamp,
    }));
  }
}
