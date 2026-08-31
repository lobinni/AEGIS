"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  Copy,
  Droplets,
  ExternalLink,
  Loader2,
  LogOut,
  Wallet,
} from "lucide-react";
import { useWallet } from "@/hooks/useWallet";
import { switchToStudionet, STUDIONET_CHAIN_ID, STUDIONET_PARAMS } from "@/lib/wallet";
import { fmtGen, shortAddress } from "@/lib/chain";

/** Connect / account pill — MetaMask on Studionet, or a local test wallet. */
export function WalletButton() {
  const {
    status,
    account,
    kind,
    chainId,
    balanceWei,
    hasInjected,
    connect,
    disconnect,
    faucet,
  } = useWallet();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busyFaucet, setBusyFaucet] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  if (status !== "connected" || !account) {
    return (
      <button
        type="button"
        className="wallet-connect"
        onClick={() => void connect()}
        disabled={status === "connecting"}
      >
        {status === "connecting" ? (
          <Loader2 size={14} className="spin" />
        ) : (
          <Wallet size={14} />
        )}
        {status === "connecting"
          ? "Connecting…"
          : hasInjected
            ? "Connect wallet"
            : "Open test wallet"}
      </button>
    );
  }

  const wrongNetwork = kind === "injected" && chainId != null && chainId !== STUDIONET_CHAIN_ID;

  return (
    <div className="wallet-wrap" ref={wrapRef}>
      <button
        type="button"
        className={`wallet-pill${wrongNetwork ? " warn" : ""}`}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className={`wallet-dot${wrongNetwork ? " amber" : ""}`} />
        <span className="wallet-addr">{shortAddress(account, 4)}</span>
        <span className="wallet-bal">
          {wrongNetwork ? "Wrong network" : balanceWei != null ? fmtGen(balanceWei) : "· GEN"}
        </span>
      </button>

      {open && (
        <div className="wallet-menu" role="menu">
          <div className="wallet-menu-head">
            <span className="smallcaps">
              {kind === "injected" ? "MetaMask" : "Local test wallet"}
            </span>
            <span className="wallet-menu-addr">{account}</span>
          </div>

          {wrongNetwork && (
            <button
              type="button"
              className="wallet-menu-item warn"
              onClick={() => void switchToStudionet()}
            >
              <AlertTriangle size={13} /> Switch to GenLayer Studio (61999)
            </button>
          )}

          <button
            type="button"
            className="wallet-menu-item"
            onClick={() => {
              void navigator.clipboard?.writeText(account);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? <Check size={13} /> : <Copy size={13} />} Copy address
          </button>

          {kind === "injected" && (
            <a
              className="wallet-menu-item"
              href={`${STUDIONET_PARAMS.blockExplorerUrls[0]}/address/${account}`}
              target="_blank"
              rel="noreferrer noopener"
            >
              <ExternalLink size={13} /> View on explorer
            </a>
          )}

          {kind === "local" && (
            <button
              type="button"
              className="wallet-menu-item"
              disabled={busyFaucet}
              onClick={async () => {
                setBusyFaucet(true);
                try {
                  await faucet();
                } catch {
                  /* toast already shown */
                } finally {
                  setBusyFaucet(false);
                }
              }}
            >
              <Droplets size={13} /> {busyFaucet ? "Requesting…" : "Testnet faucet (+10,000 GEN)"}
            </button>
          )}

          <button type="button" className="wallet-menu-item danger" onClick={disconnect}>
            <LogOut size={13} /> Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
