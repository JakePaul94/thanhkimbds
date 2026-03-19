import { GoogleGenAI } from "@google/genai";
import type { Skill, SkillContext } from "../../types/skill";
import { z } from "zod";

const InputSchema = z.object({ message: z.string() });
type In = z.infer<typeof InputSchema>;

export class ChatSkill implements Skill {
  name = "chat";
  description = "Trả lời câu hỏi về Bất động sản bằng Gemini + memory";
  inputSchema = InputSchema;

  private client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  async execute(input: In, ctx: SkillContext) {
    let memoryCtx = "";
    try {
      const results = await ctx.longMemory.search(input.message, 5);
      memoryCtx = results
        .map((r) => {
          let block = r.payload.text;
          const meta = r.payload.metadata as Record<string, unknown> | undefined;
          if (meta?.type === "property") {
            const urls = meta.imageUrls as string[] | undefined;
            const video = meta.videoUrl as string | undefined;
            if (urls?.length) block += `\nẢnh: ${urls.join(", ")}`;
            if (video) block += `\nVideo: ${video}`;
          }
          return block;
        })
        .join("\n\n")
        .slice(0, 1500);
    } catch {
      /* bỏ qua */
    }

    const prompt = `Bạn là trợ lý tư vấn Bất động sản của Thank Kim Bất động sản.
Số điện thoại/Zalo: 0985826871. Facebook: https://www.facebook.com/thanh.kim.169

${memoryCtx ? `Thông tin tham khảo:\n${memoryCtx}\n\n` : ""}

Khách hỏi: "${input.message}"

Trả lời ngắn gọn, thân thiện, chuyên nghiệp. Nếu có link ảnh/video trong thông tin tham khảo, có thể gợi ý khách xem. Nếu cần tư vấn chi tiết, gợi ý liên hệ 0985826871.`;

    const response = await this.client.models.generateContent({
      model: "gemini-2.0-flash",
      contents: prompt,
      config: { maxOutputTokens: 512 },
    });

    const text = response.text?.trim() ?? "Xin lỗi, tôi chưa thể trả lời. Vui lòng liên hệ 0985826871 để được tư vấn.";
    return { success: true, data: { text } };
  }
}
