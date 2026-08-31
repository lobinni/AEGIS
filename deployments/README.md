# Deployments Registry

One folder per network family; one JSON record per deployed contract
(convention borrowed from community GenLayer projects).

| File | Purpose |
| ---- | ------- |
| [genlayer/aegis-arbitration-studionet.json](genlayer/aegis-arbitration-studionet.json) | Human-facing deployment record for the AEGIS Intelligent Contract on Studionet (chain 61999): protocol constants, API surface, acceptance flow, explorer links |
| [../deployments.json](../deployments.json) | Machine-readable registry read by the dApp and test scripts (footer chip; `AEGIS_CONTRACT_ADDRESS` fallback) |

## Conventions

- File name: `<contract-name>-<network>.json`.
- Never invent values: fields that are unknown until checked on the explorer
  (deploy tx hash, deployer address, timestamps) stay as empty strings.
- `deployed_at` uses ISO-8601 UTC.
- The root `deployments.json` and the record here must stay in sync — an
  address change is always one commit touching both files (plus the local
  `.env`, which is never committed).

## Verifying the record against the chain

1. Open the contract on the explorer:
   https://explorer-studio.genlayer.com/address/0x210Dcf0aAa76FEDD00fEc7bc00243e1539FC0A22
2. Copy `deployed_at`, `owner_address` and `deployment_transaction` into
   `genlayer/aegis-arbitration-studionet.json`.
3. Run the acceptance flow to assert the contract is alive and rule-capable:
   `node scripts/e2e-live.mjs` (see `docs/LIVE_CONTRACT_TEST.md`).
