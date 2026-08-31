/**
 * AEGIS — LIVE end-to-end acceptance run on the GenLayer Studio network.
 *
 * Drives the real deployed Intelligent Contract (contracts/aegis.py) on
 * Studionet (chain 61999) with real transactions: real stakes leave two
 * wallets, real GenLayer validators fetch the real evidence page themselves,
 * the LLM jury rules under comparative consensus, and the recorded payouts
 * are read back from chain.
 *
 * This script is the manual "does it really work on-chain" check for coders:
 * it deploys nothing and mutates nothing besides the dispute it files.
 *
 * Required configuration — either process env or the repo-root .env:
 *   GENLAYER_PRIVATE_KEY              claimant's funded private key
 *   GENLAYER_RESPONDENT_PRIVATE_KEY   respondent's funded private key
 *   AEGIS_CONTRACT_ADDRESS            deployed contract (see deployments.json)
 *   EVIDENCE_URL                      public https page whose content decides
 *                                     the case — e.g. a page you control whose
 *                                     text clearly admits non-payment
 * Optional:
 *   AMOUNT_GEN                        stake per side in whole GEN (default 1)
 *
 * Prerequisites:
 *   npm install            (installs genlayer-js)
 *
 * Usage:
 *   node scripts/e2e-live.mjs
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

let createClient, createAccount, studionet, TransactionStatus;
try {
  ({ createClient, createAccount } = await import("genlayer-js"));
  ({ studionet } = await import("genlayer-js/chains"));
  ({ TransactionStatus } = await import("genlayer-js/types"));
} catch {
  console.error(
    "\nMissing dependency: genlayer-js.\nInstall it first (from the repo root):\n" +
      "  npm install\n  # or: npm install -S genlayer-js\n",
  );
  process.exit(1);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, "..");

function loadDotEnv(path) {
  try {
    const out = {};
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#") || !t.includes("=")) continue;
      const k = t.slice(0, t.indexOf("=")).trim();
      const v = t.slice(t.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
      if (!(k in out)) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

const rootEnv = loadDotEnv(join(ROOT_DIR, ".env"));

function requireEnv(key) {
  const v = process.env[key] ?? rootEnv[key];
  if (!v) {
    console.error(`\nMissing ${key}. Add it to the repo-root .env:\n  ${key}=...\n`);
    process.exit(1);
  }
  return v;
}

function loadDeployments() {
  try {
    return JSON.parse(readFileSync(join(ROOT_DIR, "deployments.json"), "utf8"));
  } catch {
    return null;
  }
}
const registry = loadDeployments();
const registryAddress =
  registry?.studionet?.contracts?.AEGISArbitration?.address?.trim?.() ?? "";

const CONTRACT_ADDRESS =
  process.env.AEGIS_CONTRACT_ADDRESS ?? rootEnv.AEGIS_CONTRACT_ADDRESS ?? registryAddress;
if (!/^0x[0-9a-fA-F]{40}$/.test(CONTRACT_ADDRESS)) {
  console.error(
    "Missing/invalid contract address. Deploy contracts/aegis.py from\n" +
      "https://studio.genlayer.com/contracts, then set AEGIS_CONTRACT_ADDRESS in .env\n" +
      "(and mirror it into deployments.json).",
  );
  process.exit(1);
}

const CLAIMANT_KEY = requireEnv("GENLAYER_PRIVATE_KEY");
const RESPONDENT_KEY = requireEnv("GENLAYER_RESPONDENT_PRIVATE_KEY");
const EVIDENCE_URL = requireEnv("EVIDENCE_URL");
if (!EVIDENCE_URL.startsWith("https://")) {
  console.error("EVIDENCE_URL must be https:// — stronger source authentication (http blocked).");
  process.exit(1);
}
const AMOUNT_WEI = BigInt(process.env.AMOUNT_GEN || "1") * 10n ** 18n;

const claimant = createAccount(CLAIMANT_KEY);
const respondent = createAccount(RESPONDENT_KEY);
if (claimant.address.toLowerCase() === respondent.address.toLowerCase()) {
  console.error("Claimant and respondent keys must differ (the contract enforces this too).");
  process.exit(1);
}

const base = () => ({ chain: studionet });

async function write(client, functionName, args, value = 0n, label) {
  process.stdout.write(`[${label}] sending ${functionName}…`);
  const hash = await client.writeContract({
    address: CONTRACT_ADDRESS,
    functionName,
    args,
    value,
  });
  await client.waitForTransactionReceipt({
    hash,
    status: TransactionStatus.FINALIZED,
    interval: 5000,
    retries: 240, // consensus + live page fetches can take minutes
  });
  console.log(` ok (${hash.slice(0, 18)}…)`);
}

async function read(functionName, args = []) {
  // Fresh client each time: pure reads need no account.
  const c = createClient(base());
  return c.readContract({ address: CONTRACT_ADDRESS, functionName, args });
}

const fmtGen = (wei) => `${Number(BigInt(wei ?? 0n)) / 1e18} GEN`;

async function main() {
  console.log(
    `AEGIS live E2E on Studionet (chain 61999)\n` +
      `  contract : ${CONTRACT_ADDRESS}\n` +
      `  claimant : ${claimant.address}\n` +
      `  respondent: ${respondent.address}\n` +
      `  stake    : ${fmtGen(AMOUNT_WEI)} each\n` +
      `  evidence : ${EVIDENCE_URL}\n`,
  );

  // 0. Preflight: reachable + expected shape.
  const cfg = await read("view_config");
  if (!cfg || cfg.evidence_window_seconds === undefined) {
    throw new Error("view_config lacks evidence_window_seconds — unexpected contract shape.");
  }

  // AEGIS dispute ids are 1-based and sequential: next id = total + 1.
  const before = Number(await read("get_total_disputes"));
  const expectedId = before + 1;

  // 1. Claimant files and locks the stake (exact-value enforced).
  await write(
    createClient({ ...base(), account: claimant }),
    "file_dispute",
    [
      "freelance",
      "Live E2E: unpaid audit invoice",
      "Acceptance run: the linked evidence page contains an admission of non-payment by the respondent, so the verdict must follow what validators fetch.",
      respondent.address,
      AMOUNT_WEI,
      "The linked source is authoritative for this run.",
      EVIDENCE_URL,
    ],
    AMOUNT_WEI,
    "file",
  );

  // 2. Respondent joins and locks the matching stake.
  await write(
    createClient({ ...base(), account: respondent }),
    "join_dispute",
    [expectedId],
    AMOUNT_WEI,
    "join",
  );

  // 3. Both parties signal ready to close the evidence window early.
  await write(
    createClient({ ...base(), account: claimant }),
    "signal_ready",
    [expectedId],
    0n,
    "ready-claimant",
  );
  await write(
    createClient({ ...base(), account: respondent }),
    "signal_ready",
    [expectedId],
    0n,
    "ready-respondent",
  );

  // 4. The ONE ruling — validators fetch EVIDENCE_URL themselves (prompt-isolated).
  await write(
    createClient({ ...base(), account: claimant }),
    "request_resolution",
    [expectedId],
    0n,
    "resolve",
  );

  const rec = await read("get_dispute", [expectedId]);
  console.log(`\n[verdict] ${rec.verdict}\n[reasoning] ${rec.reasoning}\n`);
  if (!["CLAIMANT_WINS", "RESPONDENT_WINS", "SPLIT_DECISION", "DISMISSED"].includes(rec.verdict)) {
    throw new Error("On-chain verdict outside the allowed set.");
  }

  // 5. Immediate permissionless settlement.
  await write(
    createClient({ ...base(), account: respondent }),
    "execute_ruling",
    [expectedId],
    0n,
    "execute",
  );

  const fin = await read("get_dispute", [expectedId]);
  const sc = BigInt(fin.claimant_stake_wei);
  const sr = BigInt(fin.respondent_stake_wei);
  const expectC =
    rec.verdict === "CLAIMANT_WINS" ? sc + sr : rec.verdict === "RESPONDENT_WINS" ? 0n : sc;
  const expectR =
    rec.verdict === "CLAIMANT_WINS" ? 0n : rec.verdict === "RESPONDENT_WINS" ? sc + sr : sr;
  console.log(
    `[payouts] claimant ${fmtGen(fin.payout_claimant_wei)} / respondent ${fmtGen(
      fin.payout_respondent_wei,
    )} (recorded on-chain)`,
  );
  if (BigInt(fin.payout_claimant_wei) !== expectC || BigInt(fin.payout_respondent_wei) !== expectR) {
    throw new Error(`Payout legs mismatch expectation for ${rec.verdict}`);
  }
  if (!fin.executed) throw new Error("executed flag not set.");

  console.log(
    "\nLIVE E2E PASSED — real fetch-based ruling, immediate settlement, correct payout legs.",
  );
}

main().catch((err) => {
  console.error("\nLIVE E2E FAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
