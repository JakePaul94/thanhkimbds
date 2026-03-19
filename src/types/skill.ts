// ── Skill interface — mỗi capability là 1 skill độc lập ──────
export interface SkillInput {
  [key: string]: unknown;
}

export interface SkillOutput {
  success: boolean;
  data:    unknown;
  error?:  string;
}

export interface Skill<I extends SkillInput = SkillInput, O extends SkillOutput = SkillOutput> {
  name:        string;
  description: string;
  inputSchema: unknown;          // Zod schema
  execute(input: I, ctx: SkillContext): Promise<O>;
}

export interface SkillContext {
  jobId:          string;
  shortMemory:    import("./memory").ShortMemory;
  longMemory:     import("./memory").LongMemory;
  tracer:         unknown;
  workflowLogger?: import("../utils/WorkflowLogger").WorkflowLogger;
}
