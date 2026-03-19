import { db } from "../client";
import { contentDrafts, workflowJobs } from "../schema";
import { eq, desc } from "drizzle-orm";

/** Chỉ lấy bài đã đăng (state = PUBLISHED) */
export async function getPosts(limit = 10) {
  try {
    const rows = await db
      .select({
        id: contentDrafts.id,
        jobId: contentDrafts.jobId,
        facebook: contentDrafts.facebook,
        zalo: contentDrafts.zalo,
        imageUrl: contentDrafts.imageUrl,
        videoUrl: contentDrafts.videoUrl,
        createdAt: contentDrafts.createdAt,
        topic: workflowJobs.topic,
      })
      .from(contentDrafts)
      .innerJoin(workflowJobs, eq(contentDrafts.jobId, workflowJobs.id))
      .where(eq(workflowJobs.state, "PUBLISHED"))
      .orderBy(desc(contentDrafts.createdAt))
      .limit(limit);
    return rows;
  } catch {
    return [];
  }
}
