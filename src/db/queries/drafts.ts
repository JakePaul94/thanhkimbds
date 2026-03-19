import { db } from "../client";
import { contentDrafts } from "../schema";
import { eq } from "drizzle-orm";

export async function getDraftByJobId(jobId: string) {
  const [row] = await db
    .select()
    .from(contentDrafts)
    .where(eq(contentDrafts.jobId, jobId))
    .limit(1);
  return row ?? null;
}

export async function saveDraft(data: {
  jobId: string;
  topic?: string;
  facebook?: string;
  zalo?: string;
  imageUrl?: string;
  videoUrl?: string;
}) {
  try {
    const id = `draft-${data.jobId}`;
    await db.insert(contentDrafts).values({
      id,
      jobId: data.jobId,
      facebook: data.facebook ?? null,
      zalo: data.zalo ?? null,
      imageUrl: data.imageUrl ?? null,
      videoUrl: data.videoUrl ?? null,
    }).onConflictDoUpdate({
      target: contentDrafts.id,
      set: {
        facebook: data.facebook ?? null,
        zalo: data.zalo ?? null,
        imageUrl: data.imageUrl ?? null,
        videoUrl: data.videoUrl ?? null,
      },
    });
  } catch (e) {
    console.error("saveDraft failed", e);
  }
}
