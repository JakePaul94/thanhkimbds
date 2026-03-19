import { GoogleGenAI } from "@google/genai";
import type { Skill, SkillContext } from "../../types/skill";
import { z } from "zod";
import { join, basename } from "path";
import { existsSync, readdirSync } from "fs";
import { writeFile, mkdir, copyFile } from "fs/promises";
import { tmpdir } from "os";
import { v4 as uuid } from "uuid";
import { log } from "../../utils/logger";
import { synthesizeSegments } from "../../tools/tts";
import { buildAss } from "../../tools/subtitles";

const InputSchema = z.object({
  caption: z.string(),
  backgroundPath: z.string().optional(),
});

type In = z.infer<typeof InputSchema>;

const PROJECT_ROOT = process.cwd();
const BG_VIDEO_DIR = join(PROJECT_ROOT, "assets", "backgroundvideo");
const OUTRO_PATH = join(PROJECT_ROOT, "assets", "outro.mp4");
const LOGO_PATH = join(PROJECT_ROOT, "assets", "logo.png");

export class VideoLocalSkill implements Skill {
  name = "video_local";
  description = "Tạo video local: caption -> LLM segments -> TTS -> background + subtitles (FFmpeg)";
  inputSchema = InputSchema;

  private client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  /** Bỏ hashtags (#xxx) khỏi caption trước khi TTS/subtitle */
  private stripHashtags(text: string): string {
    return text.replace(/#\S+/g, "").replace(/\s+/g, " ").trim();
  }

  /** Bỏ emoji/ký tự đặc biệt gây ô vuông trong ASS (font Arial không hỗ trợ) */
  private sanitizeForSubtitle(text: string): string {
    return text
      .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}]/gu, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  async execute(input: In, ctx: SkillContext) {
    const caption = this.sanitizeForSubtitle(this.stripHashtags(input.caption)).trim();
    const backgroundPath = input.backgroundPath ?? this.pickRandomBackground();
    if (!existsSync(backgroundPath)) {
      throw new Error(`Background video not found: ${backgroundPath}`);
    }

    const workDir = join(tmpdir(), `video-local-${ctx.jobId}-${Date.now()}`);
    await mkdir(workDir, { recursive: true });

    try {
      const segments = await this.splitCaptionToSegments(caption, ctx);
      if (segments.length === 0) throw new Error("No segments from caption");

      const speakingRate = Number(process.env.TTS_SPEAKING_RATE) || 1.25;
      const ttsResults = await synthesizeSegments(segments, workDir, { speakingRate });
      const concatAudioPath = join(workDir, "audio_concat.mp3");
      await this.concatAudioFiles(ttsResults.map((r) => r.path), concatAudioPath);

      const totalDuration = ttsResults.reduce((a, r) => a + r.durationSec, 0);
      const bgSegmentPath = join(workDir, "bg_segment.mp4");
      await this.prepareBackgroundSegment(backgroundPath, totalDuration, bgSegmentPath);

      const videoWithAudio = join(workDir, "video_with_audio.mp4");
      await this.mixVideoWithAudio(bgSegmentPath, concatAudioPath, videoWithAudio, totalDuration);

      const assSegments = this.buildSrtFromTts(ttsResults);
      const assPath = join(workDir, "subs.ass");
      const { width, height } = await this.getVideoDimensions(bgSegmentPath);
      const longest = ttsResults.reduce((a, r) => (r.text.length > a.length ? r.text : a), "");
      const { fontSize, charsPerLine } = this.calcSubLayout(width, height, longest);
      await writeFile(assPath, buildAss(assSegments, { fontSize, charsPerLine, videoWidth: width, videoHeight: height }), "utf-8");

      const withSubsPath = join(workDir, "with_subs.mp4");
      await this.burnSubtitles(videoWithAudio, assPath, withSubsPath);

      const withLogoPath = join(workDir, "with_logo.mp4");
      await this.overlayLogo(withSubsPath, withLogoPath, width, height);

      const outputPath = join(workDir, "output.mp4");
      await this.appendOutro(withLogoPath, outputPath, width, height);

      const publicUrl = await this.serveOrUpload(outputPath, ctx);
      await ctx.shortMemory.setJob(ctx.jobId, { videoUrl: publicUrl });
      return { success: true, data: { url: publicUrl, path: outputPath } };
    } finally {
      log.debug({ workDir }, "VideoLocal work dir");
    }
  }

