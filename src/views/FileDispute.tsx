"use client";

import { useState } from "react";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import {
  client,
  fmtGen,
  parseGenToWei,
  TITLE_MIN,
  TITLE_MAX,
  DESC_MIN,
  DESC_MAX,
  EVIDENCE_DESC_MIN,
  EVIDENCE_DESC_MAX,
  isValidEvidenceUrl,
} from "@/lib/chain";
import { useWallet } from "@/hooks/useWallet";
import { notify } from "@/lib/toast";
import { onchainAvailable, writeOnchain } from "@/lib/onchain";
import type { Route } from "@/components/App";

const CATEGORIES = [
  { value: "freelance", label: "Freelance / Contract Work" },
  { value: "dao_governance", label: "DAO Governance" },
  { value: "marketplace", label: "Marketplace Transaction" },
];

const BLANK = {
  category: "freelance",
  title: "",
  description: "",
  respondent: "",
  amount: "",
  evidenceDescription: "",
  evidenceUrl: "",
};

/** File a dispute — a real ledger write locking the claimant stake. */
export function FileDispute({
  onFiled,
  goto,
}: {
  onFiled: () => void;
  goto: (view: Route["view"], id?: number) => void;
}) {
  const { status, account, kind, connect } = useWallet();
  const [form, setForm] = useState(BLANK);
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof BLANK) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const titleOk =
    form.title.trim().length >= TITLE_MIN && form.title.trim().length <= TITLE_MAX;
  const descOk =
    form.description.trim().length >= DESC_MIN && form.description.trim().length <= DESC_MAX;
  const respondentOk = /^0x[0-9a-fA-F]{40}$/.test(form.respondent.trim());
  const amountWei = parseGenToWei(form.amount);
  const evDesc = form.evidenceDescription.trim();
  const evidenceOk =
    !evDesc ||
    (evDesc.length >= EVIDENCE_DESC_MIN &&
      evDesc.length <= EVIDENCE_DESC_MAX &&
      isValidEvidenceUrl(form.evidenceUrl));
  const valid = titleOk && descOk && respondentOk && amountWei != null && evidenceOk;

  async function submit() {
    if (!valid || busy) return;
    if (status !== "connected" || !account) {
      notify("Connect your wallet first.", "error");
      return;
    }
    setBusy(true);
    try {
      // The ledger rejects a claimant naming themselves; learn before paying.
      if (form.respondent.trim().toLowerCase() === account.toLowerCase()) {
        throw new Error("Respondent must be a different address than yours.");
      }
      if (kind === "injected" && onchainAvailable()) {
        // MetaMask path: a real on-chain file_dispute — GEN leaves the wallet.
        const hash = await writeOnchain(
          "file_dispute",
          [
            form.category,
            form.title.trim(),
            form.description.trim(),
            form.respondent.trim(),
            BigInt(amountWei as string),
            evDesc,
            form.evidenceUrl.trim(),
          ],
          amountWei as string,
          account,
        );
        notify(
          `Dispute filed on-chain — stake locked (tx ${hash.slice(0, 10)}…).`,
          "success",
        );
        setForm(BLANK);
        onFiled();
        goto("disputes");
        return;
      }
      const id = await client.fileDispute(
        {
          category: form.category,
          title: form.title.trim(),
          description: form.description.trim(),
          respondent: form.respondent.trim(),
          amountWei: amountWei as string,
          evidenceDescription: evDesc,
          evidenceUrl: form.evidenceUrl.trim(),
        },
        account,
      );
      notify(`Dispute #${String(id).padStart(4, "0")} filed — stake locked.`, "success");
      setForm(BLANK);
      onFiled();
      goto("detail", id);
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="form-card view-enter">
      <div className="form-title">File a New Dispute</div>
      <div className="form-subtitle">
        Submit your dispute for AI-powered arbitration. Provide as much detail as possible for
        accurate resolution. Filing locks your stake on the ledger.
      </div>

      <div className="form-grid">
        <div className="form-group">
          <label htmlFor="f-category">Dispute Category</label>
          <select id="f-category" value={form.category} onChange={set("category")}>
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="f-amount">Amount at Stake (GEN)</label>
          <input
            id="f-amount"
            type="text"
            inputMode="decimal"
            placeholder="e.g. 1500"
            value={form.amount}
            onChange={set("amount")}
          />
          {form.amount && amountWei == null && (
            <span className="char-hint bad">Enter a GEN amount (up to 6 decimals)</span>
          )}
          {amountWei != null && (
            <span className="char-hint ok">Locks {fmtGen(amountWei)} as your stake</span>
          )}
        </div>

        <div className="form-group full">
          <label htmlFor="f-title">Dispute Title</label>
          <input
            id="f-title"
            type="text"
            placeholder="Brief, clear title describing the dispute"
            value={form.title}
            onChange={set("title")}
          />
          <span className={`char-hint${titleOk ? "" : " bad"}`}>
            {form.title.trim().length}/{TITLE_MAX} (min {TITLE_MIN})
          </span>
        </div>

        <div className="form-group full">
          <label htmlFor="f-respondent">Respondent Address</label>
          <input
            id="f-respondent"
            type="text"
            className="mono"
            placeholder="0x… wallet address of the other party"
            value={form.respondent}
            onChange={set("respondent")}
          />
          {!respondentOk && form.respondent.length > 0 && (
            <span className="char-hint bad">Must be a valid 0x… address (not your own)</span>
          )}
        </div>

        <div className="form-group full">
          <label htmlFor="f-description">Full Description</label>
          <textarea
            id="f-description"
            placeholder={
              "Describe the dispute in detail: what happened, what was agreed, what went wrong, what outcome you expect…"
            }
            value={form.description}
            onChange={set("description")}
          />
          <span className={`char-hint${descOk ? "" : " bad"}`}>
            {form.description.trim().length}/{DESC_MAX} (min {DESC_MIN})
          </span>
        </div>

        <div className="form-group full">
          <label htmlFor="f-evidence-desc">Initial Evidence — Description (optional)</label>
          <input
            id="f-evidence-desc"
            type="text"
            placeholder="What does this evidence show?"
            value={form.evidenceDescription}
            onChange={set("evidenceDescription")}
          />
          {evDesc && (
            <span className={`char-hint${evidenceOk ? "" : " bad"}`}>
              {evDesc.length}/{EVIDENCE_DESC_MAX} (min {EVIDENCE_DESC_MIN})
            </span>
          )}
        </div>

        <div className="form-group full">
          <label htmlFor="f-evidence-url">Initial Evidence — Source URL (optional)</label>
          <input
            id="f-evidence-url"
            type="text"
            className="mono"
            placeholder="https:// link to contracts, screenshots, messages…"
            value={form.evidenceUrl}
            onChange={set("evidenceUrl")}
          />
          <span className="char-hint">
            AI validators fetch linked sources themselves at ruling time.
          </span>
        </div>
      </div>

      <div className="form-note">
        <ShieldCheck size={14} />
        Filing is an escrow transaction: your stake is locked until the single final ruling is
        executed.
      </div>

      <div className="form-actions">
        <button type="button" className="btn btn-secondary" onClick={() => goto("disputes")}>
          <ArrowLeft size={13} /> Cancel
        </button>
        {status === "connected" ? (
          <button
            type="button"
            className="btn btn-primary"
            disabled={!valid || busy}
            onClick={() => void submit()}
          >
            {busy
              ? kind === "injected"
                ? "Confirm in your wallet…"
                : "Locking stake…"
              : "Submit & lock stake"}
          </button>
        ) : (
          <button type="button" className="btn btn-primary" onClick={() => void connect()}>
            Connect wallet to file
          </button>
        )}
      </div>
    </div>
  );
}
