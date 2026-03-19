import "dotenv/config";
import { db } from "../src/db/client";
import { users, chatHistory } from "../src/db/schema";

async function main() {
  await db.delete(chatHistory);
  await db.delete(users);
  console.log("Đã xóa hết users và chat_history");
}

main().catch(console.error).finally(() => process.exit(0));
