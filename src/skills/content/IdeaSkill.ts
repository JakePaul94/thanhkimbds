import { GoogleGenAI } from "@google/genai";
import type { Skill, SkillContext } from "../../types/skill";
import { z } from "zod";
import { jobRepo } from "../../db/repositories/JobRepository";

const InputSchema = z.object({
  date: z.string().optional(),
  forceCategory: z.enum(["tin_tuc", "san_pham", "kinh_nghiem"]).optional(),
  forceTopic: z.string().optional(),
  forceProperty: z.object({
    id: z.string(),
    title: z.string(),
    price: z.string().optional().nullable(),
    area: z.string().optional().nullable(),
    address: z.string().optional().nullable(),
    district: z.string().optional().nullable(),
    description: z.string().optional().nullable(),
    contactPhone: z.string().optional().nullable(),
    imageUrls: z.array(z.string()).optional().nullable(),
    videoUrl: z.string().optional().nullable(),
  }).optional(),
});

const OutputSchema = z.object({
  success: z.boolean(),
  data: z.object({
    category: z.enum(["tin_tuc", "san_pham", "kinh_nghiem"]),
    topic: z.string(),
    hook: z.string(),
    hashtags: z.array(z.string()),
  }),
  error: z.string().optional(),
});

type In = z.infer<typeof InputSchema>;
type Out = z.infer<typeof OutputSchema>;

const CATEGORIES = ["tin_tuc", "san_pham", "kinh_nghiem"] as const;

export class IdeaSkill implements Skill<In, Out> {
  name = "idea";
  description = "Brainstorm ý tưởng bài post Bất động sản: tin tức, giới thiệu sản phẩm, kinh nghiệm";
  inputSchema = InputSchema;

