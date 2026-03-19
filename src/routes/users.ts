import { Hono } from "hono";
import { upsertUser, listUsers } from "../db/queries/users";
import { getChatHistoryByUser } from "../db/queries/chatHistory";

export const usersRouter = new Hono();

/** Danh sách users — ?platform=supervisor_expo để lọc */
usersRouter.get("/", async (c) => {
  const platform = c.req.query("platform");
  const rows = await listUsers(platform);
  return c.json(rows);
});

/** Đăng ký / cập nhật user (idempotent) */
usersRouter.post("/register", async (c) => {
  try {
    const body = (await c.req.json()) as { id: string; platform: string; metadata?: Record<string, unknown> };
    const { id, platform } = body;
    if (!id || !platform) {
      return c.json({ error: "id and platform required" }, 400);
    }
    await upsertUser(id, platform, body.metadata);
    return c.json({ ok: true, id });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

/** Lấy lịch sử chat theo userId */
usersRouter.get("/:id/chat-history", async (c) => {
  const id = c.req.param("id");
  const limit = Number(c.req.query("limit") ?? 50);
  const rows = await getChatHistoryByUser(id, limit);
  return c.json(rows);
});
