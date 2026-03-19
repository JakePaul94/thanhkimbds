/**
 * LLM-based intent classification — thay thế regex hardcode.
 * Agent hiểu nhiều cách diễn đạt: "viết bài về căn X", "đăng bài kinh nghiệm", "thống kê chi phí"...
 */
import { GoogleGenAI } from "@google/genai";
import type { IntentResult, SupervisorIntent } from "./types";
import { log } from "../utils/logger";

const INTENT_PROMPT = `Bạn là classifier intent cho app Bất động sản. Phân loại tin nhắn thành 1 trong các intent sau:

- write_post_product: Viết/đăng bài GIỚI THIỆU sản phẩm BĐS cụ thể (căn, nhà, đất ở địa điểm nào đó). VD: "viết bài về căn Trương Định", "đăng bài căn Bạch Mai 2 tỷ"
- write_post_experience: Viết bài KINH NGHIỆM, triết lý, chia sẻ. VD: "viết bài kinh nghiệm mua nhà", "bài về sai lầm khi giao dịch BĐS"
- write_post_news: Viết bài TIN TỨC thị trường. VD: "tin tức BĐS", "viết bài về thị trường"
- write_post_news_video: Giống write_post_news nhưng CÓ VIDEO
- track_posts: Theo dõi bài đăng, xem bài đã đăng
- analyze_engagement: Phân tích tương tác, lượt like/share
- cost_stats: Thống kê chi phí, chi tiêu
- list_properties: Xem danh sách BĐS, căn đang có
- chat: Hỏi đáp thông thường (tin tức, thị trường, không phải yêu cầu hành động cụ thể)

Trả lời CHÍNH XÁC 1 dòng JSON: {"intent":"...", "extractedTopic":"...", "skipVideo": true/false}
- extractedTopic: chủ đề nội dung bài viết (vd: "căn Trương Định", "kinh nghiệm mua nhà", "tin tức thị trường"). Để RỖNG nếu user chỉ nói đăng lên đâu (facebook, web, zalo) mà không nói chủ đề cụ thể — khi đó LLM sẽ tự sinh ý tưởng.
- skipVideo: true nếu KHÔNG yêu cầu video, false nếu có (tạo video). Mặc định true.`;

export class IntentRouter {
  private client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  async classify(message: string): Promise<IntentResult> {
    const m = message.trim();
    if (!m) return { intent: "chat" };

    if (!process.env.GEMINI_API_KEY) {
      return this.fallbackClassify(m);
    }

    try {
      const res = await this.client.models.generateContent({
        model: "gemini-2.0-flash",
        contents: `${INTENT_PROMPT}\n\nTin nhắn: "${m}"`,
        config: { maxOutputTokens: 128 },
      });

      const text = res.text?.trim();
      if (!text) return this.fallbackClassify(m);

      const jsonMatch = text.match(/\{[\s\S]*\}/);
      const parsed = jsonMatch ? (JSON.parse(jsonMatch[0]) as { intent?: string; extractedTopic?: string; skipVideo?: boolean }) : {};
      const intent = this.normalizeIntent(parsed.intent);
      return {
        intent,
        extractedTopic: typeof parsed.extractedTopic === "string" ? parsed.extractedTopic.trim() : undefined,
        skipVideo: parsed.skipVideo !== false,
      };
    } catch (e: any) {
      log.warn({ err: e.message }, "IntentRouter LLM failed, using fallback");
      return this.fallbackClassify(m);
    }
  }

  private normalizeIntent(raw?: string): SupervisorIntent {
    const valid: SupervisorIntent[] = [
      "write_post_product", "write_post_experience", "write_post_news", "write_post_news_video",
      "track_posts", "analyze_engagement", "cost_stats", "list_properties", "chat",
    ];
    if (raw && valid.includes(raw as SupervisorIntent)) return raw as SupervisorIntent;
    return "chat";
  }

  /** Fallback khi LLM lỗi — regex đơn giản */
  private fallbackClassify(message: string): IntentResult {
    const m = message.toLowerCase();
    const hasVideo = /tạo video|viết bài có video|đăng bài có video|bài có video/i.test(message);
    const hasWrite = /^(viết bài|đăng bài|tạo bài)\s/i.test(m) || /viết bài\s|đăng bài\s|tạo bài\s/i.test(m);

    if (hasWrite) {
      if (/kinh nghiệm|triết lý|chia sẻ|sai lầm|bài học/i.test(m)) {
        return { intent: "write_post_experience", skipVideo: !hasVideo };
      }
      if (/tin tức|thị trường|thời sự|mới nhất/i.test(m)) {
        return { intent: hasVideo ? "write_post_news_video" : "write_post_news", skipVideo: !hasVideo };
      }
      return { intent: "write_post_product", skipVideo: !hasVideo };
    }
    if (/theo dõi bài|bài đăng|đã đăng/i.test(m)) return { intent: "track_posts" };
    if (/phân tích|tương tác|like|share|engagement/i.test(m)) return { intent: "analyze_engagement" };
    if (/chi phí|thống kê|chi tiêu/i.test(m)) return { intent: "cost_stats" };
    if (/danh sách|list|bđs đang có|căn đang có/i.test(m)) return { intent: "list_properties" };

    return { intent: "chat" };
  }
}

export const intentRouter = new IntentRouter();
