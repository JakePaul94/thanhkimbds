import { Hono }             from "hono";
import { logger }           from "hono/logger";
import { cors }             from "hono/cors";
import { serveStatic }      from "hono/bun";
import { v4 as uuid }       from "uuid";
import { hitlRouter }            from "./hitl/HITLGateway";
import { propertiesRouter }      from "./routes/properties";
import { publishedPostsRouter }  from "./routes/publishedPosts";
import { cronSchedulesRouter }  from "./routes/cronSchedules";
import { facebookWebhookRouter } from "./routes/facebookWebhook";
import { usersRouter } from "./routes/users";
import { CustomerGateway }  from "./gateway/CustomerGateway";
import { ExpoGateway }      from "./gateway/ExpoGateway";
import { schedulerStart }   from "./queue/Scheduler";
import { jobQueue }         from "./queue/JobQueue";
import { jobRepo }          from "./db/repositories/JobRepository";
import { registerAllSkills } from "./registry/registerAll";
import { log }              from "./utils/logger";

// Boot
registerAllSkills();

const app = new Hono();
app.use("*", cors({ origin: "*", allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"], allowHeaders: ["Content-Type"] }));
app.use("*", logger());

// Public uploads — phục vụ ảnh/video cho Facebook (cần URL public)
app.get("/uploads/*", serveStatic({ root: "." }));

app.get("/", (c) =>
  c.json({
    status: "ok",
    service: "morning-content-agent",
    endpoints: {
    health: "/health",
    skills: "/skills",
    posts: "/api/posts",
    facebookWebhook: "/webhook/facebook",
    facebookWebhookTest: "POST /webhook/facebook/test (simulate)",
  },
  })
);

app.route("/hitl", hitlRouter);
app.route("/api/properties", propertiesRouter);
app.route("/api/published-posts", publishedPostsRouter);
app.route("/api/cron-schedules", cronSchedulesRouter);
app.route("/webhook/facebook", facebookWebhookRouter);
app.route("/api/users", usersRouter);
app.get("/health",  (c) => c.json({ status: "ok" }));
app.get("/skills",  (c) => {
  const { registry } = require("./registry/SkillRegistry");
  return c.json(registry.list());
});

// API posts cho web landing (từ DB agent)
app.get("/api/posts", async (c) => {
  const { getPosts } = await import("./db/queries/posts");
  const posts = await getPosts(Number(c.req.query("limit") ?? 10));
  return c.json(posts);
});

// Test flow: tin tức mới nhất, không video
app.post("/trigger/test", async (c) => {
  const jobId = `test-${Date.now()}-${uuid().slice(0, 8)}`;
  await jobRepo.create(jobId);
  await jobQueue.addTestJob(jobId, {
    skipVideo:     true,
    forceCategory: "tin_tuc",
    forceTopic:    "tin tức mới nhất thị trường BĐS",
  });
  return c.json({ jobId, message: "Test job queued — tin tức, no video" });
});

// Test flow ĐẦY ĐỦ: idea → research → writer → image → video_local → HITL → approve → đăng Facebook
app.post("/trigger/test/full", async (c) => {
  let topic = "Những thủ tục cần chú ý khi giao dịch bất động sản";
  try {
    const body = await c.req.json() as { topic?: string };
    if (body?.topic) topic = body.topic;
  } catch {}
  const jobId = `full-${Date.now()}-${uuid().slice(0, 8)}`;
  await jobRepo.create(jobId);
  await jobQueue.addTestJob(jobId, {
    skipVideo:     false,
    useVideoLocal: true,
    forceCategory: "kinh_nghiem",
    forceTopic:    topic,
  });
  return c.json({
    jobId,
    topic,
    message: "Full flow queued — idea → research → writer → image → video_local → HITL → (approve) → facebook_post",
    approveUrl: `POST /hitl/jobs/${jobId}/approve`,
  });
});

// WebSocket: Customer (web, Facebook, Zalo) + Supervisor (Expo)
new CustomerGateway();
new ExpoGateway();

// Cron scheduler
schedulerStart();

const port = Number(process.env.PORT ?? 3000);
const hostname = process.env.HOST ?? "0.0.0.0"; // 0.0.0.0 = listen trên mọi interface (Tailscale, LAN...)
log.info(`🚀 HTTP  → http://${hostname}:${port}`);
log.info(`📡 WS Customer → ws://${hostname}:${process.env.WS_CUSTOMER_PORT ?? process.env.WS_PORT ?? 3001}`);
log.info(`📡 WS Supervisor → ws://${hostname}:${process.env.WS_SUPERVISOR_PORT ?? 3003}`);

export default { hostname, port, fetch: app.fetch };
