import { QdrantClient }   from "@qdrant/js-client-rest";
import { GoogleGenAI }    from "@google/genai";
import type { LongMemory, MemoryPayload, MemoryResult } from "../../types/memory";

const COLLECTION = process.env.QDRANT_COLLECTION ?? "agent_memory";
const VECTOR_DIM = 3072; // gemini-embedding-001 (nếu trước dùng OpenAI 1536, xóa collection cũ)

export class QdrantMemory implements LongMemory {
  private qdrant: QdrantClient;
  private genai: GoogleGenAI;

  constructor() {
    this.qdrant = new QdrantClient({ url: process.env.QDRANT_URL });
    this.genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }

  async init() {
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

  async upsert(id: string, payload: MemoryPayload): Promise<void> {
    const vector = payload.vector ?? (await this.embed(payload.text));
    await this.qdrant.upsert(COLLECTION, {
      wait: true,
      points: [{ id, vector, payload: { text: payload.text, ...payload.metadata } }],
    });
  }

  async search(query: string, topK = 5): Promise<MemoryResult[]> {
    const vector = await this.embed(query);
    const results = await this.qdrant.search(COLLECTION, { vector, limit: topK, with_payload: true });
    return results.map((r) => ({
      id:      String(r.id),
      score:   r.score,
      payload: { text: (r.payload?.text as string) ?? "", metadata: r.payload ?? {} },
    }));
  }

  async delete(id: string): Promise<void> {
    await this.qdrant.delete(COLLECTION, { wait: true, points: [id] });
  }
}
