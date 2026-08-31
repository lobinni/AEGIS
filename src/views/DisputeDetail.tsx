"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  Bot,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  ExternalLink,
  FilePlus2,
  Gavel,
  Handshake,
  Hourglass,
  Link2,
  ShieldQuestion,
  Unplug,
} from "lucide-react";
import {
  client,
  fmtGen,
  fmtRemaining,
  sameAddress,
  shortAddress,
  timeAgo,
  EVIDENCE_DESC_MIN,
  EVIDENCE_DESC_MAX,
  isValidEvidenceUrl,
  engineLabel,
  type DisputeRecord,
} from "@/lib/chain";
import { CATEGORY_LABEL, VERDICT_VIEW } from "@/lib/labels";
import { useWallet } from "@/hooks/useWallet";
import { useClock } from "@/lib/useClock";
import { notify } from "@/lib/toast";
import { onchainAvailable, writeOnchain } from "@/lib/onchain";
import type { Route } from "@/components/App";

function previewPayout(d: DisputeRecord): string {
  const a = BigInt(d.amount_wei);
  const stakeR = d.joined ? a : 0n;
  if (d.verdict === "CLAIMANT_WINS") return `${fmtGen(a + stakeR)} → claimant`;
  if (d.verdict === "RESPONDENT_WINS") return `${fmtGen(a + stakeR)} → respondent`;
  return `${fmtGen(a)} back to each side`;
}

