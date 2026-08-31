# AEGIS Documentation

Guides for testing the protocol — from a one-command hosted check to a fully
on-chain acceptance run with real validators.

| Document | What it covers |
| -------- | -------------- |
| [TESTING.md](TESTING.md) | Master guide: hosted smoke test, dApp walkthrough, negative checks, troubleshooting |
| [LIVE_CONTRACT_TEST.md](LIVE_CONTRACT_TEST.md) | Step-by-step live testing of the deployed contract on Studionet (chain 61999) |
| [samples/sample-disputes.md](samples/sample-disputes.md) | Ready-to-paste dispute scenarios with expected verdicts and settlement math |
| [GITHUB.md](GITHUB.md) | Publishing the repo to GitHub safely |
| [../deployments/](../deployments/README.md) | Deployment records: machine registry + full Studionet contract record |

## Quick links

- Deployed contract:
  [0x210Dcf0aAa76FEDD00fEc7bc00243e1539FC0A22](https://explorer-studio.genlayer.com/address/0x210Dcf0aAa76FEDD00fEc7bc00243e1539FC0A22)
- Sample evidence exhibits (served by the app over https):
  - `/evidence/sample-non-payment-admission.html` — admits the debt ⇒ expects `CLAIMANT_WINS`
  - `/evidence/sample-proof-of-payment.html` — payment settled ⇒ expects `RESPONDENT_WINS`
- Test runners: `scripts/smoke-api.mjs` (hosted), `scripts/e2e-live.mjs` (on-chain)
