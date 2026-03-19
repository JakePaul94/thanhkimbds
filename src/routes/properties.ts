import { mkdir } from "fs/promises";
import { Hono } from "hono";
import { v4 as uuid } from "uuid";
import { serveStatic } from "hono/bun";
import * as props from "../db/queries/properties";
import { indexProperty, removePropertyFromIndex } from "../indexing/PropertyIndexer";

const UPLOAD_DIR = "./uploads/properties";

export const propertiesRouter = new Hono();

// Legacy: /api/properties/uploads/* (redirect tới /uploads/* public)
propertiesRouter.get("/uploads/*", serveStatic({ root: "." }));

// Upload ảnh/video — multipart, lưu file, trả URL
propertiesRouter.post("/upload", async (c) => {
  try {
    const body = await c.req.parseBody();
    const file = body["file"] ?? body["image"] ?? body["video"];
    if (!file || !(file instanceof File)) {
      return c.json({ error: "No file" }, 400);
    }

    const ext = file.name.split(".").pop() ?? "bin";
    const filename = `${Date.now()}-${uuid().slice(0, 8)}.${ext}`;
    const path = `${UPLOAD_DIR}/${filename}`;

    await mkdir(UPLOAD_DIR, { recursive: true });
    await Bun.write(path, file);
    const base = process.env.API_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;
    const url = `${base.replace(/\/$/, "")}/uploads/properties/${filename}`;
    return c.json({ url });
  } catch (e: any) {
    return c.json({ error: (e as Error).message }, 500);
  }
});

// CRUD
propertiesRouter.get("/", async (c) => {
  const list = await props.listProperties(Number(c.req.query("limit") ?? 50));
  return c.json(list);
});

propertiesRouter.get("/:id", async (c) => {
  const p = await props.getProperty(c.req.param("id"));
  return p ? c.json(p) : c.json({ error: "Not found" }, 404);
});

propertiesRouter.post("/", async (c) => {
  const body = await c.req.json<{
    title: string;
    price?: string;
    area?: string;
    address?: string;
    district?: string;
    description?: string;
    features?: string[];
    contactPhone?: string;
    imageUrls?: string[];
    videoUrl?: string;
    bedrooms?: string;
    bathrooms?: string;
    floors?: string;
    frontage?: string;
    direction?: string;
    legalStatus?: string;
    interior?: string;
    latitude?: number;
    longitude?: number;
  }>();
  const id = `prop-${Date.now()}-${uuid().slice(0, 8)}`;
  await props.createProperty({ id, ...body });
  await indexProperty({ id, ...body });
  return c.json({ id, ...body });
});

propertiesRouter.put("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json() as Record<string, unknown>;
  const { createdAt, updatedAt, id: _id, ...safe } = body;
  await props.updateProperty(id, safe);
  const p = await props.getProperty(id);
  if (p) await indexProperty(p);
  return c.json({ ok: true });
});

propertiesRouter.delete("/:id", async (c) => {
  const id = c.req.param("id");
  await props.deleteProperty(id);
  await removePropertyFromIndex(id);
  return c.json({ ok: true });
});
