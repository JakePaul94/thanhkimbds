import { mkdir } from "fs/promises";
import { appendFileSync } from "fs";

const LOG_DIR = "./logs";

type LogEntry = {
  ts: string;
  jobId: string;
  type: "state" | "step_start" | "step_end" | "api_call" | "error";
  step?: string;
  state?: string;
  input?: unknown;
  output?: unknown;
  prompt?: string;
  api?: string;
  error?: string;
  [k: string]: unknown;
};

function formatEntry(entry: LogEntry): string {
  return JSON.stringify(entry, null, 2) + "\n---\n";
}

export class WorkflowLogger {
  private jobId: string;
  private filePath: string;
  private writeQueue = Promise.resolve();

  constructor(jobId: string) {
    this.jobId = jobId;
    this.filePath = `${LOG_DIR}/workflow-${jobId}.log`;
  }

  async init() {
    await this.append({
      ts: new Date().toISOString(),
      jobId: this.jobId,
      type: "state",
      state: "LOG_INIT",
      message: "Workflow log started",
    });
  }

  private append(entry: LogEntry): Promise<void> {
    const next = this.writeQueue.then(async () => {
      try {
        await mkdir(LOG_DIR, { recursive: true });
        const line = formatEntry(entry);
        appendFileSync(this.filePath, line, "utf8");
      } catch (e) {
        console.error("[WorkflowLogger] write failed:", e);
      }
    });
    this.writeQueue = next;
    return next;
  }

  logState(state: string, extra?: Record<string, unknown>) {
    return this.append({
      ts: new Date().toISOString(),
      jobId: this.jobId,
      type: "state",
      state,
      ...extra,
    });
  }

  logStepStart(step: string, input: unknown) {
    return this.append({
      ts: new Date().toISOString(),
      jobId: this.jobId,
      type: "step_start",
      step,
      input,
    });
  }

  logStepEnd(step: string, output: unknown, error?: string) {
    return this.append({
      ts: new Date().toISOString(),
      jobId: this.jobId,
      type: "step_end",
      step,
      output,
      ...(error && { error }),
    });
  }

  logApiCall(api: string, prompt: string, response: unknown, error?: string) {
    return this.append({
      ts: new Date().toISOString(),
      jobId: this.jobId,
      type: "api_call",
      api,
      prompt: prompt.slice(0, 8000),
      response,
      ...(error && { error }),
    });
  }

  logError(step: string, error: string, details?: unknown) {
    return this.append({
      ts: new Date().toISOString(),
      jobId: this.jobId,
      type: "error",
      step,
      error,
      ...(details && { details }),
    });
  }
}
