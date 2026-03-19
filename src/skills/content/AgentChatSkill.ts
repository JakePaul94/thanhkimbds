import axios from "axios";
import { GoogleGenAI } from "@google/genai";
import type { Skill, SkillContext } from "../../types/skill";
import { z } from "zod";
import { log } from "../../utils/logger";

const InputSchema = z.object({ message: z.string() });
type In = z.infer<typeof InputSchema>;

/**
 * Chat dành cho human (nội bộ) — khác ChatSkill (khách hàng).
 * Có quyền: lấy tin tức Tavily, search Qdrant, trả lời chi tiết về thị trường BĐS.
 */
export class AgentChatSkill implements Skill {
  name = "agent_chat";
  description = "Trò chuyện với agent nội bộ: tin tức BĐS, thị trường, hỏi đáp";
  inputSchema = InputSchema;

  private client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  async execute(input: In, ctx: SkillContext) {
    const msg = input.message.trim();
    let memoryCtx = "";
    let newsCtx = "";

    try {
      const results = await ctx.longMemory.search(msg, 5);
      memoryCtx = results
        .map((r) => {
          let block = r.payload.text;
          const meta = r.payload.metadata as Record<string, unknown> | undefined;
          if (meta?.type === "property") {
            const urls = meta.imageUrls as string[] | undefined;
            if (urls?.length) block += `\nẢnh: ${urls.join(", ")}`;
          }
          return block;
        })
        .join("\n\n")
        .slice(0, 1200);
    } catch {
      /* bỏ qua */
    }

    const isNewsQuery = /tin tức|tin mới|thị trường|thời sự|mới nhất|hôm nay|xu hướng/i.test(msg);
    if (isNewsQuery && process.env.TAVILY_API_KEY) {
      try {
        const res = await axios.post(
          "https://api.tavily.com/search",
          {
            query: `bất động sản Việt Nam ${msg} ${new Date().toISOString().slice(0, 10)}`,
            max_results: 5,
            topic: "news",
          },
          { timeout: 12000, headers: { Authorization: `Bearer ${process.env.TAVILY_API_KEY}` } }
        );
        const results = res.data?.results ?? [];
        newsCtx = results
          .map((r: any) => `• ${r.title}: ${(r.content ?? "").slice(0, 150)}...`)
          .join("\n")
          .slice(0, 1000);
      } catch (e: any) {
        log.warn({ err: e.message }, "Tavily news fetch failed");
      }
    }

    const systemInstruction = `Bạn là trợ lý nội bộ của Thank Kim BĐS. Đây là cuộc trò chuyện NỘI BỘ giữa em (trợ lý AI) và sếp (supervisor/nhân viên).

QUAN TRỌNG:
- Xưng em, gọi đối phương là sếp. KHÔNG dùng "anh/chị" (đó là cách xưng với khách hàng bên ngoài).
- KHÔNG đưa số điện thoại, Zalo, Facebook, link liên hệ — đây không phải chat với khách.
- Chỉ trả lời câu hỏi về tin tức BĐS, thị trường, xu hướng, công việc. Phong cách: súc tích, gần gũi như đồng nghiệp, có thể trích nguồn tin.`;

    const promptParts = [
      `Nhân viên hỏi: "${msg}"`,
      memoryCtx ? `\nThông tin tham khảo (Qdrant):\n${memoryCtx}` : "",
      newsCtx ? `\nTin tức mới nhất (Tavily):\n${newsCtx}` : "",
    ];
    const prompt = promptParts.join("");

    const response = await this.client.models.generateContent({
      model: "gemini-2.0-flash",
      contents: prompt,
      config: {
        systemInstruction,
        maxOutputTokens: 1024,
      },
    });

    const text = response.text?.trim() ?? "Xin lỗi, em chưa thể trả lời. Vui lòng thử lại.";
    return { success: true, data: { text } };
  }
}