  /** Chọn random video nền từ assets/backgroundvideo */
  private pickRandomBackground(): string {
    if (!existsSync(BG_VIDEO_DIR)) {
      throw new Error(`Background video dir not found: ${BG_VIDEO_DIR}`);
    }
    const files = readdirSync(BG_VIDEO_DIR).filter((f) => /\.(mp4|mov|mkv)$/i.test(f));
    if (files.length === 0) throw new Error(`No video files in ${BG_VIDEO_DIR}`);
    const chosen = files[Math.floor(Math.random() * files.length)];
    return join(BG_VIDEO_DIR, chosen);
  }

  /** Lấy độ dài video (giây) */
  private async getVideoDurationSec(videoPath: string): Promise<number> {
    const proc = Bun.spawn(
      ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", videoPath],
      { stdout: "pipe", stderr: "pipe" }
    );
    const out = await new Response(proc.stdout).text();
    const d = parseFloat(out.trim());
    return Number.isNaN(d) || d <= 0 ? 60 : d;
  }

  /** Tạo segment nền: loop nếu ngắn hơn TTS, cắt random nếu dài hơn */
  private async prepareBackgroundSegment(
    backgroundPath: string,
    targetDuration: number,
    outputPath: string
  ): Promise<void> {
    const bgDuration = await this.getVideoDurationSec(backgroundPath);
    if (bgDuration < targetDuration) {
      // Loop
      const proc = Bun.spawn(
        [
          "ffmpeg", "-y", "-stream_loop", "-1", "-i", backgroundPath,
          "-t", String(targetDuration), "-c:v", "libx264", "-an", outputPath,
        ],
        { stdout: "pipe", stderr: "pipe" }
      );
      const exit = await proc.exited;
      if (exit !== 0) {
        const err = await new Response(proc.stderr).text();
        throw new Error(`FFmpeg loop bg failed: ${err}`);
      }
    } else {
      // Cắt random segment
      const maxStart = Math.max(0, bgDuration - targetDuration - 0.5);
      const startSec = maxStart > 0 ? Math.random() * maxStart : 0;
      const proc = Bun.spawn(
        [
          "ffmpeg", "-y", "-ss", String(startSec), "-i", backgroundPath,
          "-t", String(targetDuration), "-c:v", "libx264", "-an", outputPath,
        ],
        { stdout: "pipe", stderr: "pipe" }
      );
      const exit = await proc.exited;
      if (exit !== 0) {
        const err = await new Response(proc.stderr).text();
        throw new Error(`FFmpeg cut bg failed: ${err}`);
      }
    }
    log.info({ backgroundPath, targetDuration, bgDuration }, "Background segment prepared");
  }

  /** Ghép outro.mp4 vào cuối — resize/crop center để khớp */
  private async appendOutro(
    mainPath: string,
    outputPath: string,
    width: number,
    height: number
  ): Promise<void> {
    if (!existsSync(OUTRO_PATH)) {
      await copyFile(mainPath, outputPath);
      log.warn({ OUTRO_PATH }, "Outro not found, skipping");
      return;
    }
    const outroDuration = await this.getVideoDurationSec(OUTRO_PATH);
    // scale/crop center + anullsrc cho outro (thường không có audio)
    const filter = `[1:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}[ov];anullsrc=channel_layout=stereo:sample_rate=44100:duration=${outroDuration}[oa];[0:v][0:a][ov][oa]concat=n=2:v=1:a=1[outv][outa]`;
    const proc = Bun.spawn(
      [
        "ffmpeg", "-y", "-i", mainPath, "-i", OUTRO_PATH,
        "-filter_complex", filter, "-map", "[outv]", "-map", "[outa]",
        outputPath,
      ],
      { stdout: "pipe", stderr: "pipe" }
    );
    const exit = await proc.exited;
    if (exit !== 0) {
      const err = await new Response(proc.stderr).text();
      throw new Error(`FFmpeg append outro failed: ${err}`);
    }
  }

