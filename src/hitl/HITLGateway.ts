import { Hono }             from "hono";
import { zValidator }       from "@hono/zod-validator";
import { z }                from "zod";
import { jobQueue }         from "../queue/JobQueue";
import { jobRepo }          from "../db/repositories/JobRepository";

export const hitlRouter = new Hono();

hitlRouter.get("/jobs", async (c) => {
  const jobs = await jobRepo.listByState("AWAITING_HITL");
  const { getDraftByJobId } = await import("../db/queries/drafts");
  const enriched = await Promise.all(
    jobs.map(async (j) => {
      const draft = await getDraftByJobId(j.id);
      return {
        ...j,
        context: {
          topic: j.topic,
          caption: draft ? { facebook: draft.facebook, zalo: draft.zalo } : undefined,
          imageUrl: draft?.imageUrl,
          videoUrl: draft?.videoUrl,
        },
      };
    })
  );
  return c.json(enriched);
});

hitlRouter.get("/jobs/:id", async (c) => {
  const job = await jobRepo.findById(c.req.param("id"));
  return job ? c.json(job) : c.json({ error: "Not found" }, 404);
});

hitlRouter.post("/jobs/:id/approve", async (c) => {
  const id = c.req.param("id");
  await jobRepo.setState(id, "APPROVED");
  await jobQueue.resumeJob(id, "facebook_post");
  return c.json({ status: "resumed" });
});

hitlRouter.post("/jobs/:id/reject",
  zValidator("json", z.object({ reason: z.string() })),
  async (c) => {
    const id = c.req.param("id");
    await jobRepo.setState(id, "REJECTED");
    await jobRepo.logEvent(id, "rejected", c.req.valid("json"));
    return c.json({ status: "rejected" });
  }
);

hitlRouter.post("/jobs/:id/edit",
  zValidator("json", z.object({
    caption:    z.string().optional(),
    imageUrl:   z.string().optional(),
    resumeFrom: z.string().default("writer"),
  })),
  async (c) => {
    const { caption, imageUrl, resumeFrom } = c.req.valid("json");
    const id = c.req.param("id");
    await jobRepo.patchDraft(id, { caption, imageUrl });
    await jobRepo.setState(id, "EDITING");
    await jobQueue.resumeJob(id, resumeFrom);
    return c.json({ status: "editing", resumeFrom });
  }
);
