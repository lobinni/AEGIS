import { NextResponse } from "next/server";
import { ChainError } from "@/lib/server/chain";
import { isAddress } from "@/lib/shared";

/** Concatenate an error's message with its whole .cause chain (drizzle wraps pg errors). */
function errorText(err: unknown): string {
  let text = "";
  let cur: unknown = err;
  let depth = 0;
  while (cur instanceof Error && depth < 6) {
    text += " | " + cur.message;
    cur = (cur as { cause?: unknown }).cause;
    depth++;
  }
  return text;
}

/** Map engine errors onto HTTP responses — failures are hard, visible states. */
export function fail(err: unknown) {
  if (err instanceof ChainError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  let message = err instanceof Error ? err.message : String(err);
  const full = errorText(err);
  // Make the two classic first-deploy misconfigurations actionable.
  const missingTables =
    /"?(accounts|disputes|evidence|ledger_entries)"? does not exist/i.test(full) ||
    (/Failed query/i.test(full) &&
      /"(accounts|disputes|evidence|ledger_entries)"/.test(full));
  if (missingTables) {
    message +=
      " — the escrow-ledger tables are missing in this database. Open /api/bootstrap once " +
      "(it runs CREATE TABLE IF NOT EXISTS) or run `npx drizzle-kit push` against the same DATABASE_URL. " +
      "New deployments also auto-bootstrap at server startup.";
  } else if (/DATABASE_URL is required/i.test(full)) {
    message +=
      " — set DATABASE_URL in your hosting provider's environment variables and redeploy.";
  } else if (/ENOTFOUND|EAI_AGAIN|ENETUNREACH|ETIMEDOUT|ECONNREFUSED/i.test(full)) {
    message +=
      " — the database host in DATABASE_URL cannot be reached from this network. " +
      "If you used the Supabase direct host (db.<ref>.supabase.co): it is IPv6-only " +
      "for newer projects and fails from many serverless networks (ENOTFOUND/ENETUNREACH). " +
      "Use the transaction pooler instead: " +
      "postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres " +
      "(Supabase → Project Settings → Database → Connection string → Transaction), then redeploy.";
  }
  return NextResponse.json({ error: message }, { status: 500 });
}

export function parseId(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new ChainError("unknown dispute", 404);
  return id;
}

export function requireAccount(body: Record<string, unknown>): string {
  const account = typeof body?.account === "string" ? body.account.trim() : "";
  if (!isAddress(account)) throw new ChainError("connect your wallet first", 401);
  return account;
}
