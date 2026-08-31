import { db } from "@/db";
import {
  accounts,
  disputes,
  evidence,
  ledgerEntries,
  type ArbReport,
  type DisputeRow,
} from "@/db/schema";
import { and, desc, eq, lt, sql } from "drizzle-orm";
import {
  CATEGORIES,
  DESC_MAX,
  DESC_MIN,
  EVIDENCE_DESC_MAX,
  EVIDENCE_DESC_MIN,
  EVIDENCE_WINDOW_SECONDS,
  FAUCET_AMOUNT_WEI,
  FAUCET_COOLDOWN_MS,
  PAGE_MAX,
  TITLE_MAX,
  TITLE_MIN,
  isAddress,
  isValidAmountWei,
  isValidEvidenceUrl,
  sameAddress,
} from "@/lib/shared";
import { arbitrate } from "@/lib/server/arbitrator";
import { ensureSchema } from "@/db/migrate";

/**
 * Self-healing schema guard: every engine entry point runs the idempotent
 * bootstrap before its first query (cached afterwards — near-zero cost).
 * This makes fresh deployments (Vercel + empty Supabase project) work even
 * when the server-startup instrumentation hook did not run for the lambda
 * serving the request.
 */

/**
 * AEGIS consensus-ledger engine — server-side analogue of contracts/aegis.py.
 *
 * Every economic rule of the reference GenLayer intelligent contract is
 * re-implemented here against PostgreSQL, inside ACID transactions with
 * row-level locks (SELECT ... FOR UPDATE):
 *
 *  - file_dispute locks the claimant stake exactly (exact-value enforced).
 *  - join_dispute locks the respondent's identical stake; never joining
 *    loses by default judgment once the evidence window ends.
 *  - Exactly ONE AI ruling per dispute; validators fetch evidence themselves
 *    (see arbitrator.ts); dead links degrade to explicit notes.
 *  - execute_ruling is permissionless, deterministic and immediate — the
 *    winner sweeps both stakes; SPLIT/DISMISSED refund everyone their own.
 *  - Checks-effects-interactions: payout legs recorded before credits; the
 *    ledger never holds balances beyond active escrow.
 */

export class ChainError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

// ── Account ledger ───────────────────────────────────────────────────────────

async function lockAccount(tx: DbTx, address: string) {
  await tx
    .insert(accounts)
    .values({ address })
    .onConflictDoNothing({ target: accounts.address });
  const rows = await tx
    .select()
    .from(accounts)
    .where(eq(accounts.address, address))
    .for("update");
  return rows[0];
}

async function applyDelta(
  tx: DbTx,
  address: string,
  deltaWei: bigint,
  kind: "faucet" | "lock" | "payout" | "refund",
  disputeId: number | null,
) {
  const acct = await lockAccount(tx, address);
  const next = BigInt(acct.balanceWei) + deltaWei;
  if (next < 0n) {
    throw new ChainError(
      "Insufficient balance to lock this stake — top up from the testnet faucet in the wallet menu.",
    );
  }
  await tx
    .update(accounts)
    .set({ balanceWei: next.toString(), updatedAt: new Date() })
    .where(eq(accounts.address, address));
  await tx.insert(ledgerEntries).values({
    disputeId,
    address,
    kind,
    amountWei: deltaWei.toString(),
  });
}

// ── Record mapping (same snake_case view shape as the contract) ─────────────

function evidenceFrom(rows: { side: string; submitter: string; description: string; url: string; createdAt: Date }[]) {
  const map = (side: "claimant" | "respondent") =>
    rows
      .filter((e) => e.side === side)
      .map((e) => ({
        submitter: e.submitter,
        description: e.description,
        url: e.url,
        submitted_at: Math.floor(e.createdAt.getTime() / 1000),
      }));
  return { claimant: map("claimant"), respondent: map("respondent") };
}

function lockedWei(d: DisputeRow): string {
  if (d.executed) return "0";
  const a = BigInt(d.amountWei);
  return (a + (d.joined ? a : 0n)).toString();
}