  private async splitCaptionToSegments(caption: string, ctx: SkillContext): Promise<string[]> {
    const prompt = `Chia nội dung sau thành các đoạn ngắn phù hợp cho TTS . 
     Mỗi đoạn phải đọc trôi chảy, đủ ý nghĩa.
     Nếu là dạng danh sách, hãy chia thành các đoạn với số ở đầu ví dụ ["Những sai lầm ..","1. đoạn 1", "2. đoạn 2", ...]
    Trả về JSON array các chuỗi, không markdown: ["đoạn 1", "đoạn 2", ...]

Nội dung:
${caption}`;

    const response = await this.client.models.generateContent({
      model: "gemini-2.0-flash",
      contents: prompt,
      config: { maxOutputTokens: 2048 },
    });

    const raw = response.text?.trim() ?? "[]";
    const jsonStr = raw.replace(/^```(?:json)?\s*\n?|\n?```\s*$/g, "").trim();
    const parsed = JSON.parse(jsonStr);
    if (!Array.isArray(parsed)) return [caption];
    return parsed.filter((s: unknown) => typeof s === "string" && s.trim());
  }

  private async concatAudioFiles(paths: string[], outputPath: string): Promise<void> {
    const workDir = join(outputPath, "..");
    const listPath = join(workDir, "concat_list.txt");
    const content = paths.map((p) => `file '${basename(p)}'`).join("\n");
    await writeFile(listPath, content, "utf-8");

    const proc = Bun.spawn(
      ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", outputPath],
      { stdout: "pipe", stderr: "pipe", cwd: workDir }
    );
    const exit = await proc.exited;
    if (exit !== 0) {
      const err = await new Response(proc.stderr).text();
      throw new Error(`FFmpeg concat failed: ${err}`);
    }
  }

  private async mixVideoWithAudio(
    videoPath: string,
    audioPath: string,
    outputPath: string,
    targetDuration: number
  ): Promise<void> {
    // Loop background, thay thế audio gốc bằng TTS audio
    const proc = Bun.spawn(
      [
        "ffmpeg",
        "-y",
        "-stream_loop",
        "-1",
        "-i",
        videoPath,
        "-i",
        audioPath,
        "-t",
        String(targetDuration),
        "-map",
        "0:v",
        "-map",
        "1:a",
        "-c:v",
        "libx264",
        "-c:a",
        "aac",
        "-shortest",
        outputPath,
      ],
      { stdout: "pipe", stderr: "pipe" }
    );
    const exit = await proc.exited;
    if (exit !== 0) {
      const err = await new Response(proc.stderr).text();
      throw new Error(`FFmpeg mix failed: ${err}`);
    }
  }

  private buildSrtFromTts(
    ttsResults: Array<{ durationSec: number; text: string }>
  ): Array<{ startSec: number; endSec: number; text: string }> {
    let start = 0;
    return ttsResults.map((r) => {
      const end = start + r.durationSec;
      const seg = { startSec: start, endSec: end, text: r.text };
      start = end;
      return seg;
    });
  }

