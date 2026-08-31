# AEGIS — Testing Guide

Three test paths, from zero-setup to fully on-chain. Pick the one that matches
what you want to prove.

| Path | What it proves | Needs |
| ---- | -------------- | ----- |
| **A. Hosted smoke test** | The running app's API + escrow ledger are correct to the last wei | a running app (local or Vercel) |
| **B. Live on-chain run** | The deployed Intelligent Contract on Studionet rules and settles with real validators | two funded Studionet wallets |
| **C. Manual dApp walkthrough** | The real user experience, end to end, in the browser | just a browser |

There is also a library of ready-to-paste dispute content in
[samples/sample-disputes.md](samples/sample-disputes.md), and two fetchable
evidence exhibits served by the app itself:

- `https://<your-app>/evidence/sample-non-payment-admission.html` → admits the
  debt ⇒ expects `CLAIMANT_WINS`
- `https://<your-app>/evidence/sample-proof-of-payment.html` → payment settled ⇒
  expects `RESPONDENT_WINS`

---

## Path A — Hosted ledger smoke test

Drives the same API routes the dApp uses and asserts exact escrow accounting.

```bash
# against a local dev server
npm run dev            # terminal 1
node scripts/smoke-api.mjs   # terminal 2

# against a deployed app
APP_BASE_URL=https://your-app.vercel.app node scripts/smoke-api.mjs
```

Expected output — every check must pass:

```
AEGIS hosted smoke test
  ✓ health endpoint responds
  ✓ docket list readable
  ✓ faucet credits claimant
  ✓ faucet credits respondent
  ✓ dispute filed (id N)
  ✓ claimant stake locked exactly
  ✓ respondent stake locked exactly
  ✓ non-party resolution is rejected
  ✓ both parties signaled ready
  ✓ verdict within the allowed set
  ✓ exactly one ruling recorded
  ✓ re-resolution is impossible
  ✓ ruling executed
  ✓ claimant payout leg correct
  ✓ respondent payout leg correct
  ✓ final balances settle exactly
HOSTED SMOKE TEST PASSED — full lifecycle, exact escrow accounting.
```

Each run uses fresh random wallets, so it is safe to repeat.

---

## Path B — Live on-chain acceptance run

See **[LIVE_CONTRACT_TEST.md](LIVE_CONTRACT_TEST.md)** for the full walkthrough.

```bash
node scripts/e2e-live.mjs
```

---

## Path C — Manual dApp walkthrough (browser, ~5 minutes)

The dApp is fully interactive without any wallet extension thanks to the local
test wallet. To simulate both sides of a case, use two browser profiles (or a
normal window and a private window — each gets its own local test wallet).

1. **Open the dApp** and click **Open test wallet**. The wallet menu shows a
   balance of 10,000 GEN (credited automatically from the testnet faucet).
2. **File a dispute** (nav → *File dispute*) using Scenario 1 from
   [samples/sample-disputes.md](samples/sample-disputes.md). The form validates
   live: title ≥ 8 chars, description ≥ 20 chars, valid `0x…respondent, amount ≤ 6
   decimals. For the respondent address, first copy your own wallet address,
   then change the last character — in a real two-party test, paste the second
   browser's wallet address instead.
3. Submit. Two confirmations: a success toast (*"Dispute #000N filed — stake
   locked."*) and your balance dropping by exactly the stake.
4. **In the second browser**, open the dispute from *Dockets*. As the named
   respondent you see **Join & lock N GEN**. Join — both stakes are now in escrow.
5. **Submit evidence** from either side while the evidence window is open
   (24h), e.g. the sample exhibit URL
   `https://<your-app>/evidence/sample-non-payment-admission.html`.
6. **Signal ready to rule now** from both wallets. The evidence window closes
   early and **Request AI resolution** appears.
7. Click it. Validators fetch every linked source themselves; the verdict
   panel shows the final ruling, the consensus line, and each source's
   fetch status (`fetched` / `unreachable`).
8. **Execute ruling (settle now)** from any wallet — settlement is
   permissionless. Balances update immediately: the winner sweeps both stakes;
   splits/dismissals refund each side its own.
9. Everything is visible: the timeline rail, the *My cases* view, and each
   party's balance in the wallet pill.

### Negative checks worth trying

- Filing a dispute naming **yourself** as respondent → blocked client-side and
  server-side.
- **Request resolution** before both parties signaled (window still open) →
  the ledger rejects it with a clear reason.
- **Request resolution from a third wallet** → rejected: only parties.
- **Request resolution twice** → the second attempt always fails: exactly one
  ruling per dispute.
- Evidence URL on `http://` or a private host (`127.0.0.1`, `192.168…`) →
  rejected: https-only, public hosts.
- Faucet twice within an hour → cooldown error with the remaining time.

---

## Troubleshooting

| Symptom | Cause → fix |
| ------- | ----------- |
| "Cannot reach the AEGIS ledger" banners | App server down/unreachable → check the URL you opened is serving the app |
| Faucet error "cooling down" | One claim per address per hour → use a fresh test wallet or wait |
| "Wrong network" in wallet pill | MetaMask not on Studionet → click the menu item to switch (chain 61999) |
| Verdict `DISMISSED` unexpectedly | No substantive evidence text was fetchable → attach readable https sources |
| RPC/`ECONNREFUSED` in API logs | `DATABASE_URL` missing at runtime → set it and restart (see README) |
| `getaddrinfo ENOTFOUND db.<ref>.supabase.co` | The **direct** Supabase host is IPv6-only for newer projects and unresolvable from many serverless networks → switch to the **transaction pooler** host `aws-0-<region>.pooler.supabase.com:6543` with username `postgres.<ref>` |
| `Failed query … "disputes" does not exist` | Fresh database without tables → open `/api/bootstrap` once, or `npx drizzle-kit push`; new deploys auto-bootstrap at startup |
| `DATABASE_URL is required` on Vercel | Variable not set in the Vercel project → Settings → Environment Variables, then redeploy |
