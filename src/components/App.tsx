"use client";

import { useCallback, useState } from "react";
import { Hexagon, LayoutGrid, FilePlus2, Briefcase, Wallet } from "lucide-react";
import { Landing } from "@/views/Landing";
import { AllDisputes } from "@/views/AllDisputes";
import { FileDispute } from "@/views/FileDispute";
import { MyDisputes } from "@/views/MyDisputes";
import { DisputeDetail } from "@/views/DisputeDetail";
import { WalletButton } from "@/components/WalletButton";
import { Toasts } from "@/components/Toasts";
import { useWallet } from "@/hooks/useWallet";

export interface Route {
  view: "landing" | "disputes" | "file" | "my" | "detail";
  id?: number;
}

const NAV: { key: Route["view"]; label: string; icon: React.ReactNode }[] = [
  { key: "disputes", label: "Dockets", icon: <LayoutGrid size={13} /> },
  { key: "file", label: "File dispute", icon: <FilePlus2 size={13} /> },
  { key: "my", label: "My cases", icon: <Briefcase size={13} /> },
];

/** Shell + state router — the reference App.jsx, Next.js edition. */
export default function App() {
  const [route, setRoute] = useState<Route>({ view: "landing" });
  const [bumpKey, setBumpKey] = useState(0);
  const { status, connect } = useWallet();

  const goto = useCallback((view: Route["view"], id?: number) => {
    setRoute({ view, id });
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, []);

  const bump = useCallback(() => setBumpKey((k) => k + 1), []);

  const inApp = route.view !== "landing";

  return (
    <div className="app-shell">
      <div className="bg-grid" aria-hidden="true" />
      <div className="bg-glow bg-glow-a" aria-hidden="true" />
      <div className="bg-glow bg-glow-b" aria-hidden="true" />

      <header className="topbar">
        <button type="button" className="brand" onClick={() => goto("landing")}>
          <span className="brand-mark">
            <Hexagon size={20} strokeWidth={1.7} />
            <span className="brand-core" />
          </span>
          <span className="brand-word">
            AEGIS<span className="brand-tag smallcaps">AI arbitration</span>
          </span>
        </button>

        <nav className="topnav" aria-label="Primary">
          {NAV.map((n) => (
            <button
              key={n.key}
              type="button"
              className={`nav-link${route.view === n.key ? " on" : ""}`}
              onClick={() => goto(n.key)}
            >
              {n.icon}
              {n.label}
            </button>
          ))}
        </nav>

        <div className="top-right">
          <span className="net-badge mono" title="GenLayer Studio network">
            <span className="net-dot" />
            GenLayer Studio · 61999
          </span>
          <WalletButton />
        </div>
      </header>

      <main className={`main-wrap${route.view === "landing" ? " is-landing" : ""}`}>
        {route.view === "landing" && <Landing goto={goto} />}
        {route.view === "disputes" && <AllDisputes bumpKey={bumpKey} goto={goto} />}
        {route.view === "file" && <FileDispute onFiled={bump} goto={goto} />}
        {route.view === "my" && <MyDisputes bumpKey={bumpKey} goto={goto} />}
        {route.view === "detail" && route.id != null && (
          <DisputeDetail id={route.id} bumpKey={bumpKey} onChanged={bump} goto={goto} />
        )}

        {inApp && status !== "connected" && route.view !== "file" && (
          <button type="button" className="connect-banner" onClick={() => void connect()}>
            <Wallet size={14} />
            Connect your wallet to file disputes, join cases and settle rulings.
          </button>
        )}
      </main>

      <Toasts />
    </div>
  );
}
