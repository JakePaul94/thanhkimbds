import { eq } from "drizzle-orm";
import { db } from "../client";
import { users } from "../schema";

export async function upsertUser(id: string, platform: string, metadata?: Record<string, unknown>) {
  await db
    .insert(users)
    .values({ id, platform, metadata: metadata ?? {}, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: users.id,
      set: { platform, metadata: metadata ?? {}, updatedAt: new Date() },
    });
}

export async function getUser(id: string) {
  const [row] = await db.select().from(users).where({ id });
  return row ?? null;
}

export async function listUsers(platform?: string) {
  if (platform) {
    return db.select().from(users).where(eq(users.platform, platform)).orderBy(users.createdAt);
  }
  return db.select().from(users).orderBy(users.createdAt);
}
