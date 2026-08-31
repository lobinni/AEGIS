import "dotenv/config";
import { defineConfig } from "drizzle-kit";

/**
 * drizzle-kit reads DATABASE_URL from the environment (or .env).
 *
 * Supabase note: for migrations prefer the Session/direct connection string
 * (port 5432) — DDL transactions are most reliable there. The app runtime
 * uses the Transaction pooler string (port 6543) via postgres.js with
 * prepare: false. Both live in the same DATABASE_URL slot at different times.
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});
