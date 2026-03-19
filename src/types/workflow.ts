export type JobState =
  | "PENDING" | "RUNNING" | "AWAITING_HITL"
  | "EDITING" | "APPROVED" | "REJECTED"
  | "PUBLISHING" | "PUBLISHED" | "FAILED";

export interface WorkflowJob {
  id:        string;
  state:     JobState;
  topic?:    string;
  publishAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
