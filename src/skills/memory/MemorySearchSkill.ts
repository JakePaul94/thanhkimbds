import type { Skill, SkillContext } from "../../types/skill";
import { z } from "zod";

const InputSchema = z.object({
  query: z.string(),
  topK:  z.number().default(5),
});

type In = z.infer<typeof InputSchema>;

export class MemorySearchSkill implements Skill {
  name        = "memory_search";
  description = "Tìm kiếm long-term memory trong Qdrant";
  inputSchema = InputSchema;

  async execute(input: In, ctx: SkillContext) {
    const results = await ctx.longMemory.search(input.query, input.topK);
    return { success: true, data: results };
  }
}
