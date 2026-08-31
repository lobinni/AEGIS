# AEGIS — Live Contract Testing on the GenLayer Studio Network

This guide walks you through proving the **real deployed Intelligent Contract**
end to end on Studionet (chain 61999): real wallets, real locked stakes, real
validator fetches of your evidence page, and a real settlement — recorded and
inspectable on the explorer.

The already-deployed contract (from this repo's `contracts/aegis.py`):

- **Address:** `0x210Dcf0aAa76FEDD00fEc7bc00243e1539FC0A22`
- **Explorer:** https://explorer-studio.genlayer.com/address/0x210Dcf0aAa76FEDD00fEc7bc00243e1539FC0A22
- **Studio:** https://studio.genlayer.com/contracts

> Prefer your own deployment? Deploy `contracts/aegis.py` from the Studio UI
> (no constructor arguments), then update `deployments.json` and the two
> `*_CONTRACT_ADDRESS` variables in `.env`.

---

## 1. Prerequisites

- **Node 18+** and `npm install` at the repo root (installs `genlayer-js`).
- **Two funded Studionet wallets.** Generate them in the Studio UI
  (https://studio.genlayer.com) or with any EVM wallet, and fund them from the
  Studio's test faucet / funded test accounts. Export the two private keys —
  they must be **different** wallets (the contract enforces it).
- **A public https evidence URL whose text decides the case.** Two options:
  - **Easiest:** the exhibits this repo serves at
    `public/evidence/` — after deploying the app (e.g. Vercel), use:
    `https://<your-app>/evidence/sample-non-payment-admission.html`
    (admits the debt ⇒ `CLAIMANT_WINS` expected) or
    `https://<your-app>/evidence/sample-proof-of-payment.html`
    (payment settled ⇒ `RESPONDENT_WINS` expected).
  - Publish the same HTML anywhere with https (GitHub Pages, raw content
    hosts, your own site). The page content — not the dispute text — is what
    validators judge.

## 2. Configure the repo-root `.env`

```
GENLAYER_PRIVATE_KEY=0x…your claimant key…
GENLAYER_RESPONDENT_PRIVATE_KEY=0x…your respondent key…
AEGIS_CONTRACT_ADDRESS=0x210Dcf0aAa76FEDD00fEc7bc00243e1539FC0A22   # optional: falls back to deployments.json
EVIDENCE_URL=https://<your-app>/evidence/sample-non-payment-admission.html
AMOUNT_GEN=1        # optional; stake per side in whole GEN (default 1)
```

`.env` is gitignored — keys never leave your machine.

## 3. Run the acceptance script

```bash
node scripts/e2e-live.mjs
```

### What happens, step by step

| Step | Transaction | What to expect |
| ---- | ----------- | -------------- |
| 0 preflight | `view_config()` read | Aborts early if the address is not the expected contract |
| 1 file | `file_dispute(…, value: stake)` | `[file] ok (0x…)` — claimant's stake locked |
| 2 join | `join_dispute(id, value: stake)` | `[join] ok` — respondent's matching stake locked |
| 3 ready ×2 | `signal_ready(id)` | evidence window closes early by mutual agreement |
| 4 resolve | `request_resolution(id)` | Validators each fetch `EVIDENCE_URL` **themselves** inside the consensus block, then agree on one verdict |
| 5 verify | `get_dispute(id)` read | Prints `[verdict]` + `[reasoning]`; aborts if outside the allowed set |
| 6 settle | `execute_ruling(id)` | Permissionless, immediate payout |
| 7 assert | `get_dispute(id)` read | Payout legs must match the verdict exactly |

Consensus and the live page fetches take time — the script waits patiently
(up to ~20 minutes of polling). A successful run ends with:

```
LIVE E2E PASSED — real fetch-based ruling, immediate settlement, correct payout legs.
```

## 4. Verify on the explorer

Open the contract page on the explorer and confirm for the new dispute id:

1. The two stake-locking transactions (claimant and respondent, exact amounts).
2. The resolution transaction and the recorded `verdict`/`reasoning`.
3. The settlement transaction whose payout legs are **exactly**:
   - `CLAIMANT_WINS` → claimant `stake × 2`, respondent `0`
   - `RESPONDENT_WINS` → respondent `stake × 2`, claimant `0`
   - `SPLIT_DECISION` / `DISMISSED` → each side gets its own stake back.

### Evidence → expected verdict matrix

| Evidence exhibit | Key fetched text | Expected verdict |
| ---------------- | ---------------- | ---------------- |
| `sample-non-payment-admission.html` | "…**have not paid** … **unable to pay** … my mistake" | `CLAIMANT_WINS` |
| `sample-proof-of-payment.html` | "…**paid in full** … settled … resolved" | `RESPONDENT_WINS` |
| A page with no relevant content | no signals | `SPLIT_DECISION` or `DISMISSED` |
| A dead link (404/unreachable) | "(source unreachable)" noted, not trusted | decided by the remaining record |

Point `EVIDENCE_URL` at a page **you control**: the verdict must follow what
validators fetch, not what the dispute description claims. That is the core
guarantee being tested.

## 5. Extra manual checks against the contract

The Studio UI's read/write panels let you call the contract directly:

- `get_total_disputes` / `get_disputes(0, 50)` — enumerate the docket.
- `get_dispute(id)` — the full record incl. both evidence lists.
- Calling `request_resolution` a second time on the same dispute must revert:
  *"resolution already requested or concluded"* — one ruling, ever.
- `execute_ruling` from any third wallet works (permissionless) but can never
  change the outcome — it only pays what the stored verdict dictates.

## Safety notes

- Studionet GEN is test value, but treat private keys as secrets anywhere.
- Dispute ids are sequential (1-based); the script computes the next id from
  `get_total_disputes() + 1`.
- Default judgments and rulings are permanent public records — use meaningful
  sample content (e.g. the provided scenarios) rather than junk filings.
