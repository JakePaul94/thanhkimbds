import { db } from "../client";
import { properties } from "../schema";
import { eq, desc } from "drizzle-orm";

export async function listProperties(limit = 50) {
  try {
    return await db.select().from(properties).orderBy(desc(properties.createdAt)).limit(limit);
  } catch {
    return [];
  }
}

export async function getProperty(id: string) {
  try {
    const [row] = await db.select().from(properties).where(eq(properties.id, id));
    return row ?? null;
  } catch {
    return null;
  }
}

export async function createProperty(data: {
  id: string;
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
}) {
  await db.insert(properties).values({
    id: data.id,
    title: data.title,
    price: data.price ?? null,
    area: data.area ?? null,
    address: data.address ?? null,
    district: data.district ?? null,
    description: data.description ?? null,
    features: data.features ?? [],
    contactPhone: data.contactPhone ?? null,
    imageUrls: data.imageUrls ?? [],
    videoUrl: data.videoUrl ?? null,
    bedrooms: data.bedrooms ?? null,
    bathrooms: data.bathrooms ?? null,
    floors: data.floors ?? null,
    frontage: data.frontage ?? null,
    direction: data.direction ?? null,
    legalStatus: data.legalStatus ?? null,
    interior: data.interior ?? null,
    latitude: data.latitude ?? null,
    longitude: data.longitude ?? null,
  });
}

export async function updateProperty(
  id: string,
  data: Partial<{
    title: string;
    price: string;
    area: string;
    address: string;
    district: string;
    description: string;
    features: string[];
    contactPhone: string;
    imageUrls: string[];
    videoUrl: string;
    bedrooms: string;
    bathrooms: string;
    floors: string;
    frontage: string;
    direction: string;
    legalStatus: string;
    interior: string;
    latitude: number;
    longitude: number;
  }>
) {
  await db
    .update(properties)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(properties.id, id));
}

export async function deleteProperty(id: string) {
  await db.delete(properties).where(eq(properties.id, id));
}
