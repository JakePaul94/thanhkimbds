import type { Skill, SkillContext } from "../../types/skill";
import { z } from "zod";
import { log } from "../../utils/logger";

const InputSchema = z.object({
  caption:   z.string(),
  videoPath: z.string().optional(),
  imagePath: z.string().optional(),
});

type In = z.infer<typeof InputSchema>;

const GRAPH_API = "https://graph.facebook.com/v21.0";

function resolveMediaUrl(pathOrUrl: string): string {
  const base = process.env.API_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;
  const baseClean = base.replace(/\/$/, "");
  if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")) {
    // Chuyển localhost sang public URL để Facebook fetch được
    if (pathOrUrl.includes("localhost") || pathOrUrl.includes("127.0.0.1")) {
      try {
        const u = new URL(pathOrUrl);
        let path = u.pathname + u.search;
        // /api/properties/uploads/properties/xxx → /uploads/properties/xxx
        path = path.replace(/^\/api\/properties\/uploads\/properties/, "/uploads/properties");
        return `${baseClean}${path}`;
      } catch {
        return pathOrUrl;
      }
    }
    return pathOrUrl;
  }
  const path = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  return `${baseClean}${path}`;
}

export class FacebookPostSkill implements Skill {
  name        = "facebook_post";
  description = "Đăng bài lên Facebook Page qua Graph API (text, ảnh, video)";
  inputSchema = InputSchema;

  async execute(input: In, ctx: SkillContext) {
    const token = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;

    if (!token) {
      throw new Error("FACEBOOK_PAGE_ACCESS_TOKEN phải được cấu hình trong .env");
    }

    const caption = input.caption.trim();
    const imageUrl = input.imagePath ? resolveMediaUrl(input.imagePath) : null;
    const videoUrl = input.videoPath ? resolveMediaUrl(input.videoPath) : null;

    try {
      // Ưu tiên: video > ảnh > text (dùng /me/ — token xác định context)
      if (videoUrl) {
        return await this.postVideo(token, caption, videoUrl, ctx);
      }
      if (imageUrl) {
        return await this.postPhoto(token, caption, imageUrl, ctx);
      }
      return await this.postFeed(token, caption, ctx);
    } catch (err: any) {
      log.error({ jobId: ctx.jobId, err: err.message }, "Facebook post failed");
      return { success: false, data: null, error: err.message };
    }
  }

  private async postFeed(token: string, message: string, ctx: SkillContext) {
    const url = `${GRAPH_API}/me/feed`;
    const params = new URLSearchParams({ access_token: token, message });
    const res = await fetch(`${url}?${params}`, { method: "POST" });
    const data = (await res.json()) as { id?: string; error?: { message: string } };

    if (data.error) {
      throw new Error(data.error.message);
    }
    log.info({ jobId: ctx.jobId, postId: data.id }, "✅ Facebook feed posted");
    return { success: true, data: { platform: "facebook", postId: data.id, type: "feed" } };
  }

  private async postPhoto(token: string, message: string, imageUrl: string, ctx: SkillContext) {
    const url = `${GRAPH_API}/me/photos`;
    const params = new URLSearchParams({
      access_token: token,
      url: imageUrl,
      message,
    });
    const res = await fetch(`${url}?${params}`, { method: "POST" });
    const data = (await res.json()) as { id?: string; post_id?: string; error?: { message: string } };

    if (data.error) {
      throw new Error(data.error.message);
    }
    log.info({ jobId: ctx.jobId, photoId: data.id, postId: data.post_id }, "✅ Facebook photo posted");
    return { success: true, data: { platform: "facebook", postId: data.post_id ?? data.id, type: "photo" } };
  }

  private async postVideo(token: string, description: string, videoUrl: string, ctx: SkillContext) {
    const url = `${GRAPH_API}/me/videos`;
    const params = new URLSearchParams({
      access_token: token,
      file_url: videoUrl,
      description,
    });
    const res = await fetch(`${url}?${params}`, { method: "POST" });
    const data = (await res.json()) as { id?: string; error?: { message: string } };

    if (data.error) {
      throw new Error(data.error.message);
    }
    log.info({ jobId: ctx.jobId, videoId: data.id }, "✅ Facebook video posted");
    return { success: true, data: { platform: "facebook", postId: data.id, type: "video" } };
  }
}
