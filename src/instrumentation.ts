/**
 * Next.js instrumentation hook — runs once when a server instance starts.
 *
 * Bootstraps the escrow-ledger schema (CREATE TABLE IF NOT EXISTS) so a fresh
 * deployment (e.g. the first Vercel release) works without a manual
 * `drizzle-kit push`. Fully idempotent; skipped silently when no DATABASE_URL
 * is configured (build time, unconfigured envs) — the API then surfaces its
 * hard, visible error state instead.
 *
 * Set AEGIS_BOOTSTRAP_SCHEMA=0 to disable (managing migrations yourself).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.AEGIS_BOOTSTRAP_SCHEMA === "0") return;
  if (!process.env.DATABASE_URL) return;
  try {
    const { ensureSchema } = await import("./db/migrate");
    await ensureSchema();
    console.log("[aegis] escrow-ledger schema is ready");
  } catch (err) {
    // Never crash the server on bootstrap; API responses carry the error.
    console.error(
      "[aegis] schema bootstrap failed:",
      err instanceof Error ? err.message : err,
    );
  }
}