  private client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  async execute(input: In, ctx: SkillContext): Promise<Out> {
    try {
      if (input.forceProperty) {
        const p = input.forceProperty;
        const topic = p.title;
        const hook = [p.description, p.address, p.price].filter(Boolean).join(". ").slice(0, 300);
        const hashtags = ["#batdongsan", "#nhadat", "#muanha", "#dautu"];
        if (p.district) hashtags.push(`#${p.district.replace(/\s+/g, "")}`);
        await ctx.shortMemory.setJob(ctx.jobId, {
          topic,
          hook,
          hashtags,
          ideaCategory: "san_pham",
        });
        return { success: true, data: { category: "san_pham", topic, hook, hashtags } };
      } else {
        const dayOfYear = Math.floor(
          (new Date(input.date ?? Date.now()).getTime() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000
        );
        const category = input.forceCategory ?? CATEGORIES[dayOfYear % CATEGORIES.length];

        // Khi có forceTopic: gọi LLM sinh topic (tiêu đề) và hook (câu mở đầu) — không copy nguyên forceTopic
        if (input.forceTopic?.trim()) {
          const forceTopic = input.forceTopic.trim();
          const hashtags = ["#batdongsan", "#nhadat", "#dautu", "#muanha", "#kinhnghiemmuanha"];
          let topic = forceTopic;
          let hook = forceTopic;
          try {
            const res = await this.client.models.generateContent({
              model: "gemini-2.0-flash",
              contents: `Chủ đề gợi ý bài post BĐS: "${forceTopic}". Tạo 2 thứ:
1. topic: tiêu đề ngắn gọn, hấp dẫn (không copy nguyên chủ đề gợi ý)
2. hook: câu mở đầu thu hút, dạng phân tích/nhận định — KHÔNG phải câu hỏi

Trả về JSON: {"topic":"...","hook":"..."}`,
              config: { maxOutputTokens: 256 },
            });
            const raw = res.text?.trim() ?? "";
            const jsonStr = raw.replace(/^```(?:json)?\s*\n?|\n?```\s*$/g, "").trim();
            const parsed = JSON.parse(jsonStr);
            if (parsed?.topic?.trim()) topic = String(parsed.topic).trim();
            if (parsed?.hook?.trim()) hook = String(parsed.hook).trim();
          } catch {
            /* fallback: topic = hook = forceTopic */
          }
          await ctx.shortMemory.setJob(ctx.jobId, {
            topic,
            hook,
            hashtags,
            ideaCategory: category,
          });
          return { success: true, data: { category, topic, hook, hashtags } };
        }

        const categoryLabel =
          category === "tin_tuc"
            ? "tin tức thị trường BĐS"
            : category === "san_pham"
              ? "giới thiệu sản phẩm/dự án BĐS"
              : "kinh nghiệm mua bán, đầu tư , pháp lý ... về Bất động sản nhà ở, đất ở, căn hộ, biệt thự, nhà phố,...";

        const recentTopics = await jobRepo.getRecentTopics(15);
        const recentTopicsBlock = recentTopics.length > 0
          ? `\n\nCÁC CHỦ ĐỀ ĐÃ ĐĂNG GẦN ĐÂY (tránh trùng):\n${recentTopics.map((t, i) => `${i + 1}. ${t}`).join("\n")}`
          : "";

        const prompt = `Tạo 1 ý tưởng bài post BĐS thể loại "${categoryLabel}" cho ngày ${input.date ?? new Date().toISOString().slice(0, 10)}.
Yêu cầu: nội dung thực tế, phù hợp thị trường VN, cập nhật tin mới nhất. KHÔNG trùng với các chủ đề đã đăng gần đây.${recentTopicsBlock}`;
        const systemInstruction = `Bạn là chuyên gia content marketing Bất động sản Việt Nam.
Nhiệm vụ: Tạo ý tưởng bài post hấp dẫn cho mạng xã hội.
Thể loại hôm nay: ${categoryLabel}.
Tránh trùng lặp với các chủ đề đã đăng gần đây (nếu có liệt kê).
Trả về JSON hợp lệ (không markdown), format:
{"category":"${category}","topic":"Tiêu đề ngắn gọn","hook":"Câu mở đầu thu hút (1-2 câu)","hashtags":["#hashtag1","#hashtag2",...]}
Hashtags nên có: #batdongsan #nhadat #thanhkim #thanhkimbds #dautu #muanha (và thêm 2-3 hashtag liên quan)`;

        const response = await this.client.models.generateContent({
          model: "gemini-2.0-flash",
          contents: prompt,
          config: {
            systemInstruction,
            maxOutputTokens: 1024,
          },
        });

        const raw = response.text?.trim() ?? "";
        const jsonStr = raw.replace(/^```(?:json)?\s*\n?|\n?```\s*$/g, "").trim();
        const parsed = JSON.parse(jsonStr);
        await ctx.workflowLogger?.logApiCall("gemini-idea", `${prompt}\n\n[systemInstruction]\n${systemInstruction}`, { raw, parsed });

        const data = {
          category: parsed.category ?? category,
          topic: parsed.topic ?? "Bất động sản hôm nay",
          hook: parsed.hook ?? parsed.topic,
          hashtags: Array.isArray(parsed.hashtags)
            ? parsed.hashtags
            : ["#batdongsan", "#nhadat", "#dautu", "#muanha"],
        };

        await ctx.shortMemory.setJob(ctx.jobId, {
          topic: data.topic,
          hook: data.hook,
          hashtags: data.hashtags,
          ideaCategory: data.category,
        });

        return { success: true, data };
      }
    } catch (err: any) {
      await ctx.workflowLogger?.logError("idea", err.message, err);
      return {
        success: false,
        data: {
          category: "kinh_nghiem",
          topic: "5 điều cần biết khi mua nhà lần đầu",
          hook: "Mua nhà lần đầu không khó nếu bạn nắm rõ những điều sau.",
          hashtags: ["#batdongsan", "#nhadat", "#muanha", "#kinhnghiem"],
        },
        error: err.message,
      };
    }
  }
}
