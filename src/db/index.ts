import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";

const globalForDb = globalThis as typeof globalThis & {
  __aegisSqlClient?: Sql;
  __aegisDb?: PostgresJsDatabase;
};

function createClient(): Sql {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is required. For Supabase: Project Settings → Database → " +
        "Connection string (use the Transaction pooler URL for the app runtime). " +
        "Local dev: postgresql://postgres:postgres@127.0.0.1:5432/app_db",
    );
  }
  const local = /localhost|127\.0\.0\.1/.test(databaseUrl);
  const hasSslMode = /[?&]sslmode=/.test(databaseUrl);
  return postgres(databaseUrl, {
    /**
     * Supabase-ready (official Drizzle + Supabase recommendation):
     * Supavisor/PgBouncer in transaction mode cannot keep prepared statements
     * across pooled connections, so they are disabled. TLS is required for any
     * remote host (Supabase rejects plain connections), unless the URL already
     * pins its own sslmode. Pool kept small for serverless concurrency.
     */
    prepare: false,
    ssl: local || hasSslMode ? undefined : "require",
    max: 5,
    connection: { application_name: "aegis-app" },
  });
}

/** Lazily-created shared postgres.js client (Drizzle + schema bootstrap). */
export function getSql(): Sql {
  globalForDb.__aegisSqlClient ??= createClient();
  return globalForDb.__aegisSqlClient;
}

function getDb(): PostgresJsDatabase {
  if (!globalForDb.__aegisDb) {
    globalForDb.__aegisDb = drizzle(getSql());
  }
  return globalForDb.__aegisDb;
}

/**
 * Lazily-initialized Drizzle client. Importing this module never touches the
 * environment, so `next build`/`next typegen` succeed on Vercel even before
 * DATABASE_URL exists there — only the first real query opens a connection.
 */
export const db = new Proxy({} as PostgresJsDatabase, {
  get(_target, prop) {
    const real = getDb() as unknown as Record<PropertyKey, unknown>;
    const value = real[prop];
    if (typeof value === "function") {
      return (value as (...args: unknown[]) => unknown).bind(real);
    }
    return value;
  },
});
