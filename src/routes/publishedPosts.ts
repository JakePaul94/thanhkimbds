import { Hono } from "hono";
import { listPublishedPosts } from "../db/queries/publishedPosts";

const GRAPH_API = "https://graph.facebook.com/v21.0";

async function fetchPostEngagement(postId: string): Promise<{ likes: number; comments: number; shares?: number }> {
  const token = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
  if (!token) return { likes: 0, comments: 0 };

  try {
    const url = `${GRAPH_API}/${postId}?fields=likes.summary(true),comments.summary(true)&access_token=${token}`;
    const res = await fetch(url);
    const data = (await res.json()) as {
      likes?: { summary?: { total_count?: number } };
      comments?: { summary?: { total_count?: number } };
      error?: { message: string };
    };
    if (data.error) return { likes: 0, comments: 0 };
    return {
      likes: data.likes?.summary?.total_count ?? 0,
      comments: data.comments?.summary?.total_count ?? 0,
    };
  } catch {
    return { likes: 0, comments: 0 };
  }
}

export const publishedPostsRouter = new Hono();

publishedPostsRouter.get("/", async (c) => {
  const limit = Number(c.req.query("limit") ?? 50);
  const withEngagement = c.req.query("engagement") !== "false";

  const rows = await listPublishedPosts(limit);

  if (!withEngagement) {
    return c.json(rows);
  }

  const token = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;

  const enriched = await Promise.all(
    rows.map(async (row) => {
      let engagement = { likes: 0, comments: 0 };
      if (row.platformPostId && token) {
        engagement = await fetchPostEngagement(row.platformPostId);
      }
      return {
        ...row,
        engagement,
      };
    })
  );

  return c.json(enriched);
});