export function summaryOf(d: DisputeRow, evCounts?: { claimant: number; respondent: number }) {
  return {
    id: d.id,
    category: d.category,
    title: d.title,
    status: d.status,
    verdict: d.verdict ?? "",
    claimant: d.claimant,
    respondent: d.respondent,
    amount_wei: d.amountWei,
    created_at: Math.floor(d.createdAt.getTime() / 1000),
    resolved_at: d.resolvedAt ? Math.floor(d.resolvedAt.getTime() / 1000) : 0,
    joined: d.joined,
    defaulted: d.defaulted,
    executed: d.executed,
    ready_claimant: d.readyClaimant,
    ready_respondent: d.readyRespondent,
    evidence_deadline: Math.floor(d.evidenceDeadline.getTime() / 1000),
    locked_wei: lockedWei(d),
    claimant_evidence_count: evCounts?.claimant ?? 0,
    respondent_evidence_count: evCounts?.respondent ?? 0,
  };
}

// ── Views ────────────────────────────────────────────────────────────────────

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function getDisputeView(id: number) {
  await ensureSchema();
  const rows = await db.select().from(disputes).where(eq(disputes.id, id));
  const d = rows[0];
  if (!d) throw new ChainError("unknown dispute", 404);
  const evRows = await db
    .select()
    .from(evidence)
    .where(eq(evidence.disputeId, id))
    .orderBy(evidence.createdAt);
  return fullRecord(d, evRows);
}

function fullRecord(d: DisputeRow, evRows: (typeof evidence.$inferSelect)[]) {
  const ev = evidenceFrom(evRows);
  const report = (d.arbReport ?? null) as ArbReport | null;
  return {
    ...summaryOf(d, { claimant: ev.claimant.length, respondent: ev.respondent.length }),
    description: d.description,
    reasoning: d.reasoning ?? "",
    rounds: d.rounds,
    claimant_stake_wei: d.amountWei,
    respondent_stake_wei: d.joined ? d.amountWei : "0",
    payout_claimant_wei: d.payoutClaimantWei,
    payout_respondent_wei: d.payoutRespondentWei,
    executed_at: d.executedAt ? Math.floor(d.executedAt.getTime() / 1000) : 0,
    claimant_evidence: ev.claimant,
    respondent_evidence: ev.respondent,
    arb_engine: report?.engine ?? "",
    arb_agreement: report?.agreement ?? "",
    arb_validators: report?.validators ?? 0,
    arb_consensus_date: report?.consensusDate ?? "",
    arb_signals: report?.signals ?? [],
    sources: report?.sources ?? [],
  };
}

export async function listDisputes(offset: number, limit: number, account?: string) {
  await ensureSchema();
  const capped = Math.min(Math.max(1, limit), PAGE_MAX);
  const start = Math.max(0, offset);
  const filter = account
    ? sql`(${disputes.claimant} = ${account} OR ${disputes.respondent} = ${account})`
    : undefined;

  const totalRows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(disputes)
    .where(filter);
  const rows = await db
    .select()
    .from(disputes)
    .where(filter)
    .orderBy(desc(disputes.createdAt), desc(disputes.id))
    .limit(capped)
    .offset(start);

  const ids = rows.map((r) => r.id);
  const counts = new Map<number, { claimant: number; respondent: number }>();
  if (ids.length) {
    const evRows = await db
      .select({ disputeId: evidence.disputeId, side: evidence.side, n: sql<number>`count(*)::int` })
      .from(evidence)
      .where(sql`${evidence.disputeId} IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`)
      .groupBy(evidence.disputeId, evidence.side);
    for (const r of evRows) {
      const c = counts.get(r.disputeId) ?? { claimant: 0, respondent: 0 };
      if (r.side === "claimant") c.claimant = r.n;
      else c.respondent = r.n;
      counts.set(r.disputeId, c);
    }
  }

  return {
    total: totalRows[0]?.n ?? 0,
    items: rows.map((d) => summaryOf(d, counts.get(d.id))),
  };
}

export async function getBalance(address: string) {
  await ensureSchema();
  const rows = await db.select().from(accounts).where(eq(accounts.address, address));
  return { address, balance_wei: rows[0]?.balanceWei ?? "0" };
}

