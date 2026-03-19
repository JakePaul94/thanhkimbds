/**
 * Trigger pipeline thủ công
 * Chạy: bun run scripts/trigger-manual.ts
 */
import { jobQueue } from "../src/queue/JobQueue";
import { jobRepo }  from "../src/db/repositories/JobRepository";
import { v4 as uuid } from "uuid";

const jobId = `manual-${Date.now()}-${uuid().slice(0, 8)}`;
await jobRepo.create(jobId);
await jobQueue.addJob(jobId);
console.log(`✅ Job triggered: ${jobId}`);
process.exit(0);
