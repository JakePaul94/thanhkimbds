import { schedule as cronSchedule, type ScheduledTask } from "node-cron";
import { v4 as uuid } from "uuid";
import { jobQueue } from "./JobQueue";
import { jobRepo } from "../db/repositories/JobRepository";
import { log } from "../utils/logger";
import { listEnabledCronSchedules, setLastRunAt } from "../db/queries/cronSchedules";
import type { RunOptions } from "../orchestrator/WorkflowOrchestrator";

const TZ = "Asia/Ho_Chi_Minh";
let tasks: ScheduledTask[] = [];

async function loadTasks() {
  const schedules = await listEnabledCronSchedules();
  if (schedules.length === 0) {
    log.info("📅 Scheduler: no cron schedules in DB — add via Expo menu");
    return;
  }
  for (const s of schedules) {
    try {
      const task = cronSchedule(
        s.cronExpression,
        async () => {
          const jobId = `cron-${Date.now()}-${uuid().slice(0, 8)}`;
          log.info({ jobId, scheduleId: s.id, name: s.name }, "⏰ Cron triggered");
          await setLastRunAt(s.id, new Date());
          await jobRepo.create(jobId);
          const opts: RunOptions = {
            skipVideo: s.skipVideo === 1,
            forceCategory: (s.forceCategory as RunOptions["forceCategory"]) ?? undefined,
            forceTopic: s.forceTopic ?? undefined,
            forcePropertyId: s.forcePropertyId ?? undefined,
          };
          await jobQueue.addScheduledJob(jobId, opts);
        },
        { timezone: TZ }
      );
      tasks.push(task);
    } catch (e) {
      log.warn({ scheduleId: s.id, expr: s.cronExpression }, "Invalid cron expression, skipped");
    }
  }
  log.info({ count: tasks.length }, "📅 Scheduler ready — cron schedules loaded");
}

export function schedulerReload() {
  for (const t of tasks) t.stop();
  tasks = [];
  loadTasks().catch((e) => log.error(e, "Scheduler reload failed"));
}

export function schedulerStart() {
  loadTasks().catch((e) => log.error(e, "Scheduler start failed"));
}
