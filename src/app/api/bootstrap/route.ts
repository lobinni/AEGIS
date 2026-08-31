import { NextResponse } from "next/server";
import { ensureSchema, schemaStatus } from "@/db/migrate";

export const dynamic = "force-dynamic";

/**
 * One-shot schema bootstrap + diagnostics.
 *
 * Open https://<your-app>/api/bootstrap once after pointing DATABASE_URL at a
 * fresh database — it creates any missing tables (same DDL as
 * `drizzle-kit push`) and reports per-table row counts. Idempotent: safe to
 * re-run at any time. The server also runs this automatically at startup via
 * the instrumentation hook.
 */
export async function GET() {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "DATABASE_URL is not set. Add it to your environment (Vercel → Project → Settings → Environment Variables) and redeploy.",
      },
      { status: 500 },
    );
  }
  try {
    await ensureSchema();
    const tables = await schemaStatus();
    return NextResponse.json({ ok: true, schema: "ready", tables });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error:
          (err instanceof Error ? err.message : String(err)) +
          " — if this is a fresh database, check that DATABASE_URL is reachable and permits CREATE TABLE.",
      },
      { status: 500 },
    );
  }
}
