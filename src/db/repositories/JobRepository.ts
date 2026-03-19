import { db } from "../client";
import { workflowJobs, hitlEvents } from "../schema";
import { eq, desc, isNotNull, and } from "drizzle-orm";

export const jobRepo = {
  async create(jobId: string) {
    try {
      await db.insert(workflowJobs).values({
        id: jobId,
        state: "PENDING",
      }).onConflictDoNothing();
    } catch {}
  },

  async findById(jobId: string) {
    try {
      const [row] = await db.select().from(workflowJobs).where(eq(workflowJobs.id, jobId));
      return row ?? null;
    } catch {
      return null;
    }
  },

  async setState(jobId: string, state: string, extra?: { topic?: string }) {
    try {
      const set: Record<string, unknown> = { state, updatedAt: new Date() };
      if (extra?.topic) set.topic = extra.topic;
      await db.update(workflowJobs).set(set).where(eq(workflowJobs.id, jobId));
    } catch {}
  },

  async listByState(state: string) {
    try {
      return await db.select().from(workflowJobs).where(eq(workflowJobs.state, state));
    } catch {
      return [];
    }
  },

  /** 15 bài đăng gần nhất (có topic) — dùng cho IdeaSkill tránh trùng ý tưởng */
  async getRecentTopics(limit = 15): Promise<string[]> {
    try {
      const rows = await db
        .select({ topic: workflowJobs.topic })
        .from(workflowJobs)
        .where(and(isNotNull(workflowJobs.topic)))
        .orderBy(desc(workflowJobs.updatedAt))
        .limit(limit);
      return rows.map((r) => r.topic!).filter(Boolean);
    } catch {
      return [];
    }
  },

  async patchDraft(jobId: string, p: Record<string, unknown>) {
    try {
      const { saveDraft } = await import("../queries/drafts");
      await saveDraft({
        jobId,
        facebook: p.caption as string,
        imageUrl: p.imageUrl as string,
      });
    } catch {}
  },

  async setPublishAt(jobId: string, d: Date) {
    try {
      await db.update(workflowJobs).set({ publishAt: d, updatedAt: new Date() }).where(eq(workflowJobs.id, jobId));
    } catch {}
  },

  async logEvent(jobId: string, action: string, p: unknown) {
    try {
      await db.insert(hitlEvents).values({
        id: `evt-${Date.now()}-${jobId}`,
        jobId,
        action,
        payload: p as Record<string, unknown>,
      });
    } catch {}
  },
};
