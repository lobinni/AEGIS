# Sample Dispute Content Library

Ready-to-paste scenarios for testing AEGIS — in the dApp form (Path C of
[../TESTING.md](../TESTING.md)), against the hosted API, or as inspiration for
your own on-chain evidence pages. Each scenario lists its **expected verdict**
when the matching exhibit is the only evidence in play.

The dApp serves both exhibits over https:

- Exhibit A: `https://<your-app>/evidence/sample-non-payment-admission.html`
- Exhibit B: `https://<your-app>/evidence/sample-proof-of-payment.html`

---

## Scenario 1 — Unpaid audit invoice (expects `CLAIMANT_WINS`)

| Field | Value |
| ----- | ----- |
| Category | Freelance / Contract Work |
| Amount | `950` |
| Title | `Smart-contract audit invoice unpaid past 30 days` |
| Description | `Completed a 40-hour security audit of the respondent's staking contracts and delivered the full report on 2026-01-15; the report was accepted in writing. The 950 GEN invoice is now 30 days overdue. The respondent's own public statement (linked) acknowledges the debt and admits payment was never made.` |
| Evidence description | `Respondent's public acknowledgment of non-payment` |
| Evidence URL | Exhibit A (`sample-non-payment-admission.html`) |

cURL equivalent (hosted API):

```bash
curl -X POST https://<your-app>/api/disputes \
  -H 'content-type: application/json' \
  -d '{
    "account": "0xYourClaimantAddress…",
    "category": "freelance",
    "title": "Smart-contract audit invoice unpaid past 30 days",
    "description": "Completed a 40-hour security audit of the respondent''s staking contracts and delivered the full report on 2026-01-15; the report was accepted in writing. The 950 GEN invoice is now 30 days overdue. The respondent''s own public statement (linked) acknowledges the debt and admits payment was never made.",
    "respondent": "0xRespondentAddress…",
    "amount": "950",
    "evidenceDescription": "Respondent''s public acknowledgment of non-payment",
    "evidenceUrl": "https://<your-app>/evidence/sample-non-payment-admission.html"
  }'
```

---

## Scenario 2 — Actually settled delivery (expects `RESPONDENT_WINS`)

The claimant keeps the same complaint, but the respondent's linked record
proves the invoice was settled. When both sides link sources, validators weigh
both — the settlement record dominates here.

| Field | Value |
| ----- | ----- |
| Category | Freelance / Contract Work |
| Amount | `1500` |
| Title | `Brand identity kit invoice claimed unpaid` |
| Description | `Claim: the brand identity kit invoice for 1,500 GEN was never paid. The respondent's public settlement record (submitted as respondent evidence) shows payment sent in full and accepted, on time, as agreed.` |

Respondent-side evidence to submit after joining (Path C, step 5 of the testing guide):

- Description: `Public settlement record — invoice paid in full`
- URL: Exhibit B (`sample-proof-of-payment.html`)

---

## Scenario 3 — Empty claim (expects `DISMISSED` or `SPLIT_DECISION`)

| Field | Value |
| ----- | ----- |
| Category | Marketplace Transaction |
| Amount | `120` |
| Title | `General dissatisfaction with a purchase` |
| Description | `The buyer is unhappy with the marketplace purchase and requests arbitration. No delivery failure, payment failure, or specific breach is described, and no sources are linked by either side.` |

With no fetchable substance on either side, validators dismiss or split; the
stakes are refunded to their owners.

---

## Scenario 4 — Default judgment path

File any scenario and **never join from the respondent wallet**. After the
24-hour evidence window passes, anyone can press **Record default judgment** —
the claimant wins by default and settlement returns the claimant's stake, with
the default standing as a permanent public record.

---

## Balance math to verify after settlement

| Verdict | Claimant ends with | Respondent ends with |
| ------- | ------------------ | -------------------- |
| `CLAIMANT_WINS` | own stake + respondent's stake | 0 from the escrow |
| `RESPONDENT_WINS` | 0 from the escrow | own stake + claimant's stake |
| `SPLIT_DECISION` / `DISMISSED` | own stake back | own stake back |
| default (unjoined) | own stake back | — (never staked) |
