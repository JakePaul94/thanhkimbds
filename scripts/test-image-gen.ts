/**
 * Test ImageGenSkill: tạo ảnh bằng Gemini 2.0 Flash.
 * Cần: GEMINI_API_KEY
 *
 * bun run scripts/test-image-gen.ts
 */
import "dotenv/config";
import { registry } from "../src/registry/SkillRegistry";
import { registerAllSkills } from "../src/registry/registerAll";
import { RedisMemory } from "../src/memory/short/RedisMemory";
import { QdrantMemory } from "../src/memory/long/QdrantMemory";

registerAllSkills();

const PROMPT = "Phong cảnh căn hộ chung cư hiện đại, view thành phố, ánh sáng tự nhiên, phong cách bất động sản cao cấp";

async function main() {
  const jobId = `test-image-${Date.now()}`;
  const shortMemory = new RedisMemory();
  const longMemory = new QdrantMemory();
  await longMemory.init();
  const ctx = { jobId, shortMemory, longMemory, tracer: null, workflowLogger: null };

  console.log("Running image_gen skill...");
  console.log("Prompt:", PROMPT);
  const result = await registry.run("image_gen", { prompt: PROMPT, variant: "thumbnail" }, ctx);
  console.log("Result:", JSON.stringify(result, null, 2));
  if (result?.data?.url) {
    console.log("\n✅ Image URL:", result.data.url);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
