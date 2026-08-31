"use client";

import { useCallback, useEffect, useState } from "react";
import { Inbox } from "lucide-react";
import { client, PAGE_MAX, type DisputeSummary } from "@/lib/chain";
import { DisputeCard } from "@/components/DisputeCard";
import type { Route } from "@/components/App";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "open", label: "In escrow" },
  { key: "resolved", label: "Ruled" },
  { key: "settled", label: "Settled" },
] as const;

type Filter = (typeof FILTERS)[number]["key"];

function match(d: DisputeSummary, f: Filter): boolean {
  if (f === "all") return true;
  if (f === "settled") return d.executed;
  if (f === "resolved") return d.status === "resolved" && !d.executed;
  return !d.executed && d.status !== "resolved";
}

/** Every docket on the ledger — paged, filterable, live. */
export function AllDisputes({
  bumpKey,
  goto,
}: {
  bumpKey: number;
  goto: (view: Route["view"], id?: number) => void;
}) {
  const [items, setItems] = useState<DisputeSummary[] | null>(null);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [filter, setFilter] = useState<Filter>("all");
  const [error, setError] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(
    async (off: number, append: boolean) => {
      try {
        setError("");
        const { total, items } = await client.listDisputes(off, PAGE_MAX);
        setTotal(total);
        setItems((prev) => (append && prev ? [...prev, ...items] : items));
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        if (!append) setItems([]);
      }
    },
    [],
  );

  useEffect(() => {
    setOffset(0);
    void load(0, false);
  }, [load, bumpKey]);

  const visible = (items ?? []).filter((d) => match(d, filter));

  return (
    <div className="view-enter">
      <div className="page-head">
        <div>
          <h1 className="page-title">All dockets</h1>
          <p className="page-sub">
            {total} dispute{total === 1 ? "" : "s"} on record — every one backed by locked
            stakes.
          </p>
        </div>
        <div className="filter-row" role="tablist" aria-label="Filter dockets">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              role="tab"
              aria-selected={filter === f.key}
              className={`filter-chip${filter === f.key ? " on" : ""}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className="alert-line" role="alert">
          Could not reach the ledger: {error}
        </p>
      )}

      {!items && !error && (
        <div aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div className="skl-row" key={i}>
              <div className="skeleton skl-line w-60" />
              <div className="skeleton skl-line w-40" />
            </div>
          ))}
        </div>
      )}

      {items && visible.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">
            <Inbox size={22} />
          </div>
          <h3>Nothing in this view</h3>
          <p>No docket matches the current filter. File the next one and it shows up here.</p>
        </div>
      )}

      <div className="docket-grid">
        {visible.map((d) => (
          <DisputeCard key={d.id} dispute={d} onOpen={(id) => goto("detail", id)} />
        ))}
      </div>

      {items && items.length < total && (
        <button
          type="button"
          className="cta-outline u-mt-md"
          disabled={loadingMore}
          onClick={async () => {
            setLoadingMore(true);
            const next = offset + PAGE_MAX;
            setOffset(next);
            await load(next, true);
            setLoadingMore(false);
          }}
        >
          {loadingMore ? "Loading…" : `Load more (${total - items.length} remaining)`}
        </button>
      )}
    </div>
  );
}
