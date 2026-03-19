/**
 * Test VideoLocalSkill: tạo video từ caption với TTS + background + subtitles.
 * Cần: ffmpeg, ffprobe, GOOGLE_APPLICATION_CREDENTIALS, GEMINI_API_KEY.
 *
 * bun run scripts/test-video-local.ts
 */
import "dotenv/config";
import { registry } from "../src/registry/SkillRegistry";
import { registerAllSkills } from "../src/registry/registerAll";
import { RedisMemory } from "../src/memory/short/RedisMemory";
import { QdrantMemory } from "../src/memory/long/QdrantMemory";

registerAllSkills();

const CAPTION = `Các sai lầm phổ biến khi giao dịch nhà ở:

Pháp lý lỏng lẻo: Không kiểm tra kỹ sổ đỏ, quy hoạch hoặc tình trạng tranh chấp.

Tài chính quá đà: Vay vốn vượt quá 50% khả năng chi trả, gây áp lực nợ nần.

Thiếu khảo sát thực tế: Chỉ tin quảng cáo mà bỏ qua việc kiểm tra hạ tầng, ngập lụt và tiện ích xung quanh.

Hợp đồng mập mờ: Các điều khoản thanh toán và thuế phí không rõ ràng.

Tâm lý đám đông: Quyết định vội vàng do sợ mất cơ hội mà chưa đánh giá kỹ giá thị trường.`;

async function main() {
  const jobId = `test-video-${Date.now()}`;
  const shortMemory = new RedisMemory();
  const longMemory = new QdrantMemory();
  await longMemory.init();
  const ctx = { jobId, shortMemory, longMemory, tracer: null, workflowLogger: null };

  console.log("Running video_local skill...");
  const result = await registry.run("video_local", { caption: CAPTION }, ctx);
  console.log("Result:", JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
