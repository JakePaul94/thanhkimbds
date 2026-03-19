/**
 * Xóa dữ liệu BĐS cũ: SQL (truncate properties) + Qdrant (xóa collection hoặc points property).
 *
 * bun run scripts/reset-properties-data.ts
 */
import "dotenv/config";
import { db } from "../src/db/client";
import { sql } from "drizzle-orm";
import { QdrantClient } from "@qdrant/js-client-rest";

async function main() {
  console.log("Đang xóa dữ liệu BĐS cũ...");

  // 1. SQL: truncate properties
  try {
    await db.execute(sql`TRUNCATE TABLE properties CASCADE`);
    console.log("✓ Đã xóa bảng properties (SQL)");
  } catch (e: any) {
    console.error("SQL truncate fail:", e.message);
  }

  // 2. Qdrant: xóa collection để xóa hết points (hoặc delete by filter type=property)
  const qdrantUrl = process.env.QDRANT_URL ?? "http://localhost:6333";
  const collection = process.env.QDRANT_COLLECTION ?? "agent_memory";

  try {
    const client = new QdrantClient({ url: qdrantUrl });
    const collections = await client.getCollections();
    if (collections.collections.some((c) => c.name === collection)) {
      // Xóa toàn bộ points có metadata.type = "property"
      const { v5: uuid } = await import("uuid");
      const PROP_NAMESPACE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
      // Qdrant không có filter delete dễ dàng - ta cần scroll + delete từng batch
      // Hoặc đơn giản: drop và recreate collection (mất cả memory)
      // User muốn xóa "dữ liệu cũ" - có thể chỉ cần xóa properties. Vì properties dùng chung collection với captions,
      // ta không thể drop collection. Phải scroll và delete points có type=property.
      const { points } = await client.scroll(collection, {
        filter: {
          must: [{ key: "type", match: { value: "property" } }],
        },
        limit: 1000,
        with_payload: false,
      });
      if (points.length > 0) {
        await client.delete(collection, {
          points: points.map((p) => p.id),
          wait: true,
        });
        console.log(`✓ Đã xóa ${points.length} points property từ Qdrant`);
      } else {
        console.log("✓ Không có points property trong Qdrant (hoặc đã xóa)");
      }
    } else {
      console.log("✓ Collection Qdrant chưa tồn tại, bỏ qua");
    }
  } catch (e: any) {
    console.error("Qdrant delete fail:", e.message);
  }

  console.log("\nXong. Chạy db:push nếu schema thay đổi: bun run db:push");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
