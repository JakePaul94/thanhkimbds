import { GoogleGenAI, Modality } from "@google/genai";
import type { Skill, SkillContext } from "../../types/skill";
import { z } from "zod";
import { join } from "path";
import { writeFile, mkdir } from "fs/promises";
import { v4 as uuid } from "uuid";
import { log } from "../../utils/logger";

const InputSchema = z.object({
  prompt:  z.string(),
  variant: z.enum(["thumbnail", "cover_fb", "cover_zalo"]).default("thumbnail"),
});

type In = z.infer<typeof InputSchema>;

const PROJECT_ROOT = process.cwd();
const IMAGE_MODEL = process.env.IMAGE_GEN_MODEL ?? "gemini-2.5-flash-image";

export class ImageGenSkill implements Skill {
  name        = "image_gen";
  description = "Tạo ảnh thumbnail/cover bằng Gemini (gemini-2.5-flash-image)";
  inputSchema = InputSchema;

  private client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  async execute(input: In, ctx: SkillContext) {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error("Missing GEMINI_API_KEY for image generation");
    }

    const response = await this.client.models.generateContent({
      model: IMAGE_MODEL,
      contents: input.prompt,
      config: {
        responseModalities: [Modality.IMAGE],
        imageConfig: { aspectRatio: "16:9" },
      },
    });

    const imagePart = response.candidates?.[0]?.content?.parts?.find(
      (p): p is typeof p & { inlineData: { data: string; mimeType?: string } } =>
        !!p.inlineData?.data
    );

    if (!imagePart?.inlineData?.data) {
      const feedback = response.promptFeedback;
      const blockReason = feedback?.blockReason ?? "NO_IMAGE";
      throw new Error(
        `Image generation failed: ${blockReason}. ` +
        (feedback?.blockReasonMessage ? `Details: ${feedback.blockReasonMessage}` : "")
      );
    }

    const base64 = imagePart.inlineData.data;
    const mimeType = imagePart.inlineData.mimeType ?? "image/png";
    const ext = mimeType === "image/jpeg" || mimeType === "image/jpg" ? "jpg" : "png";

    const base = process.env.API_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;
    const uploadDir = join(PROJECT_ROOT, "uploads", "properties");
    await mkdir(uploadDir, { recursive: true });

    const filename = `${Date.now()}-${uuid().slice(0, 8)}.${ext}`;
    const destPath = join(uploadDir, filename);
    const buffer = Buffer.from(base64, "base64");
    await writeFile(destPath, buffer);

    const publicUrl = `${base.replace(/\/$/, "")}/uploads/properties/${filename}`;
    log.info({ publicUrl, variant: input.variant }, "Image saved to uploads/properties");

    await ctx.shortMemory.setJob(ctx.jobId, {
      imageUrls: { [input.variant]: publicUrl },
    });

    return { success: true, data: { url: publicUrl, variant: input.variant } };
  }
}
