import { eq } from "drizzle-orm";
import { db } from "../client";
import { cronSchedules } from "../schema";

export type CronSchedule = typeof cronSchedules.$inferSelect;
export type CronScheduleInsert = typeof cronSchedules.$inferInsert;

export async function listCronSchedules(limit = 50) {
  return db
    .select()
    .from(cronSchedules)
    .orderBy(cronSchedules.createdAt)
    .limit(limit);
}

export async function getCronSchedule(id: string) {
  const rows = await db.select().from(cronSchedules).where(eq(cronSchedules.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function createCronSchedule(data: CronScheduleInsert) {
  await db.insert(cronSchedules).values(data);
  return data;
}

export async function updateCronSchedule(id: string, data: Partial<Omit<CronScheduleInsert, "id">>) {
  await db.update(cronSchedules).set({ ...data, updatedAt: new Date() }).where(eq(cronSchedules.id, id));
  return getCronSchedule(id);
}

export async function deleteCronSchedule(id: string) {
  await db.delete(cronSchedules).where(eq(cronSchedules.id, id));
}

export async function listEnabledCronSchedules() {
  return db
    .select()
    .from(cronSchedules)
    .where(eq(cronSchedules.enabled, 1))
    .orderBy(cronSchedules.cronExpression);
}

export async function setLastRunAt(id: string, at: Date) {
  await db.update(cronSchedules).set({ lastRunAt: at, updatedAt: at }).where(eq(cronSchedules.id, id));
}
