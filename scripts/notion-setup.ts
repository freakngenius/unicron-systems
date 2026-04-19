import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local", override: true });

import { setupNotionDatabases } from "../lib/notion-setup";

async function main() {
  const res = await setupNotionDatabases();
  console.log("\nNotion databases:");
  for (const [k, v] of Object.entries(res)) {
    console.log(`  ${k.padEnd(24)} ${v}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
