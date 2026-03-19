import { GoogleGenAI } from "@google/genai";
import type { Skill, SkillContext } from "../../types/skill";
import { z } from "zod";
import { log } from "../../utils/logger";

/** Parse JSON từ Gemini — xử lý markdown, truncate, unescaped quotes */
function parseWriterJson(raw: string): { facebook: string; zalo: string } {
  let jsonStr = raw.replace(/^```(?:json)?\s*\n?|\n?```\s*$/g, "").trim();
  try {
    const parsed = JSON.parse(jsonStr);
    if (parsed?.facebook) return { facebook: String(parsed.facebook), zalo: String(parsed.zalo ?? parsed.facebook) };
  } catch {
    /* fallback */
  }
  // Thử extract JSON block (từ { đầu đến } cuối)
  const start = jsonStr.indexOf("{");
  const end = jsonStr.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      const block = jsonStr.slice(start, end + 1);
      const parsed = JSON.parse(block);
      if (parsed?.facebook) return { facebook: String(parsed.facebook), zalo: String(parsed.zalo ?? parsed.facebook) };
    } catch {
      /* fallback */
    }
  }
  // Regex extract "facebook":"..." "zalo":"..."
  const fbMatch = jsonStr.match(/"facebook"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  const zaloMatch = jsonStr.match(/"zalo"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (fbMatch) {
    const facebook = fbMatch[1].replace(/\\"/g, '"').replace(/\\n/g, "\n");
    const zalo = zaloMatch ? zaloMatch[1].replace(/\\"/g, '"').replace(/\\n/g, "\n") : facebook;
    return { facebook, zalo };
  }
  // Truncated (thiếu })? Thử đóng
  if (!jsonStr.endsWith("}") && jsonStr.includes('"zalo"')) {
    try {
      const closed = jsonStr + '"}';
      const parsed = JSON.parse(closed);
      if (parsed?.facebook) return { facebook: String(parsed.facebook), zalo: String(parsed.zalo ?? parsed.facebook) };
    } catch {
      /* noop */
    }
  }
  return { facebook: raw.trim().slice(0, 2000), zalo: raw.trim().slice(0, 500) };
}

const InputSchema = z.object({
  hook:     z.string(),
  hashtags: z.array(z.string()),
  tone:     z.enum(["professional", "casual", "inspirational"]).default("casual"),
  property: z.object({
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
  }).optional().nullable(),
});

type In = z.infer<typeof InputSchema>;

export class WriterSkill implements Skill {
  name        = "writer";
  description = "Sinh caption đa kênh (Facebook + Zalo) bằng Gemini";
  inputSchema = InputSchema;

  private client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  async execute(input: In, ctx: SkillContext) {
    const job = await ctx.shortMemory.getJob(ctx.jobId);
    const hook = String(input.hook ?? "").slice(0, 500);
    const p = input.property;

    if (p) {
      const propCtx = `BĐS cần viết bài:
- Tiêu đề: ${p.title}
- Giá: ${p.price ?? "Thương lượng"}
- Diện tích: ${p.area ?? "—"}
- Địa chỉ: ${p.address ?? "—"}
- Quận: ${p.district ?? "—"}
- Mô tả: ${p.description ?? ""}
- Liên hệ: ${p.contactPhone ?? ""}`;

      const formatExample = `Ví dụ format bài đăng BĐS:
*Dòng tiêu đề:* NHỈNH 9 TOI- 4 TẦNG LÔ GÓC-5 PHÒNG-FULL NỘI THẤT-HỒNG MAI-BẠCH MAI-HAI BÀ TRƯNG-HN (Thương lượng mạnh)-0985826871
*Nội dung:* Các bullet (-) mô tả vị trí, tiện ích, thiết kế từng tầng. Cuối bài có SĐT liên hệ.
*Hashtags:* ${input.hashtags.join(" ")}`;

      const prompt = `Viết bài đăng BĐS cho Facebook và Zalo dựa trên thông tin sau. Format giống ví dụ: dòng tiêu đề ngắn gọn (đặc điểm-địa điểm-giá-SĐT), sau đó bullet mô tả chi tiết.

${propCtx}

${formatExample}

Trả về đúng JSON (không markdown). Nếu nội dung có dấu ngoặc kép thì escape bằng \\":
{"facebook":"toàn bộ caption facebook (tiêu đề + nội dung + SĐT + hashtags)...","zalo":"caption zalo ngắn gọn hơn..."}`.slice(0, 8000);

      log.info({ jobId: ctx.jobId, promptLen: prompt.length }, "Calling Gemini (property format)...");
      await ctx.workflowLogger?.logStepStart("writer", { promptLen: prompt.length, mode: "property" });
      let response;
      try {
        response = await this.client.models.generateContent({
          model: "gemini-2.0-flash",
          contents: prompt,
          config: { maxOutputTokens: 2048 },
        });
      } catch (err: any) {
        await ctx.workflowLogger?.logApiCall("gemini-writer", prompt, {}, err.message);
        log.error({ jobId: ctx.jobId, err: err.message }, "Gemini property writer failed");
        throw err;
      }
      const raw = response.text?.trim() ?? "";
      await ctx.workflowLogger?.logApiCall("gemini-writer", prompt, { raw });
      const parsed = parseWriterJson(raw);
      await ctx.shortMemory.setJob(ctx.jobId, { caption: parsed });
      try {
        await ctx.longMemory.upsert(`caption-${ctx.jobId}`, {
          text: `Caption: ${parsed.facebook}`,
          metadata: { jobId: ctx.jobId, type: "caption", propertyId: p.id },
        });
      } catch {}
      return { success: true, data: parsed };
    }

    let pastCtx = "";
    let researchCtx = "";
    try {
      const pastPosts = await ctx.longMemory.search("caption bất động sản facebook zalo", 3);
      pastCtx = pastPosts.map((p) => p.payload.text).join("\n").slice(0, 500);
    } catch (e) {
      log.warn({ jobId: ctx.jobId }, "Memory search skipped");
    }
    if (job?.researchNews?.length) {
      researchCtx = `\nTin tham khảo:\n${job.researchNews.join("\n").slice(0, 600)}`;
    }

    const topic = String(job?.topic ?? "");
    const listInstruction = (hook + " " + topic).match(/\d+\s*(lỗi|sai lầm|bước|điểm)/i)
      ? "\nQUAN TRỌNG: Chủ đề đề cập số lỗi/sai lầm — BẮT BUỘC liệt kê rõ từng mục cụ thể trong nội dung (1. ..., 2. ..., 3. ...). Không chỉ nói chung chung."
      : "";

    const prompt = `Viết caption BĐS cho Facebook và Zalo.
Chủ đề gợi ý: ${hook}. Hashtags: ${input.hashtags.join(" ")}. Tone: ${input.tone}.
YÊU CẦU: Viết dạng PHÂN TÍCH — đưa ra nhận định, xu hướng, insight cụ thể. KHÔNG viết toàn câu hỏi. Viết lại chủ đề theo phong cách riêng, hấp dẫn — không copy nguyên văn chủ đề vào cuối bài.${listInstruction}${pastCtx ? `\nTham khảo bài cũ:\n${pastCtx}` : ""}${researchCtx}

Trả về đúng JSON (không markdown). Nếu nội dung có dấu ngoặc kép thì escape bằng \\":
{"facebook":"caption facebook...","zalo":"caption zalo..."}`.slice(0, 6000);

    log.info({ jobId: ctx.jobId, promptLen: prompt.length }, "Calling Gemini...");
    await ctx.workflowLogger?.logStepStart("writer", { promptLen: prompt.length });
    let response;
    try {
      response = await this.client.models.generateContent({
        model: "gemini-2.0-flash",
        contents: prompt,
        config: { maxOutputTokens: 2048 },
      });
    } catch (err: any) {
      const details = err?.cause || err?.response?.data || err?.status;
      await ctx.workflowLogger?.logApiCall("gemini-writer", prompt, {}, err.message);
      log.error({ jobId: ctx.jobId, err: err.message, details }, "Gemini generateContent failed");
      throw err;
    }

    const raw = response.text?.trim() ?? "";
    await ctx.workflowLogger?.logApiCall("gemini-writer", prompt, { raw });
    const parsed = parseWriterJson(raw);
    await ctx.shortMemory.setJob(ctx.jobId, { caption: parsed });
    try {
      await ctx.longMemory.upsert(`caption-${ctx.jobId}`, {
        text:     `Caption: ${parsed.facebook}`,
        metadata: { jobId: ctx.jobId, type: "caption" },
      });
    } catch {
      /* Qdrant upsert fail → bỏ qua */
    }

    return { success: true, data: parsed };
  }
}
