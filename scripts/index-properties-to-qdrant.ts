import "dotenv/config";
import * as props from "../src/db/queries/properties";
import { indexProperty } from "../src/indexing/PropertyIndexer";

async function main() {
  const list = await props.listProperties(100);
  console.log(`Đang index ${list.length} BĐS vào Qdrant...`);
  for (const p of list) {
    await indexProperty(p);
    console.log(`✓ ${p.title.slice(0, 50)}...`);
  }
  console.log(`\nĐã index ${list.length} BĐS vào Qdrant.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
