/**
 * Shared constants + pure helpers — the client SDK and the server
 * engine both import from here (mirrors lib/genlayer.js exports of the
 * reference frontend and the bounds hard-coded in the contract).
 */

// ── Bounds (identical to contracts/aegis.py) ────────────────────────────────
export const CATEGORIES = ["freelance", "dao_governance", "marketplace"] as const;
export type Category = (typeof CATEGORIES)[number];

export const VERDICTS = [
  "CLAIMANT_WINS",
  "RESPONDENT_WINS",
  "SPLIT_DECISION",
  "DISMISSED",
] as const;
export type Verdict = (typeof VERDICTS)[number];

export const EVIDENCE_WINDOW_SECONDS = 24 * 60 * 60; // join/evidence phase after filing
export const TITLE_MIN = 8;
export const TITLE_MAX = 120;
export const DESC_MIN = 20;
export const DESC_MAX = 4000;
export const EVIDENCE_DESC_MIN = 4;
export const EVIDENCE_DESC_MAX = 1000;
export const URL_MAX = 500;
export const AMOUNT_MAX_WEI = 10n ** 24n; // grief/dust guard
export const PAGE_MAX = 50; // get_disputes page size cap
export const MAX_EVIDENCE_FETCH_PER_SIDE = 3;
export const EVIDENCE_EXCERPT_CHARS = 2500;
export const FAUCET_AMOUNT_WEI = 10_000n * 10n ** 18n;
export const FAUCET_COOLDOWN_MS = 60 * 60 * 1000;

// ── Validation ───────────────────────────────────────────────────────────────
export const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export function isAddress(s: string): boolean {
  return ADDRESS_RE.test(s.trim());
}

export function sameAddress(a?: string | null, b?: string | null): boolean {
  return Boolean(a && b && a.trim().toLowerCase() === b.trim().toLowerCase());
}

/** https only, no spaces, no private/localhost hosts — mirrors the contract. */
export function isValidEvidenceUrl(raw: string): boolean {
  const t = raw.trim();
  if (!t) return true; // optional
  if (t.length > URL_MAX) return false;
  if (!t.startsWith("https://")) return false;
  if (t.includes(" ")) return false;
  let host = "";
  try {
    host = t.slice("https://".length).split("/")[0].split(":")[0].toLowerCase();
  } catch {
    return false;
  }
  if (!host || !host.includes(".")) return false;
  if (host === "localhost") return false;
  if (host.startsWith("127.") || host.startsWith("10.") || host.startsWith("192.168."))
    return false;
  if (host.startsWith("172.")) {
    const second = Number(host.split(".")[1]);
    if (Number.isFinite(second) && second >= 16 && second <= 31) return false;
  }
  return true;
}

export function isValidAmountWei(wei: string): boolean {
  try {
    const v = BigInt(wei);
    return v > 0n && v <= AMOUNT_MAX_WEI;
  } catch {
    return false;
  }
}

// ── Formatting ───────────────────────────────────────────────────────────────
/** Parse a GEN decimal string (up to 6 decimals) into wei. null when invalid. */
export function parseGenToWei(input: string): string | null {
  const t = input.trim();
  if (!/^\d+(\.\d{1,6})?$/.test(t)) return null;
  const [whole, frac = ""] = t.split(".");
  try {
    const wei = BigInt(whole) * 10n ** 18n + BigInt(frac.padEnd(6, "0")) * 10n ** 12n;
    if (wei <= 0n || wei > AMOUNT_MAX_WEI) return null;
    return wei.toString();
  } catch {
    return null;
  }
}

/** Human GEN amount from wei, up to 4 significant decimals, no unit. */
export function splitGen(wei: string | bigint | number): string {
  const v = BigInt(wei ?? 0);
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const whole = abs / 10n ** 18n;
  const frac = (abs % 10n ** 18n)
    .toString()
    .padStart(18, "0")
    .slice(0, 4)
    .replace(/0+$/, "");
  return `${neg ? "-" : ""}${whole.toString()}${frac ? "." + frac : ""}`;
}

/** GEN amount with thousands separators + unit. */
export function fmtGen(wei: string | bigint | number): string {
  const s = splitGen(wei);
  const [whole, frac] = s.split(".");
  const sign = whole.startsWith("-") ? "-" : "";
  const digits = sign ? whole.slice(1) : whole;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}${grouped}${frac ? "." + frac : ""} GEN`;
}

export function shortAddress(addr?: string | null, chars = 6): string {
  if (!addr) return "—";
  const a = addr.trim();
  if (a.length <= chars * 2 + 2) return a;
  return `${a.slice(0, chars + 2)}…${a.slice(-chars)}`;
}

export function fmtRemaining(ms: number): string {
  if (ms <= 0) return "closed";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m ${String(sec).padStart(2, "0")}s`;
  if (m > 0) return `${m}m ${String(sec).padStart(2, "0")}s`;
  return `${sec}s`;
}

export function timeAgo(epochSeconds: number): string {
  const d = Date.now() / 1000 - epochSeconds;
  if (d < 60) return "just now";
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}
