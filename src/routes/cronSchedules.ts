import { Hono } from "hono";
import { v4 as uuid } from "uuid";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import * as cronQueries from "../db/queries/cronSchedules";
import { schedulerReload } from "../queue/Scheduler";

const createSchema = z.object({
  name: z.string().min(1),
  cronExpression: z.string().min(1), // e.g. "0 6 * * *"
  enabled: z.union([z.literal(0), z.literal(1)]).optional().default(1),
  forceCategory: z.enum(["tin_tuc", "san_pham", "kinh_nghiem"]).optional().nullable(),
  forceTopic: z.string().optional().nullable(),
  skipVideo: z.union([z.literal(0), z.literal(1)]).optional().default(1),
  forcePropertyId: z.string().optional().nullable(),
});

const updateSchema = createSchema.partial();

export const cronSchedulesRouter = new Hono();

cronSchedulesRouter.get("/", async (c) => {
  const list = await cronQueries.listCronSchedules(Number(c.req.query("limit") ?? 50));
  return c.json(list);
});

cronSchedulesRouter.get("/:id", async (c) => {
  const row = await cronQueries.getCronSchedule(c.req.param("id"));
  return row ? c.json(row) : c.json({ error: "Not found" }, 404);
});

cronSchedulesRouter.post("/", zValidator("json", createSchema), async (c) => {
  const body = c.req.valid("json");
  const id = `cron-${Date.now()}-${uuid().slice(0, 8)}`;
  await cronQueries.createCronSchedule({
    id,
    name: body.name,
    cronExpression: body.cronExpression,
    enabled: body.enabled,
    forceCategory: body.forceCategory ?? null,
    forceTopic: body.forceTopic ?? null,
    skipVideo: body.skipVideo,
    forcePropertyId: body.forcePropertyId ?? null,
  });
  schedulerReload();
  return c.json({ id, ...body });
});

cronSchedulesRouter.put("/:id", zValidator("json", updateSchema), async (c) => {
  const id = c.req.param("id");
  const body = c.req.valid("json");
  const updated = await cronQueries.updateCronSchedule(id, body);
  if (!updated) return c.json({ error: "Not found" }, 404);
  schedulerReload();
  return c.json(updated);
});

cronSchedulesRouter.delete("/:id", async (c) => {
  const id = c.req.param("id");
  await cronQueries.deleteCronSchedule(id);
  schedulerReload();
  return c.json({ ok: true });
});

cronSchedulesRouter.post("/reload", async (c) => {
  schedulerReload();
  return c.json({ ok: true });
});

/** Chạy ngay lịch (test) — không đợi cron */
cronSchedulesRouter.post("/:id/run-now", async (c) => {
  const id = c.req.param("id");
  const row = await cronQueries.getCronSchedule(id);
  if (!row) return c.json({ error: "Not found" }, 404);
  const { jobQueue } = await import("../queue/JobQueue");
  const { jobRepo } = await import("../db/repositories/JobRepository");
  const { v4: uuid } = await import("uuid");
  const jobId = `cron-${Date.now()}-${uuid().slice(0, 8)}`;
  await cronQueries.setLastRunAt(id, new Date());
  await jobRepo.create(jobId);
  const opts = {
    skipVideo: row.skipVideo === 1,
    forceCategory: (row.forceCategory as "tin_tuc" | "san_pham" | "kinh_nghiem") ?? undefined,
    forceTopic: row.forceTopic ?? undefined,
    forcePropertyId: row.forcePropertyId ?? undefined,
  };
  await jobQueue.addScheduledJob(jobId, opts);
  return c.json({ ok: true, jobId });
});
