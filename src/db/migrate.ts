import { getSql } from "@/db";

/**
 * Idempotent schema bootstrap — the safety net for deployments where
 * `drizzle-kit push` was never run (e.g. a first Vercel + Supabase deploy).
 *
 * `ensureSchema()` is invoked once per server instance from the Next.js
 * instrumentation hook, and is also callable on demand via GET /api/bootstrap.
 * All statements are IF NOT EXISTS, so re-running is always harmless.
 */

const DDL = `
CREATE TABLE IF NOT EXISTS "accounts" (
  "address" text PRIMARY KEY NOT NULL,
  "balance_wei" numeric(78,0) DEFAULT '0' NOT NULL,
  "last_faucet_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "disputes" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "category" text NOT NULL,
  "title" text NOT NULL,
  "description" text NOT NULL,
  "claimant" text NOT NULL,
  "respondent" text NOT NULL,
  "amount_wei" numeric(78,0) NOT NULL,
  "status" text DEFAULT 'open' NOT NULL,
  "joined" boolean DEFAULT false NOT NULL,
  "joined_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "evidence_deadline" timestamp with time zone NOT NULL,
  "ready_claimant" boolean DEFAULT false NOT NULL,
  "ready_respondent" boolean DEFAULT false NOT NULL,
  "verdict" text,
  "reasoning" text,
  "rounds" integer DEFAULT 0 NOT NULL,
  "resolved_at" timestamp with time zone,
  "defaulted" boolean DEFAULT false NOT NULL,
  "executed" boolean DEFAULT false NOT NULL,
  "executed_at" timestamp with time zone,
  "payout_claimant_wei" numeric(78,0) DEFAULT '0' NOT NULL,
  "payout_respondent_wei" numeric(78,0) DEFAULT '0' NOT NULL,
  "arb_report" jsonb
);

CREATE TABLE IF NOT EXISTS "evidence" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "dispute_id" bigint NOT NULL,
  "side" text NOT NULL,
  "submitter" text NOT NULL,
  "description" text NOT NULL,
  "url" text DEFAULT '' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "evidence_dispute_id_disputes_id_fk"
    FOREIGN KEY ("dispute_id") REFERENCES "disputes"("id")
    ON DELETE cascade ON UPDATE no action
);

CREATE TABLE IF NOT EXISTS "ledger_entries" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "dispute_id" bigint,
  "address" text NOT NULL,
  "kind" text NOT NULL,
  "amount_wei" numeric(78,0) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "disputes_created_idx" ON "disputes" ("created_at");
CREATE INDEX IF NOT EXISTS "disputes_claimant_idx" ON "disputes" ("claimant");
CREATE INDEX IF NOT EXISTS "disputes_respondent_idx" ON "disputes" ("respondent");
CREATE INDEX IF NOT EXISTS "disputes_status_idx" ON "disputes" ("status");
CREATE INDEX IF NOT EXISTS "evidence_dispute_idx" ON "evidence" ("dispute_id");
CREATE INDEX IF NOT EXISTS "ledger_address_idx" ON "ledger_entries" ("address");
`;

const TABLES = ["accounts", "disputes", "evidence", "ledger_entries"] as const;

const globalForMigrate = globalThis as typeof globalThis & {
  __aegisSchemaReady?: boolean;
};

export async function ensureSchema(): Promise<void> {
  if (globalForMigrate.__aegisSchemaReady) return;
  const sql = getSql();
  try {
    // Simple-protocol batch: one implicit transaction; concurrent cold-start
    // races are harmless (every statement is IF NOT EXISTS).
    await sql.unsafe(DDL).simple();
    globalForMigrate.__aegisSchemaReady = true;
  } catch (err) {
    // A concurrent bootstrap may legitimately collide; only rethrow when the
    // tables are genuinely still missing afterwards.
    const existing = await existingTables().catch(() => [] as string[]);
    if (existing.length === TABLES.length) {
      globalForMigrate.__aegisSchemaReady = true;
      return;
    }
    throw err;
  }
}

async function existingTables(): Promise<string[]> {
  const sql = getSql();
  const rows = await sql<Record<string, string | null>[]>`
    select
      to_regclass('public.accounts')       as accounts,
      to_regclass('public.disputes')       as disputes,
      to_regclass('public.evidence')       as evidence,
      to_regclass('public.ledger_entries') as ledger_entries
  `;
  return Object.values(rows[0] ?? {}).filter(Boolean) as string[];
}

/** Per-table visibility for the /api/bootstrap diagnostics endpoint. */
export async function schemaStatus(): Promise<
  Record<string, { exists: boolean; rows: number | null }>
> {
  await ensureSchema();
  const sql = getSql();
  const out: Record<string, { exists: boolean; rows: number | null }> = {};
  for (const t of TABLES) {
    const reg = await sql<{ name: string | null }[]>`
      select to_regclass(${"public." + t}) as name
    `;
    const exists = Boolean(reg[0]?.name);
    let rows: number | null = null;
    if (exists) {
      const c = await sql<{ n: number }[]>`
        select count(*)::int as n from ${sql(t)}
      `;
      rows = c[0]?.n ?? 0;
    }
    out[t] = { exists, rows };
  }
  return out;
}
