import { Queue, Worker }       from "bullmq";
import IORedis                 from "ioredis";
import { WorkflowOrchestrator, type RunOptions } from "../orchestrator/WorkflowOrchestrator";
import { log }                 from "../utils/logger";

const connection = new IORedis(process.env.REDIS_URL!, { maxRetriesPerRequest: null });

export const morningQueue = new Queue("morning-pipeline", { connection });

new Worker("morning-pipeline", async (job) => {
  const orch = new WorkflowOrchestrator();
  await orch.run(job.data.jobId, job.data.resumeFrom, job.data.opts);
}, { connection, concurrency: 1 });

export const jobQueue = {
  async addJob(jobId: string) {
    await morningQueue.add("run", { jobId }, { jobId, attempts: 3, backoff: { type: "exponential", delay: 5000 } });
    log.info({ jobId }, "Job queued");
  },
  async addTestJob(jobId: string, opts?: RunOptions) {
    await morningQueue.add("run", { jobId, opts }, { jobId, attempts: 3 });
    log.info({ jobId, opts }, "Test job queued");
  },
  async addScheduledJob(jobId: string, opts?: RunOptions) {
    await morningQueue.add("run", { jobId, opts }, { jobId, attempts: 3, backoff: { type: "exponential", delay: 5000 } });
    log.info({ jobId, opts }, "Scheduled job queued");
  },
  async resumeJob(jobId: string, resumeFrom: string) {
    await morningQueue.add("run", { jobId, resumeFrom }, { jobId: `${jobId}-${resumeFrom}`, attempts: 3 });
    log.info({ jobId, resumeFrom }, "Job resumed");
  },
};
