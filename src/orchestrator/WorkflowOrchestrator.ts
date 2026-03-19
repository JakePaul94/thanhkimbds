import { registry }         from "../registry/SkillRegistry";
import { RedisMemory }      from "../memory/short/RedisMemory";
import { QdrantMemory }     from "../memory/long/QdrantMemory";
import { jobRepo }          from "../db/repositories/JobRepository";
import { tracer }           from "../observability/LangfuseTracer";
import { broadcastToExpo }  from "../gateway/expoBroadcast";
import { WorkflowLogger }   from "../utils/WorkflowLogger";
import { log }              from "../utils/logger";
import type { SkillContext } from "../types/skill";

export type RunOptions = {
  skipVideo?: boolean;
  useVideoLocal?: boolean;   // Dùng video_local (TTS+FFmpeg) thay vì video_gen (Kling/Runway)
  forceCategory?: "tin_tuc" | "san_pham" | "kinh_nghiem";
  forceTopic?: string;
  forcePropertyId?: string;  // BĐS từ Qdrant+SQL → skip idea AI, dùng property data
};

// Pipeline definition — BĐS workflow: ý tưởng → research → viết → (video) → HITL → đăng
const PIPELINE: Array<{
  skill:        string;
  inputMapper:  (ctx: SkillContext, opts?: RunOptions) => Promise<Record<string, unknown>>;
  requiresHITL?: boolean;
  skipInTest?: boolean;
  skipWhen?:   (opts?: RunOptions) => boolean;  // Custom skip (ưu tiên hơn skipInTest)
}> = [
  {
    skill: "memory_search",
    inputMapper: async () => ({ query: "past content style tone bất động sản" }),
  },
  {
    skill: "idea",
    inputMapper: async (ctx, opts) => {
      if (opts?.forcePropertyId) {
        const job = await ctx.shortMemory.getJob(ctx.jobId);
        if (job?.property) return { forceProperty: job.property };
      }
      return {
        date: new Date().toISOString().slice(0, 10),
        ...(opts?.forceCategory && { forceCategory: opts.forceCategory }),
        ...(opts?.forceTopic && { forceTopic: opts.forceTopic }),
      };
    },
  },
  {
    skill: "research",
    inputMapper: async (ctx, opts) => {
      if (opts?.forcePropertyId) return { skip: true };
      const job = await ctx.shortMemory.getJob(ctx.jobId);
      return { date: new Date().toISOString().slice(0, 10), topic: job?.topic };
    },
  },
  {
    skill: "writer",
    inputMapper: async (ctx) => {
      const job = await ctx.shortMemory.getJob(ctx.jobId);
      return {
        hook: job?.hook ?? "",
        hashtags: job?.hashtags ?? [],
        tone: "casual",
        property: job?.property,
      };
    },
  },
  {
    skill: "image_gen",
    inputMapper: async (ctx) => {
      const job = await ctx.shortMemory.getJob(ctx.jobId);
      // san_pham: dùng hook (mô tả BĐS). tin_tuc/kinh_nghiem: dùng topic (chủ đề rõ, dễ minh họa)
      const prompt =
        job?.ideaCategory === "san_pham"
          ? (job?.hook ?? job?.topic ?? "bất động sản")
          : (job?.topic ?? job?.hook ?? "bất động sản");
      return { prompt, variant: "thumbnail" };
    },
  },
  {
    skill: "video_local",
    inputMapper: async (ctx) => {
      const job = await ctx.shortMemory.getJob(ctx.jobId);
      return { caption: job?.caption?.facebook ?? job?.hook ?? "" };
    },
  },
  {
    skill: "video_gen",
    inputMapper: async (ctx) => {
      const job = await ctx.shortMemory.getJob(ctx.jobId);
      return { prompt: job?.hook ?? "", duration: 5, aspect_ratio: "9:16" };
    },
    skipWhen: () => true,  // Luôn bỏ qua — dùng video_local (TTS+FFmpeg)
  },
  // ── HITL pause point — gửi bài mẫu qua Expo cho human duyệt ──
  {
    skill:        "__hitl__",
    inputMapper:  async () => ({}),
    requiresHITL: true,
  },
  {
    skill: "facebook_post",
    inputMapper: async (ctx) => {
      const job = await ctx.shortMemory.getJob(ctx.jobId);
      return {
        caption:   job?.caption?.facebook ?? "",
        videoPath: job?.videoUrl,
        imagePath: job?.imageUrls?.thumbnail,
      };
    },
  },
  {
    skill: "zalo_post",
    inputMapper: async (ctx) => {
      const job = await ctx.shortMemory.getJob(ctx.jobId);
      return { caption: job?.caption?.zalo ?? "", imagePath: job?.imageUrls?.thumbnail };
    },
    skipWhen: () => true,  // Tắt tạm — phát triển sau (cần Playwright/Chrome)
  },
  {
    skill: "memory_save",
    inputMapper: async (ctx) => {
      const job = await ctx.shortMemory.getJob(ctx.jobId);
      return { text: `Published: ${job?.caption?.facebook ?? ""}`, metadata: { type: "published_post" } };
    },
  },
];

