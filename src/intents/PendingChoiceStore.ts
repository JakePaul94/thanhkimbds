/**
 * Lưu trạng thái "chờ user chọn" khi tìm thấy nhiều BĐS.
 * TTL 5 phút — nếu user không trả lời thì expire.
 */
import { RedisMemory } from "../memory/short/RedisMemory";

export type PropertyCandidate = {
  id: string;
  title: string;
  price?: string | null;
  address?: string | null;
};

export type PendingChoice = {
  candidates: PropertyCandidate[];
  query: string;
  createdAt: string;
};

const PREFIX = "pending_property_choice:";
const TTL = 300; // 5 phút

const redis = new RedisMemory();

export async function setPendingChoice(supervisorId: string, data: PendingChoice): Promise<void> {
  await redis.set(`${PREFIX}${supervisorId}`, data, TTL);
}

export async function getPendingChoice(supervisorId: string): Promise<PendingChoice | null> {
  return redis.get<PendingChoice>(`${PREFIX}${supervisorId}`);
}

export async function clearPendingChoice(supervisorId: string): Promise<void> {
  await redis.del(`${PREFIX}${supervisorId}`);
}

/** Parse "căn 2", "2", "căn thứ 2" → index 0-based hoặc null */
export function parseChoiceIndex(message: string, maxIndex: number): number | null {
  const m = message.trim().toLowerCase();
  const match = m.match(/(?:căn\s*)?(?:thứ\s*)?(\d+)/) || m.match(/^(\d+)$/);
  if (match) {
    const n = parseInt(match[1], 10);
    if (n >= 1 && n <= maxIndex + 1) return n - 1;
  }
  return null;
}
