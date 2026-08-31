"use client";

/**
 * Client SDK — mirrors the reference frontend's lib/genlayer.js one-to-one:
 * every method maps to a single ledger/consensus endpoint. The frontend
 * reads/writes only through this client; an unreachable backend is a hard,
 * visible state on every view.
 */

export {
  CATEGORIES,
  VERDICTS,
  EVIDENCE_WINDOW_SECONDS,
  TITLE_MIN,
  TITLE_MAX,
  DESC_MIN,
  DESC_MAX,
  EVIDENCE_DESC_MIN,
  EVIDENCE_DESC_MAX,
  PAGE_MAX,
  fmtGen,
  splitGen,
  parseGenToWei,
  shortAddress,
  sameAddress,
  isValidEvidenceUrl,
  fmtRemaining,
  timeAgo,
} from "@/lib/shared";

// ── View shapes (snake_case, identical to the contract's views) ─────────────

export interface DisputeSummary {
  id: number;
  category: string;
  title: string;
  status: string;
  verdict: string;
  claimant: string;
  respondent: string;
  amount_wei: string;
  created_at: number;
  resolved_at: number;
  joined: boolean;
  defaulted: boolean;
  executed: boolean;
  ready_claimant: boolean;
  ready_respondent: boolean;
  evidence_deadline: number;
  locked_wei: string;
  claimant_evidence_count: number;
  respondent_evidence_count: number;
}

export interface EvidenceItem {
  submitter: string;
  description: string;
  url: string;
  submitted_at: number;
}

export interface ArbSource {
  side: "claimant" | "respondent";
  description: string;
  url: string;
  reachable: boolean;
  excerpt: string;
}

export interface DisputeRecord extends DisputeSummary {
  description: string;
  reasoning: string;
  rounds: number;
  claimant_stake_wei: string;
  respondent_stake_wei: string;
  payout_claimant_wei: string;
  payout_respondent_wei: string;
  executed_at: number;
  claimant_evidence: EvidenceItem[];
  respondent_evidence: EvidenceItem[];
  arb_engine: string;
  arb_agreement: string;
  arb_validators: number;
  arb_consensus_date: string;
  arb_signals: string[];
  sources: ArbSource[];
}

export interface FileDisputeForm {
  category: string;
  title: string;
  description: string;
  respondent: string;
  amountWei: string;
  evidenceDescription: string;
  evidenceUrl: string;
}

// ── Transport ────────────────────────────────────────────────────────────────

import { getWallet } from "@/lib/wallet";

/**
 * Read path selection:
 *  - Injected (MetaMask) sessions — and anonymous browsing — read the REAL
 *    deployed contract through /api/onchain/* (genlayer-js on the server).
 *  - Local test wallets read the hosted demo ledger (/api/*), their sandbox.
 *  - Without a configured contract everything falls back to the ledger.
 */
function readBase(): string {
  const configured = /^0x[0-9a-fA-F]{40}$/.test(CONTRACT_ADDRESS);
  if (!configured) return "/api";
  return getWallet().kind === "local" ? "/api" : "/api/onchain";
}

async function call<T>(
  path: string,
  opts?: { method?: string; body?: Record<string, unknown> },
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: opts?.method ?? "GET",
      headers: opts?.body ? { "content-type": "application/json" } : undefined,
      body: opts?.body ? JSON.stringify(opts.body) : undefined,
      cache: "no-store",
    });
  } catch {
    throw new Error("Cannot reach the AEGIS ledger — the chain is unreachable.");
  }
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(typeof json.error === "string" ? json.error : `HTTP ${res.status}`);
  }
  return json as T;
}

const withAccount = (account: string, extra?: Record<string, unknown>) => ({
  account,
  ...(extra ?? {}),
});

// ── Deployment wiring ────────────────────────────────────────────────────────

/**
 * Address of the deployed AEGIS Intelligent Contract on the GenLayer Studio
 * network (chain 61999). Resolution order:
 * NEXT_PUBLIC_AEGIS_CONTRACT_ADDRESS (env) → deployments.json. An empty
 * result means "not deployed yet" — the dApp surfaces that as a visible
 * state instead of pretending otherwise.
 */
import deployments from "../../deployments.json";

export const CONTRACT_ADDRESS = (
  process.env.NEXT_PUBLIC_AEGIS_CONTRACT_ADDRESS ||
  deployments.studionet.contracts.AEGISArbitration.address ||
  ""
).trim();

/** Block explorer base URL for the deployed contract on Studionet. */
export const STUDIONET_EXPLORER = "https://explorer-studio.genlayer.com";

/** Human label for the consensus engine that produced a ruling. */
export function engineLabel(engine: string): string {
  if (!engine) return "";
  if (engine.startsWith("openai-compatible")) return "Language-model consensus";
  return "Deterministic validator consensus";
}

// ── Client (same method names as the reference genlayer client) ─────────────

export const client = {
  /** Deployed contract address ("" when not configured yet). */
  address: CONTRACT_ADDRESS,

  async allSummaries(): Promise<{ total: number; summaries: DisputeSummary[] }> {
    const data = await call<{ total: number; items: DisputeSummary[] }>(
      `${readBase()}/disputes?offset=0&limit=50`,
    );
    return { total: data.total, summaries: data.items };
  },

  async listDisputes(
    offset: number,
    limit: number,
    account?: string,
  ): Promise<{ total: number; items: DisputeSummary[] }> {
    const q = account ? `&account=${encodeURIComponent(account)}` : "";
    return call(`${readBase()}/disputes?offset=${offset}&limit=${limit}${q}`);
  },

  getDispute(id: number | string): Promise<{ record: DisputeRecord }> {
    return call(`${readBase()}/disputes/${id}`);
  },

  async fileDispute(form: FileDisputeForm, account: string): Promise<number> {
    const data = await call<{ id: number }>(
      "/api/disputes",
      { method: "POST", body: withAccount(account, { ...form }) },
    );
    return data.id;
  },

  joinDispute(id: number | string, _amountWei: string, account: string) {
    return call(`/api/disputes/${id}/join`, { method: "POST", body: withAccount(account) });
  },

  submitEvidence(id: number | string, description: string, url: string, account: string) {
    return call(`/api/disputes/${id}/evidence`, {
      method: "POST",
      body: withAccount(account, { description, url }),
    });
  },

  signalReady(id: number | string, account: string) {
    return call(`/api/disputes/${id}/ready`, { method: "POST", body: withAccount(account) });
  },

  requestResolution(id: number | string, account: string): Promise<{ record: DisputeRecord }> {
    return call(`/api/disputes/${id}/resolve`, { method: "POST", body: withAccount(account) });
  },

  defaultJudgment(id: number | string, account: string) {
    return call(`/api/disputes/${id}/default`, { method: "POST", body: withAccount(account) });
  },

  executeRuling(id: number | string, account: string) {
    return call(`/api/disputes/${id}/execute`, { method: "POST", body: withAccount(account) });
  },

  faucet(account: string): Promise<{ balance_wei: string; credited_wei: string }> {
    return call(`/api/faucet`, { method: "POST", body: withAccount(account) });
  },

  balance(account: string): Promise<{ balance_wei: string }> {
    return call(`/api/accounts/${account}`);
  },
};
