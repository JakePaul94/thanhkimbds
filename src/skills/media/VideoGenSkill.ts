import axios from "axios";
import type { Skill, SkillContext } from "../../types/skill";
import { z } from "zod";
import { log } from "../../utils/logger";

const InputSchema = z.object({
  prompt:       z.string(),
  duration:     z.union([z.literal(5), z.literal(10)]).default(5),
  aspect_ratio: z.enum(["16:9", "9:16", "1:1"]).default("9:16"),
});

type In = z.infer<typeof InputSchema>;

export class VideoGenSkill implements Skill {
  name        = "video_gen";
  description = "Tạo video ngắn bằng Kling AI (fallback: Runway)";
  inputSchema = InputSchema;

  async execute(input: In, ctx: SkillContext) {
    try {
      return await this.kling(input, ctx);
    } catch (err) {
      log.warn("Kling failed → fallback Runway");
      return await this.runway(input, ctx);
    }
  }

  private async kling(input: In, ctx: SkillContext) {
    const res = await axios.post(
      "https://api.klingai.com/v1/videos/text2video",
      { prompt: input.prompt, duration: input.duration, aspect_ratio: input.aspect_ratio, mode: "std" },
      { headers: { Authorization: `Bearer ${process.env.KLING_API_KEY}` } }
    );
    const taskId = res.data.data.task_id;
    const url    = await this.pollKling(taskId);
    await ctx.shortMemory.setJob(ctx.jobId, { videoUrl: url });
    return { success: true, data: { url, provider: "kling" } };
  }

  private async pollKling(taskId: string, maxTries = 36): Promise<string> {
    for (let i = 0; i < maxTries; i++) {
      await new Promise((r) => setTimeout(r, 10_000));
      const res = await axios.get(
        `https://api.klingai.com/v1/videos/text2video/${taskId}`,
        { headers: { Authorization: `Bearer ${process.env.KLING_API_KEY}` } }
      );
      const { task_status, task_result } = res.data.data;
      if (task_status === "succeed") return task_result.videos[0].url;
      if (task_status === "failed")  throw new Error("Kling task failed");
    }
    throw new Error("Kling poll timeout");
  }

  private async runway(input: In, ctx: SkillContext) {
    // Runway Gen-3 Alpha Turbo
    const res = await axios.post(
      "https://api.dev.runwayml.com/v1/image_to_video",
      { promptText: input.prompt, ratio: input.aspect_ratio, duration: input.duration },
      { headers: { Authorization: `Bearer ${process.env.RUNWAY_API_KEY}`, "X-Runway-Version": "2024-11-06" } }
    );
    const url = res.data.output[0];
    await ctx.shortMemory.setJob(ctx.jobId, { videoUrl: url });
    return { success: true, data: { url, provider: "runway" } };
  }
}
