import { chromium, type BrowserContext, type Page } from "playwright";

export class BrowserBase {
  protected context: BrowserContext | null = null;

  // Attach vào Chrome đang chạy (--remote-debugging-port=9222)
  async attachCDP(): Promise<void> {
    const browser = await chromium.connectOverCDP("http://localhost:9222");
    this.context  = browser.contexts()[0];
  }

  // Dùng persistent profile (fallback nếu chưa có Chrome debug)
  async launchPersistent(profileName = "Default"): Promise<void> {
    const userDataDir = process.env.CHROME_USER_DATA_DIR
      ?? `${process.env.HOME}/.config/google-chrome`;

    this.context = await chromium.launchPersistentContext(userDataDir, {
      headless:  false,
      channel:   "chrome",
      slowMo:    120,
      args:      [`--profile-directory=${profileName}`],
    });
  }

  protected async humanDelay(min = 300, max = 800): Promise<void> {
    await new Promise((r) => setTimeout(r, min + Math.random() * (max - min)));
  }

  protected async humanType(page: Page, text: string): Promise<void> {
    await page.keyboard.type(text, { delay: 35 + Math.random() * 55 });
  }

  async close(): Promise<void> {
    await this.context?.close();
  }
}
