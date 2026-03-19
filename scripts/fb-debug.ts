/**
 * Mở Chrome debug session — login Facebook/Zalo thủ công 1 lần
 * Chạy: bun run scripts/fb-debug.ts
 */
import { chromium } from "playwright";
import path         from "path";

const profileDir = process.env.CHROME_USER_DATA_DIR
  ?? path.join(process.env.HOME ?? "~", ".config/google-chrome");

const ctx = await chromium.launchPersistentContext(profileDir, {
  headless: false,
  channel:  "chrome",
  args:     ["--profile-directory=Default"],
});

const page = await ctx.newPage();
await page.goto("https://www.facebook.com");
console.log("✅ Browser open — login thủ công, sau đó Ctrl+C");
console.log("   Session sẽ được lưu vào:", profileDir);
// Giữ nguyên cho đến khi Ctrl+C
await new Promise(() => {});
