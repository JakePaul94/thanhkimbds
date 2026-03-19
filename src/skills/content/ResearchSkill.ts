import axios from "axios";
import type { Skill, SkillContext } from "../../types/skill";
import { z } from "zod";
import { log } from "../../utils/logger";

const InputSchema = z.object({
  date: z.string().optional(),
  topic: z.string().optional(),
  skip: z.boolean().optional(), // true khi viết bài từ BĐS (không cần tin tức)
});

const OutputSchema = z.object({
  success: z.boolean(),
  data: z.object({
    topics: z.array(z.string()),
    newsSnippets: z.array(z.string()),
  }),
  error: z.string().optional(),
});

type In = z.infer<typeof InputSchema>;
type Out = z.infer<typeof OutputSchema>;

export class ResearchSkill implements Skill<In, Out> {
  name = "research";
  description = "Tìm tin tức & xu hướng thị trường Bất động sản qua Tavily";
  inputSchema = InputSchema;

  async execute(input: In, ctx: SkillContext): Promise<Out> {
    if (input.skip) {
      await ctx.shortMemory.setJob(ctx.jobId, { researchTopics: [], researchNews: [] });
      return { success: true, data: { topics: [], newsSnippets: [] } };
    }
    const job = await ctx.shortMemory.getJob(ctx.jobId);
    const topic = input.topic ?? job?.topic ?? "thị trường bất động sản";
    const apiKey = process.env.TAVILY_API_KEY;

    if (!apiKey) {
      await ctx.shortMemory.setJob(ctx.jobId, { researchTopics: [], researchNews: [] });
      return { success: true, data: { topics: [], newsSnippets: [] } };
    }

    const query = `bất động sản Việt Nam ${topic} ${input.date ?? new Date().toISOString().slice(0, 10)}`;
    try {
      await ctx.workflowLogger?.logStepStart("research", { query, topic });
      const res = await axios.post(
        "https://api.tavily.com/search",
        { query, max_results: 5, topic: "news" },
        { timeout: 15000, headers: { Authorization: `Bearer ${apiKey}` } }
      );

      const results = res.data?.results ?? [];
      await ctx.workflowLogger?.logApiCall("tavily", query, { resultsCount: results.length, topics: results.map((r: any) => r.title) });
      const topics = results.map((r: any) => r.title).slice(0, 3);
      const newsSnippets = results
        .map((r: any) => r.content?.slice(0, 200) ?? r.title)
        .slice(0, 3);

      await ctx.shortMemory.setJob(ctx.jobId, {
        researchTopics: topics,
        researchNews: newsSnippets,
      });

      await ctx.longMemory.upsert(`research-${ctx.jobId}`, {
        text: `BĐS research: ${topics.join("; ")}`,
        metadata: { jobId: ctx.jobId, date: input.date, topics },
      });

      return { success: true, data: { topics, newsSnippets } };
    } catch (err: any) {
      await ctx.workflowLogger?.logApiCall("tavily", query, {}, err.message);
      log.warn({ jobId: ctx.jobId, err: err.message }, "Tavily research failed, continuing with empty");
      await ctx.shortMemory.setJob(ctx.jobId, { researchTopics: [], researchNews: [] });
      return { success: true, data: { topics: [], newsSnippets: [] } };
    }
  }
}
