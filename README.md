# AEGIS

Decentralized AI arbitration with real stakes — a fullstack re-implementation of the
[OpeaTech](https://github.com/RaphaelC4/Opentech) concept (GenLayer Intelligent Contract +
React dApp) on a **Next.js (App Router) + PostgreSQL (Drizzle)** stack, wrapped in a clean,
light web3/AI interface.

**Live contract (GenLayer Studio, chain 61999):**
[`0x210Dcf0aAa76FEDD00fEc7bc00243e1539FC0A22`](https://explorer-studio.genlayer.com/address/0x210Dcf0aAa76FEDD00fEc7bc00243e1539FC0A22)

Filing locks a stake, the respondent matches it or loses by default, AI validators
**fetch the linked evidence themselves** and reach comparative consensus on a **single
final ruling**, and anyone can settle the escrow immediately — winner sweeps both
stakes, splits/dismissals refund everyone their own.

## Economics (v1)

```
file_dispute                    the claimant locks the disputed amount A
        │
        ├── join_dispute { A } ──► both stakes escrowed
        │        │
        │        └─(request_resolution)──► ONE AI ruling (consensus over
        │                                   LIVE-FETCHED evidence pages)
        │                                            │
        └── no join after evidence window ──► default_judgment
                                                 │
                                                 ▼
                              execute_ruling (permissionless, IMMEDIATE)
```

- **Stakes:** filing locks `A`; the named respondent locks an identical stake to defend
  (exact-value enforced). Never joining loses by default judgment — a permanent record.
- **One verified ruling:** no appeals, no re-rolls. At ruling time the arbitrator fetches
  up to 3 evidence URLs per side (2,500-char excerpts); dead links are flagged
  `(source unreachable)` rather than trusted or fatal.
- **Immediate settlement:** `execute_ruling` is permissionless and deterministic.

## Layout

```
contracts/aegis.py              GenLayer Intelligent Contract (deployed on Studionet)
scripts/e2e-live.mjs            zero-simulation live acceptance run on-chain
scripts/smoke-api.mjs           hosted app's full lifecycle check (no chain needed)
deployments.json                machine-readable contract registry (read by the dApp)
deployments/genlayer/           full deployment record per network (see deployments/README.md)
docs/                           testing guides + sample dispute content
src/app/api/                    consensus-ledger backend (route handlers)
src/lib/server/chain.ts         escrow engine — ACID txs, row locks, exact stakes
src/lib/server/arbitrator.ts    AI validators: live fetch + comparative consensus
src/lib/chain.ts                client SDK (mirrors the reference lib/genlayer.js)
src/lib/wallet.ts               MetaMask (Studionet 61999) + local test wallet
src/{components,hooks,lib,views}/   dApp (mirrors the reference frontend tree)
src/db/schema.ts                disputes · evidence · accounts · ledger entries
```

## Quick start (local)

```bash
npm install
cp .env.example .env      # DATABASE_URL plus the deployed contract address
npx drizzle-kit push      # create the ledger tables
npm run dev               # http://localhost:3000
```

No browser wallet? Click **Open test wallet** — a local EVM-shaped address is funded
from the hosted testnet faucet so the full flow stays explorable.

## Two execution modes

The dApp runs in one of two modes depending on the connected wallet:

| | **MetaMask on Studionet** | **Local test wallet** |
| --- | --- | --- |
| Dispute data | REAL deployed contract (`get_disputes` / `get_dispute` via genlayer-js, proxied at `/api/onchain/*`) | Hosted demo ledger (PostgreSQL) |
| Stakes & actions | **Real on-chain transactions signed by MetaMask** — GEN actually leaves the wallet (`file_dispute` / `join_dispute` are payable) | Ledger escrow debit/credit with a 10,000 GEN faucet |
| AI ruling | GenLayer validators + live LLM consensus | Server arbitrator (live fetch engines) |
| Balance pill | Real on-chain GEN balance | Ledger balance |

Opening the site with no wallet connected also shows the on-chain docket — the
public face follows the deployed contract, exactly like the reference dApp.

## Wallet connection (MetaMask · GenLayer Studio chain 61999)

**Connect wallet** uses any injected EIP-1193 wallet: it requests accounts, checks
`eth_chainId`, and when the wallet is not on chain **61999** (`0xF22F`) it offers
`wallet_switchEthereumChain` — adding the network via `wallet_addEthereumChain`
(EIP-3085) when unknown (`GenLayer Studio` · RPC `https://studio.genlayer.com/api` ·
GEN · explorer `https://explorer-studio.genlayer.com`). The pill shows the wallet's
real on-chain GEN balance, and a wrong chain surfaces as a visible "Wrong network"
state with a one-click switch.

## Manual testing

Full guides live in **[docs/](docs/README.md)**:
[Testing Guide](docs/TESTING.md) ·
[Live Contract Testing on Studionet](docs/LIVE_CONTRACT_TEST.md) ·
[Sample Dispute Content](docs/samples/sample-disputes.md) ·
[Publishing to GitHub](docs/GITHUB.md).
The app also serves two fetchable evidence exhibits for testing:
`/evidence/sample-non-payment-admission.html` ( ⇒ `CLAIMANT_WINS`) and
`/evidence/sample-proof-of-payment.html` ( ⇒ `RESPONDENT_WINS`).

### 1. Hosted ledger smoke test — `scripts/smoke-api.mjs`

Drives a running deployment (local or Vercel) through the real API routes and asserts
escrow accounting down to the last wei:

```bash
node scripts/smoke-api.mjs                                     # local dev server
APP_BASE_URL=https://your-app.vercel.app node scripts/smoke-api.mjs
```

Covers: faucet → file (exact stake lock) → join → non-party rejection → both-ready →
the one AI ruling → re-resolution rejection → permissionless settlement → payout legs.

### 2. Live on-chain acceptance run — `scripts/e2e-live.mjs`

Drives the deployed Intelligent Contract on Studionet with real transactions and real
validator consensus. Configure the repo-root `.env`:

```
GENLAYER_PRIVATE_KEY=0x…               # claimant wallet (funded)
GENLAYER_RESPONDENT_PRIVATE_KEY=0x…    # respondent wallet (funded)
EVIDENCE_URL=https://…                 # public page whose text decides the case
AEGIS_CONTRACT_ADDRESS=0x210Dcf0aAa76FEDD00fEc7bc00243e1539FC0A22  # or deployments.json
```

```bash
node scripts/e2e-live.mjs
```

Point `EVIDENCE_URL` at a page you control — the verdict must follow what validators
fetch, not what the dispute text claims.

## Publishing to GitHub

`.gitignore` already excludes `node_modules/`, `.next/` and every `.env` file, so no
secret ever leaves the machine:

```bash
git init
git add .
git commit -m "AEGIS — decentralized AI arbitration protocol on GenLayer"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```

Keep `.env` local; share configuration through `.env.example` and `deployments.json`.

## Connecting Supabase

The app is **Supabase-ready** out of the box: the runtime driver is
`postgres.js` (the official Drizzle + Supabase recommendation) with
`prepare: false` — required by the Supavisor/PgBouncer transaction pooler —
and TLS auto-enabled for every remote host. `db.transaction()` with
`SELECT … FOR UPDATE` row locks powers the escrow semantics and works through
Supavisor's pooled transactions.

1. **Create a project** at [supabase.com](https://supabase.com) (any region,
   any plan — free tier is fine).
2. **Project Settings → Database → Connection string**, then pick per use:

   | Use | String to copy | Port |
   | --- | -------------- | ---- |
   | **App runtime** (Vercel/serverless) | **Transaction** pooler: `postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres` | 6543 |
   | **Migrations** (`drizzle-kit push`) | **Session** pooler or **direct**: `…pooler.supabase.com:5432/postgres` or `postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres` | 5432 |

   Use the database password you set at project creation
   (Settings → Database → Reset password if lost).
3. Set `DATABASE_URL` accordingly (locally in `.env`, on Vercel in Project →
   Settings → Environment Variables).
4. **Tables create themselves** at server startup — or run
   `node`-free verification by opening `https://<your-app>/api/bootstrap`
   once. Prefer explicit migrations?

   ```bash
   DATABASE_URL="postgresql://postgres.<ref>:<password>@…pooler.supabase.com:5432/postgres" npx drizzle-kit push
   ```

## Deploying to Vercel (without the DATABASE_URL build error)

The Drizzle client in `src/db/index.ts` initializes **lazily on first query**, so
`next build` never touches the environment — the build passes on Vercel even before
any variable exists. Runtime API routes then need a real database:

1. **Push the code** to GitHub (above), then in Vercel: **Add New → Project → Import**.
2. **Create the Supabase project** and copy the **transaction pooler** string
   (see *Connecting Supabase* above).
3. **Set environment variables** (Project → Settings → Environment Variables), for
   Production and Preview:

   | Name                            | Value                                              |
   | ------------------------------- | -------------------------------------------------- |
   | `DATABASE_URL`                  | Supabase **transaction pooler** string (port 6543) |
   | `NEXT_PUBLIC_AEGIS_CONTRACT_ADDRESS` | `0x210Dcf0aAa76FEDD00fEc7bc00243e1539FC0A22`   |
   | `AI_API_KEY` *(optional)*       | OpenAI-compatible key for a real LLM ruling engine |

4. `vercel --prod` (or just push to `main`). Tables are created automatically —
   twice over for safety: at server startup (instrumentation hook) **and**
   inside the request path (every ledger entry point runs the idempotent
   bootstrap before its first query). Confirm with
   `https://<your-app>/api/bootstrap` (`ok: true`, four tables), then run the
   hosted smoke test:

   ```bash
   APP_BASE_URL=https://your-app.vercel.app node scripts/smoke-api.mjs
   ```

> Hitting `Failed query … relation "disputes" does not exist` or a
> `DATABASE_URL` error on an existing deployment? `DATABASE_URL` is missing or
> pointing at an uninitialized database: set the variable and redeploy — the
> very next request self-heals the schema. No manual step is ever required.
> Seeing `MaxClientsInSessionMode`/`too many connections` on Supabase? You are
> on the **direct** host (5432) from serverless — switch to the transaction
> pooler (6543). Seeing `getaddrinfo ENOTFOUND db.<ref>.supabase.co`? Same fix,
> different symptom: the direct host is IPv6-only for newer projects and many
> serverless networks cannot resolve it — always prefer the pooler
> (`aws-0-<region>.pooler.supabase.com:6543`, username `postgres.<ref>`).

Notes: the footer contract chip falls back to `deployments.json` when the public env
variable is absent; TLS is enabled automatically for non-local `DATABASE_URL` hosts —
use your provider's pooled host for serverless concurrency.

## Configuration (.env)

| Variable                             | Used by              | Purpose                                   |
| ------------------------------------ | -------------------- | ----------------------------------------- |
| `DATABASE_URL`                       | Next.js server       | PostgreSQL escrow-ledger connection       |
| `GENLAYER_CHAIN_ID` / `GENLAYER_RPC_URL` | docs/scripts     | Studionet `61999` / official RPC          |
| `AEGIS_CONTRACT_ADDRESS`             | `e2e-live.mjs`       | Deployed contract (fallback: `deployments.json`) |
| `NEXT_PUBLIC_AEGIS_CONTRACT_ADDRESS` | dApp UI              | Footer contract chip (fallback: `deployments.json`) |
| `GENLAYER_PRIVATE_KEY` / `_RESPONDENT_PRIVATE_KEY` | `e2e-live.mjs` | Funded wallets for the acceptance run     |
| `EVIDENCE_URL`                       | `e2e-live.mjs`       | Decisive public evidence page             |
| `AI_API_KEY` / `AI_BASE_URL` / `AI_MODEL` | server arbitrator | Optional OpenAI-compatible LLM ruling     |

Without `AI_API_KEY`, the arbitrator uses a deterministic 5-validator local consensus
engine — the same role the reference test-suite's LLM stub plays, with everything
else (fetching, bounds, escrow, settlement) fully real.

## Ledger API

| Route                                          | Method   | Contract analogue            |
| ---------------------------------------------- | -------- | ---------------------------- |
| `/api/disputes`                                | POST     | `file_dispute` (payable)     |
| `/api/disputes/[id]/join`                      | POST     | `join_dispute` (payable)     |
| `/api/disputes/[id]/evidence`                  | POST     | `submit_evidence`            |
| `/api/disputes/[id]/ready`                     | POST     | `signal_ready`               |
| `/api/disputes/[id]/resolve`                   | POST     | `request_resolution`         |
| `/api/disputes/[id]/default`                   | POST     | `default_judgment`           |
| `/api/disputes/[id]/execute`                   | POST     | `execute_ruling`             |
| `/api/disputes?offset&limit` · `/[id]`         | GET      | `get_disputes` / `get_dispute` |
| `/api/accounts/[address]` · `/api/faucet`      | GET/POST | balance view · testnet faucet |

## Security notes

- Every write runs in a PostgreSQL transaction with `SELECT … FOR UPDATE` row locks;
  exact-value checks on every payable entry point; payout legs recorded **before**
  credits (checks-effects-interactions).
- Evidence fetching is bounded per side (3 URLs × 2,500 chars); failures degrade to
  explicit unreachability notes instead of reverting. Unparseable rulings revert.
- Evidence URLs are https-only with private/localhost hosts blocked; pages are fetched
  server-side by the arbitrator, never by the claimant's browser.
- One ruling per dispute — verdict shopping is impossible; execution is permissionless
  but fully determined by stored state.
