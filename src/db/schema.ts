import {
  pgTable,
  bigserial,
  bigint,
  text,
  boolean,
  integer,
  numeric,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";

/**
 * AEGIS — decentralized AI arbitration, ledger-first storage layout.
 *
 * The hosted deployment runs the same economics as the reference GenLayer
 * intelligent contract (contracts/aegis.py) against a PostgreSQL escrow
 * ledger: stakes are debited/credited in ACID transactions with row-level
 * locks, so the escrow invariants (exact-value locks, single final ruling,
 * deterministic permissionless settlement) hold identically.
 *
 * All amounts are wei-denominated numeric(78,0) end to end.
 */

export const accounts = pgTable("accounts", {
  address: text("address").primaryKey(),
  balanceWei: numeric("balance_wei", { precision: 78, scale: 0 })
    .notNull()
    .default("0"),
  lastFaucetAt: timestamp("last_faucet_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const disputes = pgTable(
  "disputes",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    category: text("category").notNull(), // freelance | dao_governance | marketplace
    title: text("title").notNull(),
    description: text("description").notNull(),
    claimant: text("claimant").notNull(),
    respondent: text("respondent").notNull(),
    amountWei: numeric("amount_wei", { precision: 78, scale: 0 }).notNull(),
    // open -> under_review -> resolved (terminal once executed)
    status: text("status").notNull().default("open"),
    joined: boolean("joined").notNull().default(false),
    joinedAt: timestamp("joined_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    evidenceDeadline: timestamp("evidence_deadline", {
      withTimezone: true,
    }).notNull(),
    readyClaimant: boolean("ready_claimant").notNull().default(false),
    readyRespondent: boolean("ready_respondent").notNull().default(false),
    // exactly one final ruling per dispute — no appeals, no re-rolls
    verdict: text("verdict"), // CLAIMANT_WINS | RESPONDENT_WINS | SPLIT_DECISION | DISMISSED
    reasoning: text("reasoning"),
    rounds: integer("rounds").notNull().default(0),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    defaulted: boolean("defaulted").notNull().default(false),
    executed: boolean("executed").notNull().default(false),
    executedAt: timestamp("executed_at", { withTimezone: true }),
    payoutClaimantWei: numeric("payout_claimant_wei", {
      precision: 78,
      scale: 0,
    })
      .notNull()
      .default("0"),
    payoutRespondentWei: numeric("payout_respondent_wei", {
      precision: 78,
      scale: 0,
    })
      .notNull()
      .default("0"),
    // arbitration report: per-source reachability + excerpts + engine meta
    arbReport: jsonb("arb_report").$type<ArbReport | null>(),
  },
  (t) => [
    index("disputes_created_idx").on(t.createdAt),
    index("disputes_claimant_idx").on(t.claimant),
    index("disputes_respondent_idx").on(t.respondent),
    index("disputes_status_idx").on(t.status),
  ],
);

export const evidence = pgTable(
  "evidence",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    disputeId: bigint("dispute_id", { mode: "number" })
      .notNull()
      .references(() => disputes.id, { onDelete: "cascade" }),
    side: text("side").notNull(), // claimant | respondent
    submitter: text("submitter").notNull(),
    description: text("description").notNull(),
    url: text("url").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("evidence_dispute_idx").on(t.disputeId)],
);

export const ledgerEntries = pgTable(
  "ledger_entries",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    disputeId: bigint("dispute_id", { mode: "number" }),
    address: text("address").notNull(),
    kind: text("kind").notNull(), // faucet | lock | payout | refund
    amountWei: numeric("amount_wei", { precision: 78, scale: 0 }).notNull(), // signed
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("ledger_address_idx").on(t.address)],
);

export interface ArbSource {
  side: "claimant" | "respondent";
  description: string;
  url: string;
  reachable: boolean;
  excerpt: string;
}

export interface ArbReport {
  engine: string; // "aegis-local-consensus v1" | "openai-compatible:<model>"
  validators: number;
  agreement: string; // e.g. "4/5"
  consensusDate: string;
  sources: ArbSource[];
  signals?: string[];
}

export type DisputeRow = typeof disputes.$inferSelect;
export type EvidenceRow = typeof evidence.$inferSelect;
export type AccountRow = typeof accounts.$inferSelect;
