"use client";

import { ArrowRight, Scale } from "lucide-react";
import { fmtGen, shortAddress, timeAgo, type DisputeSummary } from "@/lib/chain";
import { CATEGORY_LABEL, VERDICT_VIEW } from "@/lib/labels";

function statusChip(d: DisputeSummary) {
  if (d.executed) return { cls: "chip-settled", label: "settled" };
  if (d.status === "resolved") return { cls: "chip-resolved", label: "ruling ready" };
  if (d.status === "under_review") return { cls: "chip-review", label: "ai review" };
  if (d.joined) return { cls: "chip-active", label: "in escrow" };
  return { cls: "chip-open", label: "awaiting join" };
}

/** One docket row — mirrors the reference DisputeCard. */
export function DisputeCard({
  dispute: d,
  onOpen,
}: {
  dispute: DisputeSummary;
  onOpen: (id: number) => void;
}) {
  const chip = statusChip(d);
  const evCount = d.claimant_evidence_count + d.respondent_evidence_count;
  return (
    <button type="button" className="docket-card" onClick={() => onOpen(d.id)}>
      <div className="docket-top">
        <span className="docket-id">#{String(d.id).padStart(4, "0")}</span>
        <span className="chip chip-cat">{CATEGORY_LABEL[d.category] || d.category}</span>
        <span className={`chip ${chip.cls}`}>
          <span className="chip-dot" />
          {chip.label}
        </span>
        {d.defaulted && <span className="chip chip-default">default win</span>}
      </div>

      <h3 className="docket-title">{d.title}</h3>

      <div className="docket-parties">
        <span className="mono">{shortAddress(d.claimant)}</span>
        <ArrowRight size={12} className="docket-arrow" />
        <span className="mono">{shortAddress(d.respondent)}</span>
      </div>

      <div className="docket-meta">
        <span className="docket-amount">{fmtGen(d.amount_wei)}</span>
        <span className="docket-sub">
          {evCount} evidence · {timeAgo(d.created_at)}
        </span>
        {d.verdict ? (
          <span className={`chip verdict-${VERDICT_VIEW[d.verdict]?.tone ?? "cyan"}`}>
            <Scale size={11} />
            {VERDICT_VIEW[d.verdict]?.label || d.verdict}
          </span>
        ) : null}
      </div>
    </button>
  );
}