export async function faucet(address: string) {
  await ensureSchema();
  if (!isAddress(address)) throw new ChainError("invalid address");
  return db.transaction(async (tx) => {
    const acct = await lockAccount(tx, address);
    if (acct.lastFaucetAt && Date.now() - acct.lastFaucetAt.getTime() < FAUCET_COOLDOWN_MS) {
      const waitMin = Math.ceil(
        (FAUCET_COOLDOWN_MS - (Date.now() - acct.lastFaucetAt.getTime())) / 60000,
      );
      throw new ChainError(`Faucet cooling down — try again in ~${waitMin} min.`);
    }
    await applyDelta(tx, address, FAUCET_AMOUNT_WEI, "faucet", null);
    await tx
      .update(accounts)
      .set({ lastFaucetAt: new Date(), updatedAt: new Date() })
      .where(eq(accounts.address, address));
    const rows = await tx.select().from(accounts).where(eq(accounts.address, address));
    return { address, balance_wei: rows[0].balanceWei, credited_wei: FAUCET_AMOUNT_WEI.toString() };
  });
}

// ── Writes ───────────────────────────────────────────────────────────────────

export interface FileDisputeInput {
  category: string;
  title: string;
  description: string;
  respondent: string;
  amountWei: string;
  evidenceDescription?: string;
  evidenceUrl?: string;
}

export async function fileDispute(input: FileDisputeInput, claimant: string) {
  await ensureSchema();
  const cat = input.category.trim().toLowerCase();
  if (!(CATEGORIES as readonly string[]).includes(cat))
    throw new ChainError("invalid category");
  const title = input.title.trim();
  if (title.length < TITLE_MIN || title.length > TITLE_MAX)
    throw new ChainError(`title must be ${TITLE_MIN}-${TITLE_MAX} characters`);
  const description = input.description.trim();
  if (description.length < DESC_MIN || description.length > DESC_MAX)
    throw new ChainError(`description must be ${DESC_MIN}-${DESC_MAX} characters`);
  if (!isAddress(input.respondent)) throw new ChainError("invalid respondent address");
  if (sameAddress(input.respondent, claimant))
    throw new ChainError("respondent must be a different address than yours");
  if (!isValidAmountWei(input.amountWei)) throw new ChainError("amount out of range");

  const evDesc = (input.evidenceDescription ?? "").trim();
  const evUrl = (input.evidenceUrl ?? "").trim();
  if (evDesc) {
    if (evDesc.length < EVIDENCE_DESC_MIN || evDesc.length > EVIDENCE_DESC_MAX)
      throw new ChainError(
        `evidence description must be ${EVIDENCE_DESC_MIN}-${EVIDENCE_DESC_MAX} characters`,
      );
    if (!isValidEvidenceUrl(evUrl)) throw new ChainError("invalid evidence url (https only)");
  }

  const amount = BigInt(input.amountWei);
  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(disputes)
      .values({
        category: cat,
        title,
        description,
        claimant,
        respondent: input.respondent.trim(),
        amountWei: amount.toString(),
        evidenceDeadline: new Date(Date.now() + EVIDENCE_WINDOW_SECONDS * 1000),
      })
      .returning({ id: disputes.id });
    const id = inserted[0].id;
    // The claimant's stake IS the disputed amount (exact-value enforced).
    await applyDelta(tx, claimant, -amount, "lock", id);
    if (evDesc) {
      await tx.insert(evidence).values({
        disputeId: id,
        side: "claimant",
        submitter: claimant,
        description: evDesc,
        url: evUrl,
      });
    }
    return { id };
  });
}

async function lockDispute(tx: DbTx, id: number): Promise<DisputeRow> {
  const rows = await tx
    .select()
    .from(disputes)
    .where(eq(disputes.id, id))
    .for("update");
  if (!rows[0]) throw new ChainError("unknown dispute", 404);
  return rows[0];
}

