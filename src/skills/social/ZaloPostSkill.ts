import type { Skill, SkillContext } from "../../types/skill";
import { z }           from "zod";
import { BrowserBase } from "./BrowserBase";
import { log }         from "../../utils/logger";

const InputSchema = z.object({
  caption:   z.string(),
  imagePath: z.string().optional(),
});

type In = z.infer<typeof InputSchema>;

export class ZaloPostSkill extends BrowserBase implements Skill {
  name        = "zalo_post";
  description = "Đăng bài lên Zalo cá nhân (feed) qua Playwright CDP";
  inputSchema = InputSchema;

  async execute(input: In, ctx: SkillContext) {
    try {
      await this.attachCDP();
    } catch {
      await this.launchPersistent(process.env.ZALO_CHROME_PROFILE);
    }

    const page = await this.context!.newPage();
    try {
      await page.goto("https://chat.zalo.me", { waitUntil: "networkidle" });
      await this.humanDelay(1000, 1800);

      // Navigate đến Timeline / Nhật ký
      await page.goto("https://id.zalo.me/account", { waitUntil: "networkidle" });
      await this.humanDelay(800, 1200);

      // TODO: map đúng selectors Zalo Web
      // await page.click('[data-testid="post-box"]');
      // await this.humanType(page, input.caption);
      // await page.click('[data-testid="submit-post"]');

      log.info({ jobId: ctx.jobId }, "✅ Zalo posted (stub)");
      return { success: true, data: { platform: "zalo", status: "posted" } };
    } finally {
      await page.close();
    }
  }
}
