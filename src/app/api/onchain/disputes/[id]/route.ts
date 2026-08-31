import { NextResponse } from "next/server";
import { onchainEnabled, readContractValue } from "@/lib/server/genlayer";

export const dynamic = "force-dynamic";

/** Full on-chain dispute record via get_dispute, padded to the dApp view model. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    if (!onchainEnabled()) {
      return NextResponse.json({ error: "Arbitration contract not configured on-chain" }, { status: 503 });
    }
    const { id } = await ctx.params;
    const numId = Number(id);
    if (!Number.isInteger(numId) || numId <= 0) {
      return NextResponse.json({ error: "unknown dispute" }, { status: 404 });
    }
    const raw = (await readContractValue("get_dispute", [numId])) as Record<
      string,
      unknown
    > | null;
    if (!raw || !raw.id || Number(raw.id) === 0) {
      return NextResponse.json({ error: "unknown dispute" }, { status: 404 });
    }

    const amount = BigInt(String(raw.amount_wei ?? "0"));
    const joined = Boolean(raw.joined);
    const executed = Boolean(raw.executed);
    const locked = executed ? "0" : (amount + (joined ? amount : 0n)).toString();

    const record = {
      ...raw,
      id: Number(raw.id),
      amount_wei: String(raw.amount_wei ?? "0"),
      claimant_stake_wei: String(raw.claimant_stake_wei ?? amount.toString()),
      respondent_stake_wei: String(raw.respondent_stake_wei ?? (joined ? amount.toString() : "0")),
      payout_claimant_wei: String(raw.payout_claimant_wei ?? "0"),
      payout_respondent_wei: String(raw.payout_respondent_wei ?? "0"),
      locked_wei: locked,
      verdict: String(raw.verdict ?? ""),
      reasoning: String(raw.reasoning ?? ""),
      rounds: Number(raw.rounds ?? 0),
      resolved_at: Number(raw.resolved_at ?? 0),
      executed_at: 0,
      claimant_evidence: Array.isArray(raw.claimant_evidence) ? raw.claimant_evidence : [],
      respondent_evidence: Array.isArray(raw.respondent_evidence) ? raw.respondent_evidence : [],
      claimant_evidence_count: Array.isArray(raw.claimant_evidence)
        ? raw.claimant_evidence.length
        : 0,
      respondent_evidence_count: Array.isArray(raw.respondent_evidence)
        ? raw.respondent_evidence.length
        : 0,
      // On-chain rulings carry no hosted-arbitrator report; keep the panel honest.
      arb_engine: "GenLayer validator consensus",
      arb_agreement: "",
      arb_validators: 0,
      arb_consensus_date: "",
      arb_signals: [],
      sources: [],
    };
    return NextResponse.json({ record });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Studionet read failed: ${message}` }, { status: 502 });
  }
}
