import IORedis           from "ioredis";
import type { ShortMemory, JobMemory } from "../../types/memory";

export class RedisMemory implements ShortMemory {
  private redis: IORedis;
  private defaultTTL: number;

  constructor() {
    this.redis      = new IORedis(process.env.REDIS_URL!, { maxRetriesPerRequest: null });
    this.defaultTTL = Number(process.env.MEMORY_SHORT_TTL_SEC ?? 3600);
  }

  async get<T>(key: string): Promise<T | null> {
    const raw = await this.redis.get(key);
    return raw ? JSON.parse(raw) : null;
  }

  async set<T>(key: string, value: T, ttlSec = this.defaultTTL): Promise<void> {
    await this.redis.set(key, JSON.stringify(value), "EX", ttlSec);
  }

  async del(key: string): Promise<void> {
    await this.redis.del(key);
  }

  async getJob(jobId: string): Promise<JobMemory | null> {
    return this.get<JobMemory>(`job:${jobId}`);
  }

  async setJob(jobId: string, data: Partial<JobMemory>): Promise<void> {
    const existing = (await this.getJob(jobId)) ?? { jobId, state: "PENDING", createdAt: new Date().toISOString() };
    await this.set(`job:${jobId}`, { ...existing, ...data }, 86400);
  }
}
