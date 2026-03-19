import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { log } from "../utils/logger";

export type TTSOptions = {
  languageCode?: string;
  voiceName?: string;
  speakingRate?: number;
};

const DEFAULT_OPTIONS: TTSOptions = {
  languageCode: "vi-VN",
  voiceName: "vi-VN-Wavenet-A",
  speakingRate: 1.0,
};

/** Loại bỏ nháy kép, nháy đơn để tránh TTS nhấn nhá không tự nhiên */
function sanitizeForTTS(text: string): string {
  return text
    .replace(/[""\u201C\u201D]/g, "")  // nháy kép " " " "
    .replace(/[''\u2018\u2019]/g, "")  // nháy đơn ' ' ' '
    .replace(/\s+/g, " ")              // gộp khoảng trắng thừa
    .trim();
}

/**
 * Chuyển text thành file audio bằng Google Cloud TTS REST API (dùng API key).
 * Cần: GOOGLE_CLOUD_API_KEY hoặc GOOGLE_CLOUD_TTS_API_KEY
 */
export async function synthesizeToFile(
  text: string,
  outputPath: string,
  opts: TTSOptions = {}
): Promise<{ path: string; durationSec: number }> {
  const { languageCode, voiceName, speakingRate } = { ...DEFAULT_OPTIONS, ...opts };
  const apiKey = process.env.GOOGLE_CLOUD_API_KEY ?? process.env.GOOGLE_CLOUD_TTS_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GOOGLE_CLOUD_API_KEY or GOOGLE_CLOUD_TTS_API_KEY for TTS");
  }

  const cleanText = sanitizeForTTS(text);
  const res = await fetch(
    `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: { text: cleanText },
        voice: { languageCode, name: voiceName },
        audioConfig: {
          audioEncoding: "MP3",
          speakingRate: speakingRate ?? 1,
        },
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`TTS API error ${res.status}: ${err}`);
  }

  const data = (await res.json()) as { audioContent?: string };
  const audioContent = data.audioContent;
  if (!audioContent) {
    throw new Error("TTS returned no audio");
  }

  await mkdir(join(outputPath, ".."), { recursive: true });
  await writeFile(outputPath, Buffer.from(audioContent, "base64"));

  const durationSec = await getAudioDurationSec(outputPath, text.length);
  return { path: outputPath, durationSec };
}

/** Lấy độ dài audio (giây) bằng ffprobe. Fallback: ước lượng ~4 ký tự/giây */
export async function getAudioDurationSec(filePath: string, textLength?: number): Promise<number> {
  try {
    const proc = Bun.spawn(
      ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", filePath],
      { stdout: "pipe", stderr: "pipe" }
    );
    const out = await new Response(proc.stdout).text();
    const duration = parseFloat(out.trim());
    if (!Number.isNaN(duration) && duration > 0) return duration;
  } catch (e) {
    log.warn({ filePath, err: (e as Error).message }, "ffprobe failed");
  }
  if (textLength != null) return Math.max(1, textLength / 4);
  return 2;
}

/** TTS nhiều đoạn, trả về danh sách { path, durationSec, text } */
export async function synthesizeSegments(
  segments: string[],
  baseDir: string,
  opts?: TTSOptions
): Promise<Array<{ path: string; durationSec: number; text: string }>> {
  const results: Array<{ path: string; durationSec: number; text: string }> = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = sanitizeForTTS(segments[i]);
    if (!seg) continue;
    const outPath = join(baseDir, `seg_${i.toString().padStart(3, "0")}.mp3`);
    const { durationSec } = await synthesizeToFile(seg, outPath, opts);
    results.push({ path: outPath, durationSec, text: seg });
    log.debug({ i, seg: seg.slice(0, 30), durationSec }, "TTS segment");
  }
  return results;
}