export async function joinDispute(id: number, respondent: string) {
  await ensureSchema();
  return db.transaction(async (tx) => {
    const d = await lockDispute(tx, id);
    if (!sameAddress(respondent, d.respondent))
      throw new ChainError("only the named respondent can join");
    if (d.status !== "open") throw new ChainError("dispute is not open");
    if (d.joined) throw new ChainError("already joined");
    const amount = BigInt(d.amountWei);
    // Late joins are allowed until a default judgment lands; a late joiner
    // accepts the evidence as it stands.
    await applyDelta(tx, respondent, -amount, "lock", id);
    await tx
      .update(disputes)
      .set({ joined: true, joinedAt: new Date() })
      .where(eq(disputes.id, id));
    return { joined: true };
  });
}

export async function signalReady(id: number, account: string) {
  await ensureSchema();
  return db.transaction(async (tx) => {
    const d = await lockDispute(tx, id);
    if (d.status !== "open") throw new ChainError("dispute is not open");
    const party = sameAddress(account, d.claimant)
      ? "claimant"
      : sameAddress(account, d.respondent)
        ? "respondent"
        : "";
    if (!party) throw new ChainError("only dispute parties can signal ready");
    if (!d.joined) throw new ChainError("respondent has not joined");
    if (Date.now() > d.evidenceDeadline.getTime())
      throw new ChainError("evidence window already closed");
    if ((party === "claimant" && d.readyClaimant) || (party === "respondent" && d.readyRespondent))
      throw new ChainError("already signaled ready");
    await tx
      .update(disputes)
      .set(party === "claimant" ? { readyClaimant: true } : { readyRespondent: true })
      .where(eq(disputes.id, id));
    return { ready: party };
  });
}

export async function submitEvidence(id: number, account: string, description: string, url: string) {
  await ensureSchema();
  const desc = description.trim();
  if (desc.length < EVIDENCE_DESC_MIN || desc.length > EVIDENCE_DESC_MAX)
    throw new ChainError(
      `description must be ${EVIDENCE_DESC_MIN}-${EVIDENCE_DESC_MAX} characters`,
    );
  const cleanUrl = url.trim();
  if (!isValidEvidenceUrl(cleanUrl)) throw new ChainError("invalid url (https only)");

  return db.transaction(async (tx) => {
    const d = await lockDispute(tx, id);
    if (d.status !== "open") throw new ChainError("dispute is not open");
    if (Date.now() > d.evidenceDeadline.getTime())
      throw new ChainError("evidence window closed");
    if (d.readyClaimant && d.readyRespondent)
      throw new ChainError("evidence window closed early by mutual agreement");
    const party = sameAddress(account, d.claimant)
      ? "claimant"
      : sameAddress(account, d.respondent)
        ? "respondent"
        : "";
    if (!party) throw new ChainError("only dispute parties can submit evidence");
    await tx.insert(evidence).values({
      disputeId: id,
      side: party,
      submitter: account,
      description: desc,
      url: cleanUrl,
    });
    return { ok: true };
  });
}

export async function requestResolution(id: number, account: string) {
  await ensureSchema();
  // Phase 1: lock the ONE adjudication (exactly one ruling per dispute).
  const snapshot = await db.transaction(async (tx) => {
    const d = await lockDispute(tx, id);
    if (d.status !== "open")
      throw new ChainError("resolution already requested or concluded");
    const isParty = sameAddress(account, d.claimant) || sameAddress(account, d.respondent);
    if (!isParty) throw new ChainError("only parties can request resolution");
    if (!d.joined)
      throw new ChainError("respondent has not joined; wait for default judgment");
    const windowClosed = Date.now() > d.evidenceDeadline.getTime();
    const bothReady = d.readyClaimant && d.readyRespondent;
    if (!windowClosed && !bothReady)
      throw new ChainError(
        "evidence window still open — both parties must signal ready to close early",
      );
    await tx
      .update(disputes)
      .set({ status: "under_review" })
      .where(eq(disputes.id, id));
    const evRows = await tx.select().from(evidence).where(eq(evidence.disputeId, id));
    return { d, evRows };
  });

  // Phase 2: validators fetch evidence + reach comparative consensus.
  try {
    const ev = evidenceFrom(snapshot.evRows);
    const ruling = await arbitrate({
      id: snapshot.d.id,
      category: snapshot.d.category,
      title: snapshot.d.title,
      description: snapshot.d.description,
      amountWei: snapshot.d.amountWei,
      claimant: snapshot.d.claimant,
      respondent: snapshot.d.respondent,
      claimantEvidence: ev.claimant,
      respondentEvidence: ev.respondent,
    });

    await db
      .update(disputes)
      .set({
        status: "resolved",
        verdict: ruling.verdict,
        reasoning: ruling.reasoning,
        rounds: 1,
        resolvedAt: new Date(),
        arbReport: ruling.report,
      })
      .where(and(eq(disputes.id, id), eq(disputes.status, "under_review")));
    return getDisputeView(id);
  } catch (err) {
    // Unparseable rulings revert instead of storing garbage.
    await db
      .update(disputes)
      .set({ status: "open" })
      .where(and(eq(disputes.id, id), eq(disputes.status, "under_review")));
    throw err;
  }
}

