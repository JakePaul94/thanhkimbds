// Shared types — copy sang Expo app
export type ClientMessage =
  | { type: "ping" }
  | { type: "list_skills" }
  | { type: "run_skill"; skillName: string; input: Record<string, unknown>; jobId: string }
  | { type: "job_status"; jobId: string }
  | { type: "approve"; jobId: string }
  | { type: "reject";  jobId: string; reason: string };

export type ServerMessage =
  | { type: "pong"; ts: number }
  | { type: "skills"; data: { name: string; description: string }[] }
  | { type: "skill_result"; skillName: string; result: unknown }
  | { type: "job_status"; data: unknown }
  | { type: "approved"; jobId: string }
  | { type: "rejected"; jobId: string }
  | { type: "pipeline_update"; jobId: string; state: string; step?: string }
  | { type: "error"; message: string };
