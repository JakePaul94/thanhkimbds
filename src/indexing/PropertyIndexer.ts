import { v5 as uuid } from "uuid";
import { QdrantMemory } from "../memory/long/QdrantMemory";

const PROP_NAMESPACE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8"; // UUID namespace for property IDs

type Property = {
  id: string;
  title: string;
  price?: string | null;
  area?: string | null;
  address?: string | null;
  district?: string | null;
  description?: string | null;
  contactPhone?: string | null;
  imageUrls?: string[] | null;
  videoUrl?: string | null;
  bedrooms?: string | null;
  bathrooms?: string | null;
  floors?: string | null;
  frontage?: string | null;
  direction?: string | null;
  legalStatus?: string | null;
  interior?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

function toSearchableText(p: Property): string {
  const parts = [
    p.title,
    p.price && `Giá: ${p.price}`,
    p.area && `Diện tích: ${p.area}`,
    p.address && `Địa chỉ: ${p.address}`,
    p.district && `Quận: ${p.district}`,
    p.bedrooms && `Phòng ngủ: ${p.bedrooms}`,
    p.bathrooms && `Phòng tắm: ${p.bathrooms}`,
    p.floors && `Số tầng: ${p.floors}`,
    p.frontage && `Mặt tiền: ${p.frontage}`,
    p.direction && `Hướng: ${p.direction}`,
    p.legalStatus && `Pháp lý: ${p.legalStatus}`,
    p.interior && `Nội thất: ${p.interior}`,
    p.description,
    p.contactPhone && `Liên hệ: ${p.contactPhone}`,
  ].filter(Boolean);
  return parts.join("\n");
}

const memory = new QdrantMemory();

export async function indexProperty(p: Property): Promise<void> {
  try {
    await memory.init();
    const text = toSearchableText(p);
    const pointId = uuid(p.id, PROP_NAMESPACE); // Qdrant cần UUID hợp lệ
    await memory.upsert(pointId, {
      text,
      metadata: {
        type: "property",
        id: p.id,
        title: p.title,
        imageUrls: p.imageUrls ?? [],
        videoUrl: p.videoUrl ?? null,
      },
    });
  } catch (e) {
    console.error("[PropertyIndexer] upsert fail:", e);
  }
}

export async function removePropertyFromIndex(id: string): Promise<void> {
  try {
    const pointId = uuid(id, PROP_NAMESPACE);
    await memory.delete(pointId);
  } catch (e) {
    console.error("[PropertyIndexer] delete fail:", e);
  }
}

/** Tìm BĐS theo từ khóa (vd: "Hồng Mai", "căn Bạch Mai") — search Qdrant, filter type=property */
export async function searchPropertyByQuery(query: string, topK = 5): Promise<{ id: string; title: string; score: number }[]> {
  try {
    await memory.init();
    const results = await memory.search(query, topK);
    return results
      .filter((r) => (r.payload?.metadata as any)?.type === "property")
      .map((r) => ({
        id: String((r.payload?.metadata as any)?.id ?? r.id),
        title: String((r.payload?.metadata as any)?.title ?? r.payload?.text?.slice(0, 80) ?? ""),
        score: r.score,
      }));
  } catch (e) {
    console.error("[PropertyIndexer] search fail:", e);
    return [];
  }
}
