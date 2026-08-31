"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Landmark, ScanSearch, Zap } from "lucide-react";
import {
  client,
  fmtGen,
  shortAddress,
  STUDIONET_EXPLORER,
  type DisputeSummary,
} from "@/lib/chain";
import { DisputeCard } from "@/components/DisputeCard";
import { NetworkCanvas } from "@/components/NetworkCanvas";
import type { Route } from "@/components/App";

const REDUCED_MOTION =
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Count 0 -> target over ~500ms (stat-led reveal, honest as the reference). */
function useTick(targetText: string) {
  const [display, setDisplay] = useState(targetText);
  const fromRef = useRef(0);

  useEffect(() => {
    const target = Number(targetText.replace(/,/g, ""));
    if (!Number.isFinite(target)) {
      const id = requestAnimationFrame(() => setDisplay(targetText));
      return () => cancelAnimationFrame(id);
    }
    if (REDUCED_MOTION || target === 0) {
      const id = requestAnimationFrame(() => {
        setDisplay(targetText);
        fromRef.current = target;
      });
      return () => cancelAnimationFrame(id);
    }
    const from = fromRef.current;
    const start = performance.now();
    let raf: number;
    const step = (now: number) => {
      const t = Math.min((now - start) / 500, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(
        String(Math.round(from + (target - from) * eased)).replace(
          /\B(?=(\d{3})+(?!\d))/g,
          ",",
        ),
      );
      if (t < 1) raf = requestAnimationFrame(step);
      else fromRef.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [targetText]);

  return display;
}

const STEPS = [
  {
    numeral: "I.",
    icon: Landmark,
    title: "Stakes are locked",
    body: "The claimant files and locks the disputed amount. The respondent matches it to defend the case — or loses by default judgment on the record.",
  },
  {
    numeral: "II.",
    icon: ScanSearch,
    title: "Evidence is fetched, not claimed",
    body: "AI validators retrieve every linked source themselves and rule on what they actually read, reaching comparative consensus on a single final verdict.",
  },
  {
    numeral: "III.",
    icon: Zap,
    title: "Settlement is instant",
    body: "No appeals window, no re-rolls. Anyone can execute at once: the winner sweeps both stakes; splits and dismissals refund everyone their own.",
  },
];

interface Stats {
  total: number;
  settled: number;
  open: number;
  lockedWei: string;
}

export function Landing({ goto }: { goto: (view: Route["view"], id?: number) => void }) {
  const [stats, setStats] = useState<Stats | null>(null); // null = loading
  const [error, setError] = useState("");
  const [recent, setRecent] = useState<DisputeSummary[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setError("");
        const { total, summaries } = await client.allSummaries();
        if (cancelled) return;
        setStats({
          total,
          settled: summaries.filter((d) => d.executed).length,
          open: summaries.filter((d) => !d.executed).length,
          lockedWei: summaries
            .filter((d) => !d.executed)
            .reduce((acc, d) => acc + Number(BigInt(d.locked_wei ?? "0") / 10n ** 18n), 0)
            .toString(),
        });
        setRecent(summaries.slice(0, 4));
      } catch (err) {
        if (!cancelled) {
          setStats({ total: 0, settled: 0, open: 0, lockedWei: "0" });
          setRecent([]);
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const lockedNum = useTick(stats ? stats.lockedWei : "0");

  return (
    <>
      <section className="stat-hero view-enter">
        <NetworkCanvas density={1.1} className="hero-net" />
        <div className="hero-ring" aria-hidden="true" />
        <p className="hero-eyebrow smallcaps">
          <span className="pulse-dot" /> AI arbitration · comparative consensus · real stakes
        </p>
        <div className="hero-figure">
          {stats ? lockedNum : "····"}
          <span className="unit">GEN</span>
        </div>
        <h1 className="hero-headline">in escrow right now, waiting on a verdict.</h1>
        <p className="hero-qualifier">
          Every dispute below is backed by two locked stakes. AI validators fetch the linked
          evidence themselves and converge on one ruling — settleable instantly by anyone.
          No appeals, no re-rolls.
        </p>
        <div className="hero-ctas">
          <button type="button" className="cta-solid" onClick={() => goto("file")}>
            File a dispute <ArrowRight size={14} />
          </button>
          <button type="button" className="cta-outline" onClick={() => goto("disputes")}>
            Enter the dockets
          </button>
        </div>
      </section>

      <section className="stats-strip" aria-label="Ledger totals">
        <div className="stat-cell">
          <div className="stat-num">{stats ? String(stats.total) : "·"}</div>
          <div className="stat-cap smallcaps">Disputes filed</div>
        </div>
        <div className="stat-cell">
          <div className="stat-num">{stats ? String(stats.settled) : "·"}</div>
          <div className="stat-cap smallcaps">Settled</div>
        </div>
        <div className="stat-cell">
          <div className="stat-num">{stats ? String(stats.open) : "·"}</div>
          <div className="stat-cap smallcaps">In escrow</div>
        </div>
        <div className="stat-cell">
          <div className="stat-num grad">{stats ? fmtGen(stats.lockedWei + "000000000000000000") : "·"}</div>
          <div className="stat-cap smallcaps">Total value locked</div>
        </div>
      </section>

      {error && (
        <p className="hero-qualifier u-mt-md alert-line" role="alert">
          Could not reach the ledger: {error}
        </p>
      )}

      <section aria-label="How it works">
        <div className="section-head">
          <h2 className="section-title">How the protocol rules</h2>
          <span className="smallcaps">One ruling · final · settleable now</span>
        </div>
        <div className="docket-steps">
          {STEPS.map((s) => (
            <article key={s.numeral} className="docket-step">
              <div className="step-icon">
                <s.icon size={18} strokeWidth={1.6} />
              </div>
              <div className="step-numeral mono">{s.numeral}</div>
              <h3 className="step-title">{s.title}</h3>
              <p className="step-body">{s.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section aria-label="Live docket">
        <div className="section-head">
          <h2 className="section-title">The live docket</h2>
          <span className="smallcaps">Read straight from the ledger</span>
        </div>
        <div className="live-docket">
          {!stats && (
            <div aria-busy="true">
              <div className="skl-row">
                <div className="skeleton skl-line w-60" />
                <div className="skeleton skl-line w-40" />
              </div>
              <div className="skl-row">
                <div className="skeleton skl-line w-75" />
                <div className="skeleton skl-line w-40" />
              </div>
            </div>
          )}
          {stats && recent.length === 0 && (
            <div className="empty-state">
              <div className="empty-icon">§ 1</div>
              <h3>The docket is empty</h3>
              <p>Nothing has been filed on this ledger yet. The first dispute starts the record.</p>
            </div>
          )}
          {recent.map((d) => (
            <DisputeCard key={String(d.id)} dispute={d} onOpen={(id) => goto("detail", id)} />
          ))}
        </div>
        {stats && recent.length > 0 && (
          <button type="button" className="cta-outline u-mt-md" onClick={() => goto("disputes")}>
            View all dockets <ArrowRight size={13} />
          </button>
        )}
      </section>

      <section className="cta-close">
        <p className="cta-close-line">
          Lock a stake. Link your proof. Let validators read it for themselves.
        </p>
        <button type="button" className="cta-solid u-mt-md" onClick={() => goto("file")}>
          File a dispute <ArrowRight size={14} />
        </button>
      </section>

      <footer className="footer-band">
        <span className="footer-wordmark">AEGIS</span>
        <span className="smallcaps">Decentralized AI arbitration · GenLayer Studio network</span>
        {client.address ? (
          <a
            className="footer-contract smallcaps"
            href={`${STUDIONET_EXPLORER}/address/${client.address}`}
            target="_blank"
            rel="noreferrer noopener"
          >
            Arbitration contract {shortAddress(client.address)} ↗
          </a>
        ) : (
          <span className="footer-contract smallcaps">
            Arbitration contract not deployed yet
          </span>
        )}
      </footer>
    </>
  );
}
