/**
 * AEGIS — hosted ledger smoke test (manual, zero chain required).
 *
 * Exercises the full dispute lifecycle against a RUNNING deployment of this
 * app (local dev server, or a hosted build such as Vercel) through the same
 * API routes the dApp uses:
 *
 *   faucet → file_dispute → join → signal_ready ×2 → AI resolution → execute
 *
 * and asserts stake accounting down to the last wei.
 *
 * Prerequisites: none beyond Node 18+ (uses the global fetch).
 *
 * Usage:
 *   node scripts/smoke-api.mjs
 *   APP_BASE_URL=https://your-app.vercel.app node scripts/smoke-api.mjs
 */

const BASE = (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");

let failures = 0;
function check(label, ok, detail = "") {
  if (ok) {
    console.log(`  ✓ ${label}`);
  } else {
    failures++;
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function randomAddress() {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return "0x" + [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function api(path, body) {
  const res = await fetch(BASE + path, {
    method: body ? "POST" : "GET",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}: ${json.error ?? "?"}`);
  return json;
}

const gen = (n) => (BigInt(n) * 10n ** 18n).toString();

async function main() {
  const claimant = randomAddress();
  const respondent = randomAddress();
  console.log(`AEGIS hosted smoke test\n  base      : ${BASE}\n  claimant  : ${claimant}\n  respondent: ${respondent}\n`);

  // 0. Health + empty/pre-existing docket readable.
  const health = await api("/api/health");
  check("health endpoint responds", health.ok === true);
  const { total } = await api("/api/disputes?limit=1");
  check("docket list readable", Number.isInteger(total));

  // 1. Faucet funds both sides.
  const faucetA = await api("/api/faucet", { account: claimant });
  const faucetB = await api("/api/faucet", { account: respondent });
  check("faucet credits claimant", faucetA.balance_wei === gen(10000));
  check("faucet credits respondent", faucetB.balance_wei === gen(10000));

  // 2. Claimant files and locks 5 GEN; the stake leaves the balance.
  const { id } = await api("/api/disputes", {
    account: claimant,
    category: "freelance",
    title: "Smoke test: delivered work, unpaid invoice",
    description:
      "Automated smoke test of the hosted ledger: the agreed work was delivered and acknowledged, and the linked page documents non-payment by the respondent.",
    respondent,
    amount: "5",
    evidenceDescription: "Public page documenting the unpaid invoice.",
    evidenceUrl: "https://example.com/non-payment",
  });
  check(`dispute filed (id ${id})`, Number.isInteger(id) && id > 0);
  const afterFile = await api(`/api/accounts/${claimant}`);
  check("claimant stake locked exactly", afterFile.balance_wei === gen(9995));

  // 3. Respondent joins and locks the matching stake.
  await api(`/api/disputes/${id}/join`, { account: respondent });
  const afterJoin = await api(`/api/accounts/${respondent}`);
  check("respondent stake locked exactly", afterJoin.balance_wei === gen(9995));

  // 4. Wrong party cannot join / act.
  let rejected = false;
  try {
    await api(`/api/disputes/${id}/resolve`, { account: randomAddress() });
  } catch (err) {
    rejected = /only parties/.test(String(err));
  }
  check("non-party resolution is rejected", rejected);

  // 5. Both parties signal ready to close the evidence window early.
  await api(`/api/disputes/${id}/ready`, { account: claimant });
  await api(`/api/disputes/${id}/ready`, { account: respondent });
  check("both parties signaled ready", true);

  // 6. The ONE AI ruling — the arbitrator fetches live evidence itself.
  const { record } = await api(`/api/disputes/${id}/resolve`, { account: claimant });
  const valid = ["CLAIMANT_WINS", "RESPONDENT_WINS", "SPLIT_DECISION", "DISMISSED"];
  check("verdict within the allowed set", valid.includes(record.verdict), record.verdict);
  check("exactly one ruling recorded", record.status === "resolved" && record.rounds === 1);
  console.log(`    ↳ verdict: ${record.verdict} (${record.arb_agreement || "—"} consensus)`);

  // 7. Second resolution attempt must fail (one ruling per dispute).
  let secondRejected = false;
  try {
    await api(`/api/disputes/${id}/resolve`, { account: claimant });
  } catch (err) {
    secondRejected = /already requested or concluded/.test(String(err));
  }
  check("re-resolution is impossible", secondRejected);

  // 8. Permissionless immediate settlement + exact payout legs.
  await api(`/api/disputes/${id}/execute`, { account: randomAddress() });
  const fin = (await api(`/api/disputes/${id}`)).record;
  check("ruling executed", fin.executed === true);
  const expectC =
    fin.verdict === "CLAIMANT_WINS" ? gen(10) : fin.verdict === "RESPONDENT_WINS" ? gen(0) : gen(5);
  const expectR =
    fin.verdict === "CLAIMANT_WINS" ? gen(0) : fin.verdict === "RESPONDENT_WINS" ? gen(10) : gen(5);
  check("claimant payout leg correct", fin.payout_claimant_wei === expectC);
  check("respondent payout leg correct", fin.payout_respondent_wei === expectR);

  const balA = await api(`/api/accounts/${claimant}`);
  const balB = await api(`/api/accounts/${respondent}`);
  check(
    "final balances settle exactly",
    balA.balance_wei === (BigInt(gen(9995)) + BigInt(expectC)).toString() &&
      balB.balance_wei === (BigInt(gen(9995)) + BigInt(expectR)).toString(),
  );

  if (failures > 0) throw new Error(`${failures} check(s) failed`);
  console.log("\nHOSTED SMOKE TEST PASSED — full lifecycle, exact escrow accounting.");
}

main().catch((err) => {
  console.error("\nHOSTED SMOKE TEST FAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
