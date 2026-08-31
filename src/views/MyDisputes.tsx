"use client";

import { useEffect, useState } from "react";
import { UserRound } from "lucide-react";
import { client, type DisputeSummary } from "@/lib/chain";
import { useWallet } from "@/hooks/useWallet";
import { DisputeCard } from "@/components/DisputeCard";
import type { Route } from "@/components/App";

/** Cases where the connected wallet is claimant or respondent. */
export function MyDisputes({
  bumpKey,
  goto,
}: {
  bumpKey: number;
  goto: (view: Route["view"], id?: number) => void;
}) {
  const { status, account, connect } = useWallet();
  const [items, setItems] = useState<DisputeSummary[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    if (status !== "connected" || !account) {
      setItems(null);
      return;
    }
    (async () => {
      try {
        setError("");
        const { items } = await client.listDisputes(0, 50, account);
        if (!cancelled) setItems(items);
      } catch (err) {
        if (!cancelled) {
          setItems([]);
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status, account, bumpKey]);

  if (status !== "connected") {
    return (
      <div className="empty-state view-enter" style={{ marginTop: "4rem" }}>
        <div className="empty-icon">
          <UserRound size={22} />
        </div>
        <h3>Connect to see your cases</h3>
        <p>Your dockets follow your wallet — claimant side and respondent side alike.</p>
        <button type="button" className="cta-solid u-mt-md" onClick={() => void connect()}>
          Connect wallet
        </button>
      </div>
    );
  }

  return (
    <div className="view-enter">
      <div className="page-head">
        <div>
          <h1 className="page-title">My cases</h1>
          <p className="page-sub">
            Every docket where <span className="mono">{account}</span> is a party.
          </p>
        </div>
      </div>

      {error && (
        <p className="alert-line" role="alert">
          Could not reach the ledger: {error}
        </p>
      )}

      {!items && !error && (
        <div aria-busy="true">
          {[0, 1].map((i) => (
            <div className="skl-row" key={i}>
              <div className="skeleton skl-line w-60" />
              <div className="skeleton skl-line w-40" />
            </div>
          ))}
        </div>
      )}

      {items && items.length === 0 && !error && (
        <div className="empty-state">
          <div className="empty-icon">§</div>
          <h3>No cases yet</h3>
          <p>File a dispute — or wait to be named as a respondent — and it lands here.</p>
          <button type="button" className="cta-outline u-mt-md" onClick={() => goto("file")}>
            File a dispute
          </button>
        </div>
      )}

      <div className="docket-grid">
        {(items ?? []).map((d) => (
          <DisputeCard key={d.id} dispute={d} onOpen={(id) => goto("detail", id)} />
        ))}
      </div>
    </div>
  );
}
