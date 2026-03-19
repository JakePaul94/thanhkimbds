import type { Skill, SkillContext } from "../../types/skill";
import { z }    from "zod";
import { v4 as uuid } from "uuid";

const InputSchema = z.object({
  text:     z.string(),
  metadata: z.record(z.unknown()).default({}),
});

type In = z.infer<typeof InputSchema>;

export class MemorySaveSkill implements Skill {
  name        = "memory_save";
  description = "Lưu thông tin vào long-term memory Qdrant";
  inputSchema = InputSchema;

  async execute(input: In, ctx: SkillContext) {
    const id = uuid();
    await ctx.longMemory.upsert(id, { text: input.text, metadata: { ...input.metadata, jobId: ctx.jobId } });
    return { success: true, data: { id } };
  }
}
