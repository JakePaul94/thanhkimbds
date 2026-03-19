import { db } from "../client";
import { publishedPosts, contentDrafts, workflowJobs } from "../schema";
import { eq, desc, and } from "drizzle-orm";
import { v4 as uuid } from "uuid";

export async function savePublishedPost(jobId: string, platform: string, platformPostId: string) {
  const existing = await db
    .select()
    .from(publishedPosts)
    .where(and(eq(publishedPosts.jobId, jobId), eq(publishedPosts.platform, platform)))
    .limit(1);
  if (existing.length > 0) return; // Đã lưu rồi — tránh trùng khi resume nhiều lần

  const id = `pp-${Date.now()}-${uuid().slice(0, 8)}`;
  await db.insert(publishedPosts).values({
    id,
    jobId,
    platform,
    platformPostId,
  });
}

export async function listPublishedPosts(limit = 50) {
  const rows = await db
    .select({
      id: publishedPosts.id,
      jobId: publishedPosts.jobId,
      platform: publishedPosts.platform,
      platformPostId: publishedPosts.platformPostId,
      publishedAt: publishedPosts.publishedAt,
      topic: workflowJobs.topic,
      facebook: contentDrafts.facebook,
      imageUrl: contentDrafts.imageUrl,
      videoUrl: contentDrafts.videoUrl,
    })
    .from(publishedPosts)
    .innerJoin(contentDrafts, eq(publishedPosts.jobId, contentDrafts.jobId))
    .innerJoin(workflowJobs, eq(publishedPosts.jobId, workflowJobs.id))
    .orderBy(desc(publishedPosts.publishedAt))
    .limit(limit * 3); // Lấy dư để dedupe

  // Chỉ giữ 1 bản ghi mới nhất cho mỗi (jobId, platform) — tránh hiện trùng khi đã lưu nhiều lần
  const seen = new Set<string>();
  const deduped = rows.filter((r) => {
    const key = `${r.jobId}:${r.platform}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return deduped.slice(0, limit);
}