export async function defaultJudgment(id: number) {
  await ensureSchema();
  return db.transaction(async (tx) => {
    const d = await lockDispute(tx, id);
    if (d.status !== "open") throw new ChainError("dispute is not open");
    if (d.joined) throw new ChainError("respondent already joined");
    if (Date.now() <= d.evidenceDeadline.getTime())
      throw new ChainError("evidence window still open");
    await tx
      .update(disputes)
      .set({
        status: "resolved",
        verdict: "CLAIMANT_WINS",
        defaulted: true,
        rounds: 0,
        resolvedAt: new Date(),
        reasoning:
          "Default judgment: the named respondent never joined the dispute and never locked the matching stake before the evidence window closed. " +
          "The claimant wins by default; settlement returns the claimant's locked stake, and the default stands as a permanent public record.",
      })
      .where(eq(disputes.id, id));
    return { defaulted: true };
  });
}

export async function executeRuling(id: number) {
  await ensureSchema();
  // Permissionless deterministic settlement — effects before transfers.
  return db.transaction(async (tx) => {
    const d = await lockDispute(tx, id);
    if (d.status !== "resolved") throw new ChainError("can only execute resolved disputes");
    if (d.executed) throw new ChainError("already executed");

    const a = BigInt(d.amountWei);
    const stakeC = a;
    const stakeR = d.joined ? a : 0n;
    let payC = 0n;
    let payR = 0n;
    if (d.verdict === "CLAIMANT_WINS") {
      payC = stakeC + stakeR;
    } else if (d.verdict === "RESPONDENT_WINS") {
      payR = stakeC + stakeR;
    } else {
      payC = stakeC;
      payR = stakeR;
    }

    // Checks-effects (record payout legs) before interactions (credits).
    await tx
      .update(disputes)
      .set({
        executed: true,
        executedAt: new Date(),
        payoutClaimantWei: payC.toString(),
        payoutRespondentWei: payR.toString(),
      })
      .where(eq(disputes.id, id));

    if (payC > 0n)
      await applyDelta(tx, d.claimant, payC, d.verdict === "SPLIT_DECISION" || d.verdict === "DISMISSED" ? "refund" : "payout", id);
    if (payR > 0n)
      await applyDelta(tx, d.respondent, payR, d.verdict === "SPLIT_DECISION" || d.verdict === "DISMISSED" ? "refund" : "payout", id);
    return { executed: true, payout_claimant_wei: payC.toString(), payout_respondent_wei: payR.toString() };
  });
}

// Housekeeping helper used by the docket views: auto-record default judgments
// is intentionally NOT done implicitly (the contract requires the explicit
// permissionless call), but stale unjoined disputes are surfaced as
// "defaultable" so the UI can offer the action.
export async function countDefaultable(): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(disputes)
    .where(
      and(
        eq(disputes.status, "open"),
        eq(disputes.joined, false),
        lt(disputes.evidenceDeadline, new Date()),
      ),
    );
  return rows[0]?.n ?? 0;
}