  private async getVideoDimensions(videoPath: string): Promise<{ width: number; height: number }> {
    const proc = Bun.spawn(
      ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "json", videoPath],
      { stdout: "pipe", stderr: "pipe" }
    );
    const out = await new Response(proc.stdout).text();
    const json = JSON.parse(out) as { streams?: Array<{ width?: number; height?: number }> };
    const s = json.streams?.[0];
    return { width: s?.width ?? 1920, height: s?.height ?? 1080 };
  }

  /**
   * Tính fontSize và charsPerLine sao cho:
   * - Các hàng nằm trong 80% width
   * - Toàn bộ nội dung không quá 50% height
   */
  private calcSubLayout(
    videoWidth: number,
    videoHeight: number,
    longestText: string
  ): { fontSize: number; charsPerLine: number } {
    const MAX_WIDTH_RATIO = 0.9;
    const MAX_HEIGHT_RATIO = 0.7;
    const CHAR_WIDTH_RATIO = 0.55; // Arial: ~0.55 fontSize mỗi ký tự
    const LINE_HEIGHT_RATIO = 1.35;

    const maxWidth = videoWidth * MAX_WIDTH_RATIO;
    const maxHeight = videoHeight * MAX_HEIGHT_RATIO;
    const len = longestText.length;

    for (let fontSize = 40; fontSize >= 14; fontSize--) {
      const charsPerLine = Math.max(1, Math.floor(maxWidth / (fontSize * CHAR_WIDTH_RATIO)));
      const lines = Math.max(1, Math.ceil(len / charsPerLine));
      const totalHeight = lines * fontSize * LINE_HEIGHT_RATIO;
      if (totalHeight <= maxHeight) {
        return { fontSize, charsPerLine };
      }
    }
    return { fontSize: 14, charsPerLine: Math.max(1, Math.floor(maxWidth / (14 * CHAR_WIDTH_RATIO))) };
  }

  private async burnSubtitles(videoPath: string, assPath: string, outputPath: string): Promise<void> {
    const workDir = join(assPath, "..");
    const assName = basename(assPath);
    const videoName = basename(videoPath);
    const outName = basename(outputPath);

    const proc = Bun.spawn(
      [
        "ffmpeg",
        "-y",
        "-i",
        videoName,
        "-vf",
        `ass='${assName}'`,
        "-c:a",
        "copy",
        outName,
      ],
      { stdout: "pipe", stderr: "pipe", cwd: workDir }
    );
    const exit = await proc.exited;
    if (exit !== 0) {
      const err = await new Response(proc.stderr).text();
      throw new Error(`FFmpeg burn subs failed: ${err}`);
    }
  }

  /** Chèn logo nhỏ góc trên bên trái (chỉ video gốc, không áp dụng cho outro) */
  private async overlayLogo(
    videoPath: string,
    outputPath: string,
    width: number,
    height: number
  ): Promise<void> {
    if (!existsSync(LOGO_PATH)) {
      await copyFile(videoPath, outputPath);
      log.warn({ LOGO_PATH }, "Logo not found, skipping overlay");
      return;
    }
    const logoW = Math.max(40, Math.floor(width * 0.12)); // ~12% chiều rộng, tối thiểu 40px
    const margin = Math.max(8, Math.floor(width * 0.02)); // margin 2%
    const filter = `[1:v]scale=${logoW}:-1[logo];[0:v][logo]overlay=${margin}:${margin}[v]`;
    const proc = Bun.spawn(
      ["ffmpeg", "-y", "-i", videoPath, "-i", LOGO_PATH, "-filter_complex", filter, "-map", "[v]", "-map", "0:a", "-c:a", "copy", outputPath],
      { stdout: "pipe", stderr: "pipe" }
    );
    const exit = await proc.exited;
    if (exit !== 0) {
      const err = await new Response(proc.stderr).text();
      throw new Error(`FFmpeg logo overlay failed: ${err}`);
    }
  }

  private async serveOrUpload(outputPath: string, _ctx: SkillContext): Promise<string> {
    const base = process.env.API_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;
    const uploadDir = join(PROJECT_ROOT, "uploads", "properties");

    try {
      await mkdir(uploadDir, { recursive: true });
      const filename = `${Date.now()}-${uuid().slice(0, 8)}.mp4`;
      const destPath = join(uploadDir, filename);
      await copyFile(outputPath, destPath);

      const publicUrl = `${base.replace(/\/$/, "")}/uploads/properties/${filename}`;
      log.info({ publicUrl }, "Video saved to uploads/properties");
      return publicUrl;
    } catch (e) {
      log.warn({ err: (e as Error).message }, "Copy to uploads failed, using file path");
    }
    return `file://${outputPath}`;
  }
}
