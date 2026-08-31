# Publishing AEGIS to GitHub

The repo is clean by default: `.gitignore` excludes `node_modules/`, `.next/`,
logs, TypeScript build info and **every `.env` variant**, so private keys and
database URLs never leave your machine.

## First push

```bash
# from the repository root
git init
git add .
git status                 # sanity-check: .env must NOT appear in the list
git commit -m "AEGIS — decentralized AI arbitration protocol on GenLayer"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```

With the GitHub CLI as an alternative to adding the remote by hand:

```bash
gh repo create <your-repo> --public --source=. --remote=origin --push
```

## What travels to GitHub — and what stays local

| Committed (safe to share) | Never committed |
| ------------------------- | --------------- |
| `contracts/aegis.py` | `.env` (private keys, `DATABASE_URL`) |
| `src/` (dApp + ledger backend) | any `*.local` env files |
| `scripts/` (live + hosted test runners) | |
| `docs/` + `public/evidence/` (guides & exhibits) | |
| `deployments.json` (public contract address) | |
| `.env.example` (variable template, no values) | |

## Everyday workflow

```bash
git checkout -b feat/my-change
# …edit…
git add -A && git commit -m "Describe the change"
git push -u origin feat/my-change
gh pr create --fill         # optional: open the pull request
```

## Keeping deployments.json honest

When you redeploy the contract to a new address, update in one commit:

1. `deployments.json` → `studionet.contracts.AEGISArbitration.address` (+ `explorerUrl`)
2. `.env` → `AEGIS_CONTRACT_ADDRESS` and `NEXT_PUBLIC_AEGIS_CONTRACT_ADDRESS`
   (local only — never pushed)
3. README badge/link if you hard-coded one

Then rebuild any hosted dApp so the new `NEXT_PUBLIC_` value is baked in.
(The dApp footer also falls back to `deployments.json` when the env var is absent.)
