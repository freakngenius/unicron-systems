import { config as loadEnv } from "dotenv";
import path from "node:path";

// Load .env.local for tests that need real env values. Unit tests should
// stub anything they touch; this is only for integration tests.
loadEnv({ path: path.resolve(process.cwd(), ".env.local") });
