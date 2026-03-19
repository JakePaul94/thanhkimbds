import { db } from "../client";
import { chatHistory } from "../schema";
import { eq, desc } from "drizzle-orm";
import { v4 as uuid } from "uuid";

export async function insertChatMessage(
  userId: string,
  role: "user" | "bot",
  message: string,
  platform: string
) {
  const id = uuid();
  await db.insert(chatHistory).values({ id, userId, role, message, platform });
  return id;
}

export async function getChatHistoryByUser(userId: string, limit = 50) {
  const rows = await db
    .select()
    .from(chatHistory)
    .where(eq(chatHistory.userId, userId))
    .orderBy(desc(chatHistory.createdAt))
    .limit(limit);
  return rows.reverse(); // oldest first for display
}