export class WorkflowOrchestrator {
  async run(jobId: string, resumeFromSkill?: string, opts?: RunOptions) {
    // Tránh chạy lại từ đầu khi job đã AWAITING_HITL (trừ khi resume từ facebook_post)
    const existing = await jobRepo.findById(jobId);
    if (existing?.state === "AWAITING_HITL" && !resumeFromSkill) {
      log.warn({ jobId }, "⏭  Job already AWAITING_HITL, skipping duplicate run");
      return;
    }

    const trace          = tracer.newTrace({ name: "morning-pipeline", metadata: { jobId } });
    const shortMemory    = new RedisMemory();
    const longMemory     = new QdrantMemory();
    const workflowLogger = new WorkflowLogger(jobId);
    await longMemory.init();

    const ctx: SkillContext = { jobId, shortMemory, longMemory, tracer: trace, workflowLogger };
    await workflowLogger.init();

    const startIdx = resumeFromSkill
      ? PIPELINE.findIndex((s) => s.skill === resumeFromSkill)
      : 0;

    await jobRepo.setState(jobId, "RUNNING");
    broadcastToExpo({ type: "job_started", jobId, opts });
    await workflowLogger.logState("RUNNING", { resumeFrom: resumeFromSkill, opts });

    for (let i = startIdx; i < PIPELINE.length; i++) {
      const step = PIPELINE[i];

      if (step.skipWhen?.(opts) || (opts?.skipVideo && step.skipInTest)) {
        const reason = step.skipWhen?.(opts) ? "skipWhen" : "test_mode";
        log.info({ jobId, skill: step.skill }, `⏭  Skipped (${reason})`);
        broadcastToExpo({ type: "job_progress", jobId, step: step.skill, status: "skipped" });
        await workflowLogger.logStepEnd(step.skill, { skipped: true, reason });
        continue;
      }

      if (step.requiresHITL) {
        const job = await shortMemory.getJob(jobId);
        await jobRepo.setState(jobId, "AWAITING_HITL", { topic: job?.topic });
        try {
          const { saveDraft } = await import("../db/queries/drafts");
          await saveDraft({
            jobId,
            facebook: job?.caption?.facebook,
            zalo: job?.caption?.zalo,
            imageUrl: job?.imageUrls?.thumbnail,
            videoUrl: job?.videoUrl,
          });
        } catch {}
        const draft = {
          jobId,
          topic:    job?.topic    ?? "—",
          caption:  job?.caption?.facebook ?? "—",
          imageUrl: job?.imageUrls?.thumbnail ?? "",
          videoUrl: job?.videoUrl ?? "",
        };
        // Broadcast tới Expo app — human duyệt bài đăng mẫu
        broadcastToExpo({ type: "job_progress", jobId, step: "__hitl__", status: "awaiting_review" });
        broadcastToExpo({ type: "job_ready_for_review", ...draft });
        await workflowLogger.logState("AWAITING_HITL", { draft });
        log.info({ jobId }, "⏸  Pipeline paused — waiting HITL (Expo)");
        trace.end();
        return;
      }

      const input = await step.inputMapper(ctx, opts);
      await workflowLogger.logStepStart(step.skill, input);
      broadcastToExpo({ type: "job_progress", jobId, step: step.skill, status: "running" });
      const span = (trace as any).span?.({ name: step.skill }) ?? { end: () => {} };
      try {
        const result = await registry.run(step.skill, input, ctx);
        span.end({ output: result });
        await workflowLogger.logStepEnd(step.skill, result);
        broadcastToExpo({ type: "job_progress", jobId, step: step.skill, status: "done" });
        if (!result.success) {
          log.error({ jobId, skill: step.skill, error: result.error }, "Skill failed");
          broadcastToExpo({ type: "job_progress", jobId, step: step.skill, status: "failed", error: result.error });
          await workflowLogger.logError(step.skill, String(result.error), result);
          await jobRepo.setState(jobId, "FAILED");
          return;
        }
        // Lưu platformPostId khi đăng Facebook thành công
        if (step.skill === "facebook_post" && result.data?.postId) {
          try {
            const { savePublishedPost } = await import("../db/queries/publishedPosts");
            await savePublishedPost(jobId, "facebook", String(result.data.postId));
          } catch (e) {
            log.warn({ jobId, err: (e as Error).message }, "Save published post failed");
          }
        }
      } catch (err: any) {
        // image_gen: NO_IMAGE / safety block — skip và tiếp tục (bài đăng không ảnh vẫn OK)
        if (step.skill === "image_gen" && /NO_IMAGE|IMAGE_SAFETY|block/i.test(err?.message ?? "")) {
          log.warn({ jobId, skill: step.skill, err: err.message }, "Image gen failed, continuing without image");
          broadcastToExpo({ type: "job_progress", jobId, step: step.skill, status: "skipped", error: err.message });
          await workflowLogger.logStepEnd(step.skill, { skipped: true, reason: err.message });
          continue;
        }
        log.error({ jobId, skill: step.skill, err: err.message }, "Skill threw");
        broadcastToExpo({ type: "job_progress", jobId, step: step.skill, status: "failed", error: err.message });
        await workflowLogger.logError(step.skill, err.message, err?.cause ?? err);
        await jobRepo.setState(jobId, "FAILED");
        return;
      }
    }

    await jobRepo.setState(jobId, "PUBLISHED");
    broadcastToExpo({ type: "job_progress", jobId, step: "memory_save", status: "done" });
    broadcastToExpo({ type: "job_complete", jobId, state: "PUBLISHED" });
    await workflowLogger.logState("PUBLISHED");
    trace.end();
    log.info({ jobId }, "✅ Pipeline complete");
  }
}
