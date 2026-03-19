/**
 * Customer Agent — tương tác với khách hàng qua web, Facebook, Zalo.
 * Chỉ chat (ChatSkill), không có quyền đăng bài hay truy cập pipeline.
 */
import { registry } from "../registry/SkillRegistry";
import { RedisMemory } from "../memory/short/RedisMemory";
import { QdrantMemory } from "../memory/long/QdrantMemory";

export async function customerAgentReply(message: string): Promise<string> {
  const shortMemory = new RedisMemory();
  const longMemory = new QdrantMemory();
  await longMemory.init();
  const chatId = `customer-${Date.now()}`;
  const ctx = { jobId: chatId, shortMemory, longMemory, tracer: null };

  const result = await registry.run("chat", { message }, ctx);
  const text = (result as { data?: { text?: string } })?.data?.text ?? "Xin lỗi, vui lòng thử lại.";
  return text;
}