/** Full case file with the same action gating as the reference detail view. */
export function DisputeDetail({
  id,
  bumpKey,
  onChanged,
  goto,
}: {
  id: number;
  bumpKey: number;
  onChanged: () => void;
  goto: (view: Route["view"], id?: number) => void;
}) {
  const { status, account, kind, connect, refreshBalance } = useWallet();
  const nowTs = useClock();
  const [record, setRecord] = useState<DisputeRecord | null>(null);
  const [error, setError] = useState("");
  const [busyAction, setBusyAction] = useState("");
  const [evOpen, setEvOpen] = useState(false);
  const [evDesc, setEvDesc] = useState("");
  const [evUrl, setEvUrl] = useState("");
  const [reviewing, setReviewing] = useState(false);

  const load = useCallback(async () => {
    try {
      setError("");
      const { record } = await client.getDispute(id);
      setRecord(record);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [id]);

  useEffect(() => {
    setRecord(null);
    void load();
  }, [load, bumpKey]);

  if (error && !record) {
    return (
      <div className="empty-state view-enter" style={{ marginTop: "4rem" }}>
        <div className="empty-icon">
          <Unplug size={22} />
        </div>
        <h3>Not found</h3>
        <p>{error}</p>
        <button type="button" className="cta-outline u-mt-md" onClick={() => goto("disputes")}>
          <ArrowLeft size={13} /> Back to dockets
        </button>
      </div>
    );
  }

  if (!record) {
    return (
      <div aria-busy="true" className="view-enter">
        <div className="skl-row">
          <div className="skeleton skl-line w-60" />
          <div className="skeleton skl-line w-40" />
        </div>
        <div className="skl-row">
          <div className="skeleton skl-line w-75" />
          <div className="skeleton skl-line w-40" />
        </div>
      </div>
    );
  }

  const d = record;
  // MetaMask sessions write straight to the deployed contract (real GEN).
  const onchain = kind === "injected" && onchainAvailable();
  const isClaimant = Boolean(account) && sameAddress(d.claimant, account);
  const isRespondent = Boolean(account) && sameAddress(d.respondent, account);
  const isParty = isClaimant || isRespondent;
  const joined = Boolean(d.joined);
  const executed = Boolean(d.executed);
  const defaulted = Boolean(d.defaulted);
  const amountWei = BigInt(d.amount_wei);
  const evidenceClosedMs = d.evidence_deadline * 1000 - nowTs;
  const evidenceClosed = evidenceClosedMs <= 0;
  const readyClaimant = Boolean(d.ready_claimant);
  const readyRespondent = Boolean(d.ready_respondent);
  const bothReady = readyClaimant && readyRespondent;
  const windowClosedForRuling = evidenceClosed || bothReady;
  const hasSignaled = (isClaimant && readyClaimant) || (isRespondent && readyRespondent);

  async function run(name: string, fn: (acct: string) => Promise<unknown>, successMsg: string) {
    if (status !== "connected" || !account) {
      notify("Connect your wallet first.", "error");
      return;
    }
    setBusyAction(name);
    try {
      await fn(account);
      notify(successMsg, "success");
      setEvOpen(false);
      setEvDesc("");
      setEvUrl("");
      await load();
      onChanged();
      await refreshBalance();
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err), "error");
    } finally {
      setBusyAction("");
    }
  }

  const submitEvidence = () =>
    run(
      "evidence",
      async (acct) => {
        const desc = evDesc.trim();
        if (!(EVIDENCE_DESC_MIN <= desc.length && desc.length <= EVIDENCE_DESC_MAX)) {
          throw new Error(
            `Description must be ${EVIDENCE_DESC_MIN}-${EVIDENCE_DESC_MAX} characters.`,
          );
        }
        const url = evUrl.trim();
        if (url && !isValidEvidenceUrl(url)) {
          throw new Error("Evidence URL must be https:// (private hosts blocked)");
        }
        if (onchain) {
          await writeOnchain("submit_evidence", [d.id, desc, url], 0n, acct);
        } else {
          await client.submitEvidence(d.id, desc, url, acct);
        }
      },
      "Evidence submitted.",
    );

  const requestResolution = async () => {
    setReviewing(true);
    try {
      await run(
        "resolve",
        (acct) =>
          onchain
            ? writeOnchain("request_resolution", [d.id], 0n, acct)
            : client.requestResolution(d.id, acct),
        "Verdict reached.",
      );
    } finally {
      setReviewing(false);
    }
  };

  const join = () =>
    run(
      "join",
      (acct) =>
        onchain
          ? writeOnchain("join_dispute", [d.id], d.amount_wei, acct)
          : client.joinDispute(d.id, d.amount_wei, acct),
      `Joined — ${fmtGen(amountWei)} locked as your stake.`,
    );

  const recordDefault = () =>
    run(
      "default",
      (acct) =>
        onchain
          ? writeOnchain("default_judgment", [d.id], 0n, acct)
          : client.defaultJudgment(d.id, acct),
      "Default judgment recorded.",
    );

  const signalReady = () =>
    run(
      "ready",
      (acct) =>
        onchain
          ? writeOnchain("signal_ready", [d.id], 0n, acct)
          : client.signalReady(d.id, acct),
      "Ready signaled — waiting for counterparty.",
    );

  const executeRuling = () =>
    run(
      "execute",
      (acct) =>
        onchain
          ? writeOnchain("execute_ruling", [d.id], 0n, acct)
          : client.executeRuling(d.id, acct),
      "Ruling executed — payouts sent.",
    );

  const allEvidence = [
    ...d.claimant_evidence.map((e) => ({ ...e, side: "Claimant" as const })),
    ...d.respondent_evidence.map((e) => ({ ...e, side: "Respondent" as const })),
  ].sort((a, b) => a.submitted_at - b.submitted_at);

  // ── Actions panel (identical gating to the reference view) ──────────────
  type Action = {
    key: string;
    label: string;
    onClick: () => void;
    icon: React.ReactNode;
    tone?: "primary" | "ghost";
  };
  const btns: Action[] = [];
  let note = "";

  const evidenceButton = (): Action => ({
    key: "evidence",
    label: evOpen ? "Close evidence form" : "Submit evidence",
    onClick: () => setEvOpen((o) => !o),
    icon: <FilePlus2 size={14} />,
    tone: "ghost",
  });

  if (d.status === "open" && !joined) {
    if (isRespondent) {
      btns.push({
        key: "join",
        label: busyAction === "join" ? "Locking stake…" : `Join & lock ${fmtGen(amountWei)}`,
        onClick: () => void join(),
        icon: <Handshake size={14} />,
        tone: "primary",
      });
    } else {
      note = `Waiting for the respondent to join and lock ${fmtGen(amountWei)}.`;
    }
    if (evidenceClosed) {
      btns.push({
        key: "default",
        label: busyAction === "default" ? "Recording…" : "Record default judgment",
        onClick: () => void recordDefault(),
        icon: <Gavel size={14} />,
        tone: "primary",
      });
    }
    if (isParty && !evidenceClosed) {
      btns.push(evidenceButton());
    }
  } else if (d.status === "open" && joined) {
    if (isParty) {
      if (windowClosedForRuling) {
        btns.push({
          key: "resolve",
          label: busyAction === "resolve" ? "Validators ruling…" : "Request AI resolution",
          onClick: () => void requestResolution(),
          icon: <Bot size={14} />,
          tone: "primary",
        });
        if (!bothReady && !evidenceClosed) btns.push(evidenceButton());
      } else {
        if (!hasSignaled) {
          btns.push({
            key: "ready",
            label: busyAction === "ready" ? "Signaling…" : "Signal ready to rule now",
            onClick: () => void signalReady(),
            icon: <CheckCircle2 size={14} />,
            tone: "primary",
          });
        } else {
          note =
            "You have signaled ready. Waiting for counterparty to agree to close early — or until the evidence window elapses.";
        }
        if (!evidenceClosed && !bothReady) btns.push(evidenceButton());
        if (!note) {
          note = `Evidence window open for ${fmtRemaining(evidenceClosedMs)}. Both parties must signal ready to request a ruling early.`;
        }
      }
    } else {
      note = windowClosedForRuling
        ? "Both stakes are locked. The parties can request AI resolution."
        : `Evidence window open for ${fmtRemaining(evidenceClosedMs)}. Ruling requires the full window or a mutual early close.`;
    }
  } else if (d.status === "under_review") {
    note = "AI validators are reviewing this dispute; resolution is pending consensus.";
  } else if (d.status === "resolved") {
    if (executed) {
      note = `Settled. ${fmtGen(d.payout_claimant_wei)} paid to claimant, ${fmtGen(d.payout_respondent_wei)} to respondent.`;
    } else {
      btns.push({
        key: "execute",
        label: busyAction === "execute" ? "Executing…" : "Execute ruling (settle now)",
        onClick: () => void executeRuling(),
        icon: <CircleDollarSign size={14} />,
        tone: "primary",
      });
      note = `Single final ruling — settleable now by anyone. Pays: ${previewPayout(d)}.`;
    }
  }

  const verdictView = d.verdict ? VERDICT_VIEW[d.verdict] : undefined;

  return (
    <div className="view-enter">
      <button type="button" className="back-link" onClick={() => goto("disputes")}>
        <ArrowLeft size={13} /> All dockets
      </button>

      <div className="detail-grid">
        <div className="detail-main">
          {/* ── Overview ─────────────────────────────────────────── */}
          <section className="panel">
            <div className="panel-tag smallcaps">Dispute Overview</div>
            <div className="chip-row">
              <span className="chip chip-cat">{CATEGORY_LABEL[d.category] || d.category}</span>
              <span className="docket-id">#{String(d.id).padStart(4, "0")}</span>
              <span className={`chip chip-${d.status === "open" ? (joined ? "active" : "open") : d.status === "under_review" ? "review" : executed ? "settled" : "resolved"}`}>
                <span className="chip-dot" />
                {d.status === "open" ? (joined ? "in escrow" : "awaiting join") : d.status.replace("_", " ")}
              </span>
              {d.rounds > 0 && <span className="chip">round {d.rounds}</span>}
              {defaulted && <span className="chip chip-default">default win</span>}
              {executed && <span className="chip chip-settled">settled</span>}
            </div>
            <h1 className="detail-title">{d.title}</h1>
            <p className="detail-desc">{d.description}</p>
            <div className="kv-row">
              <div className="kv">
                <span className="kv-k smallcaps">Stakes locked</span>
                <span className="kv-v">
                  {fmtGen(amountWei)}
                  {joined ? " ×2" : ""}
                </span>
              </div>
              <div className="kv">
                <span className="kv-k smallcaps">Filed</span>
                <span className="kv-v">{timeAgo(d.created_at)}</span>
              </div>
              <div className="kv">
                <span className="kv-k smallcaps">
                  <Clock3 size={11} /> Evidence window
                </span>
                <span className={`kv-v mono${evidenceClosed || bothReady ? " dim" : " glow-cyan"}`}>
                  {bothReady ? "closed early — mutual" : evidenceClosed ? "closed" : fmtRemaining(evidenceClosedMs)}
                </span>
              </div>
            </div>
          </section>

          {/* ── Verdict (terminal panel) ─────────────────────────── */}
          {(d.status === "resolved" || d.verdict) && (
            <section className="panel verdict-panel">
              <div className="verdict-head">
                <span className="verdict-dots" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                <span className="panel-tag smallcaps">AI Arbitration Verdict</span>
              </div>
              <div className={`verdict-word verdict-${verdictView?.tone ?? "cyan"}`}>
                {verdictView?.label || d.verdict || "—"}
              </div>
              <div className="verdict-meta mono">
                {d.arb_validators > 0 && (
                  <span>
                    Consensus {d.arb_agreement} · {d.arb_validators} validators ·{" "}
                    {engineLabel(d.arb_engine)}
                  </span>
                )}
                {d.status === "resolved" && !executed && (
                  <span className="glow-amber"> · final, settleable now</span>
                )}
                {executed && <span className="glow-green"> · settled on the ledger</span>}
              </div>
              {d.arb_validators > 0 && (
                <div className="validator-row" aria-label="Validator votes">
                  {Array.from({ length: d.arb_validators }).map((_, i) => (
                    <span key={i} className="validator-node on">
                      <Bot size={12} />
                    </span>
                  ))}
                </div>
              )}
              <p className="verdict-reason mono">{d.reasoning || "No reasoning recorded."}</p>
              {d.arb_signals.length > 0 && (
                <div className="signal-row">
                  {d.arb_signals.map((s) => (
                    <span key={s} className="signal-chip mono">
                      {s}
                    </span>
                  ))}
                </div>
              )}
              {d.sources.filter((s) => s.url).length > 0 && (
                <div className="sources-list">
                  {d.sources
                    .filter((s) => s.url)
                    .map((s, i) => (
                      <div key={i} className="source-row mono">
                        {s.reachable ? (
                          <Link2 size={12} className="glow-green" />
                        ) : (
                          <Unplug size={12} className="glow-rose" />
                        )}
                        <span className="source-url">{s.url}</span>
                        <span className={`source-flag ${s.reachable ? "ok" : "bad"}`}>
                          {s.reachable ? "fetched" : "unreachable"}
                        </span>
                      </div>
                    ))}
                </div>
              )}
            </section>
          )}

          {reviewing && (
            <section className="panel review-panel" aria-busy="true">
              <div className="panel-tag smallcaps">
                <Bot size={13} /> Consensus in progress
              </div>
              <p className="mono review-line">
                validators fetching linked sources… every ruling weighs what they actually read
              </p>
              <div className="review-bar">
                <span />
              </div>
            </section>
          )}

          {/* ── Parties ──────────────────────────────────────────── */}
          <section className="panel">
            <div className="panel-tag smallcaps">Parties Involved</div>
            <div className="party-grid">
              <div className={`party${isClaimant ? " me" : ""}`}>
                <div className="party-role smallcaps">
                  Claimant{isClaimant ? " · you" : ""}
                </div>
                <div className="party-addr mono">{d.claimant}</div>
              </div>
              <div className={`party${isRespondent ? " me" : ""}`}>
                <div className="party-role smallcaps">
                  Respondent{joined ? " · joined" : ""}
                  {isRespondent ? " · you" : ""}
                </div>
                <div className="party-addr mono">{d.respondent}</div>
              </div>
            </div>
          </section>

          {/* ── Evidence ─────────────────────────────────────────── */}
          <section className="panel">
            <div className="panel-head-row">
              <div className="panel-tag smallcaps">Evidence Submitted</div>
              {isParty && d.status === "open" && !evidenceClosed && !bothReady && (
                <button type="button" className="btn btn-ghost-sm" onClick={() => setEvOpen((o) => !o)}>
                  <FilePlus2 size={13} /> {evOpen ? "Close" : "Add evidence"}
                </button>
              )}
            </div>
            <p className="panel-hint">
              Validators fetch linked sources themselves at ruling time — judge-worthy evidence
              points at a real page.
            </p>

            {evOpen && (
              <div className="ev-form">
                <label htmlFor="ev-desc">Evidence Description</label>
                <input
                  id="ev-desc"
                  type="text"
                  placeholder="What does this evidence show?"
                  value={evDesc}
                  onChange={(e) => setEvDesc(e.target.value)}
                />
                <label htmlFor="ev-url">Source URL (https only, optional)</label>
                <input
                  id="ev-url"
                  type="text"
                  className="mono"
                  placeholder="https://…"
                  value={evUrl}
                  onChange={(e) => setEvUrl(e.target.value)}
                />
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={
                    busyAction === "evidence" ||
                    evDesc.trim().length < EVIDENCE_DESC_MIN ||
                    (evUrl.trim() !== "" && !isValidEvidenceUrl(evUrl))
                  }
                  onClick={() => void submitEvidence()}
                >
                  {busyAction === "evidence" ? "Submitting…" : "Submit evidence"}
                </button>
              </div>
            )}

            {allEvidence.length === 0 ? (
              <div className="ev-empty mono">— nothing submitted yet —</div>
            ) : (
              <div className="ev-list">
                {allEvidence.map((e, i) => (
                  <div key={i} className="ev-row">
                    <span className={`chip ${e.side === "Claimant" ? "chip-claimant" : "chip-respondent"}`}>
                      {e.side}
                    </span>
                    <div className="ev-body">
                      <div className="ev-desc">{e.description}</div>
                      {e.url && (
                        <a
                          className="ev-url mono"
                          href={e.url}
                          target="_blank"
                          rel="noreferrer noopener"
                        >
                          <ExternalLink size={11} /> {e.url}
                        </a>
                      )}
                    </div>
                    <span className="ev-time mono">{timeAgo(e.submitted_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* ── Action rail ────────────────────────────────────────── */}
        <aside className="detail-rail">
          <section className="panel rail-actions">
            <div className="panel-tag smallcaps">
              <ShieldQuestion size={13} /> Actions
            </div>
            {status !== "connected" && (
              <button type="button" className="btn btn-primary btn-block" onClick={() => void connect()}>
                Connect wallet
              </button>
            )}
            {btns.map((b) => (
              <button
                key={b.key}
                type="button"
                className={`btn btn-block ${b.tone === "primary" ? "btn-primary" : "btn-secondary"}`}
                disabled={Boolean(busyAction) && busyAction !== b.key}
                onClick={b.onClick}
              >
                {b.icon} {b.label}
              </button>
            ))}
            {note && <p className="rail-note">{note}</p>}
          </section>

          <section className="panel rail-timeline">
            <div className="panel-tag smallcaps">
              <Hourglass size={13} /> Settlement path
            </div>
            <ol className="timeline">
              <li className="done">
                <span className="tl-dot" /> Filed · {timeAgo(d.created_at)}
              </li>
              <li className={joined ? "done" : ""}>
                <span className="tl-dot" /> {joined ? "Respondent joined" : "Awaiting respondent"}
              </li>
              <li className={d.verdict ? "done" : ""}>
                <span className="tl-dot" /> {d.verdict ? "AI ruling recorded" : "AI ruling pending"}
              </li>
              <li className={executed ? "done" : ""}>
                <span className="tl-dot" /> {executed ? "Settled" : "Settlement executable"}
              </li>
            </ol>
            <p className="rail-note dim small">
              Settlement is permissionless — anyone can execute the moment the final ruling
              exists, and the executor cannot steer the outcome.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
