"use client";

import { notify } from "@/lib/toast";

/**
 * Wallet store — shared external store so every useWallet() caller observes
 * the same connection.
 *
 * Two connection modes:
 *  - MetaMask (any injected EIP-1193 provider) on the GenLayer Studio network
 *    (chain 61999). If the wallet is on another chain the app offers to
 *    switch, and adds the network via EIP-3085 when it is unknown.
 *  - A local test wallet (no extension required): an EVM-shaped address
 *    persisted in localStorage, funded from the hosted testnet faucet so the
 *    full protocol flow can be tried without installing anything.
 */

export type WalletStatus = "disconnected" | "connecting" | "connected";
export type WalletKind = "injected" | "local" | null;

export interface WalletState {
  status: WalletStatus;
  account: string | null;
  kind: WalletKind;
  chainId: number | null;
  balanceWei: string | null;
}

export const STUDIONET_CHAIN_ID = 61999;
const STUDIONET_CHAIN_HEX = "0xF22F"; // 61999
export const STUDIONET_PARAMS = {
  chainId: STUDIONET_CHAIN_HEX,
  chainName: "GenLayer Studio",
  nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
  rpcUrls: ["https://studio.genlayer.com/api"],
  blockExplorerUrls: ["https://explorer-studio.genlayer.com"],
};

const STORAGE_KEY = "aegis.wallet.v2";

let state: WalletState = {
  status: "disconnected",
  account: null,
  kind: null,
  chainId: null,
  balanceWei: null,
};
const listeners = new Set<() => void>();

function set(next: Partial<WalletState>) {
  state = { ...state, ...next };
  for (const fn of listeners) fn();
}

export function subscribeWallet(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getWallet(): WalletState {
  return state;
}

interface Eip1193 {
  request(args: { method: string; params?: unknown[] | object }): Promise<unknown>;
  on?(event: string, handler: (...args: unknown[]) => void): void;
}

export function injectedProvider(): Eip1193 | null {
  if (typeof window === "undefined") return null;
  const eth = (window as unknown as { ethereum?: Eip1193 }).ethereum;
  return eth ?? null;
}

function randomAddress(): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return "0x" + [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ── Hosted-ledger helpers (local test wallets only) ─────────────────────────

async function apiFetch<T>(path: string, body?: Record<string, unknown>): Promise<T> {
  const res = await fetch(path, {
    method: body ? "POST" : "GET",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(typeof json.error === "string" ? json.error : `HTTP ${res.status}`);
  }
  return json as T;
}

/** Https the hosted faucet; returns the new ledger balance. */
export async function requestFaucet(account: string): Promise<string> {
  const data = await apiFetch<{ balance_wei: string }>("/api/faucet", { account });
  return data.balance_wei;
}

async function fetchLedgerBalance(account: string): Promise<string> {
  const data = await apiFetch<{ balance_wei: string }>(`/api/accounts/${account}`);
  return data.balance_wei;
}

async function currentChainId(provider: Eip1193): Promise<number | null> {
  try {
    const hex = (await provider.request({ method: "eth_chainId" })) as string;
    return parseInt(hex, 16);
  } catch {
    return null;
  }
}

/** Ensure the wallet sits on the GenLayer Studio network (61999). */
export async function ensureStudionet(provider: Eip1193): Promise<number> {
  const chainId = await currentChainId(provider);
  if (chainId === STUDIONET_CHAIN_ID) return chainId;
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: STUDIONET_CHAIN_HEX }],
    });
  } catch (err) {
    const code = (err as { code?: number } | null)?.code;
    const message = err instanceof Error ? err.message : String(err);
    if (code === 4902 || /unrecognized|not been added|unknown chain/i.test(message)) {
      // Network unknown to the wallet — offer to add it (EIP-3085).
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [STUDIONET_PARAMS],
      });
    } else {
      throw new Error("Please switch to the GenLayer Studio network (chain 61999) to continue.");
    }
  }
  const after = await currentChainId(provider);
  return after ?? STUDIONET_CHAIN_ID;
}

function attachProviderListeners(provider: Eip1193) {
  if (!provider.on) return;
  provider.on("accountsChanged", (...args: unknown[]) => {
    const list = args[0] as string[];
    if (!list?.length) {
      disconnectWallet();
      return;
    }
    set({ account: list[0] });
    void refreshBalance();
  });
  provider.on("chainChanged", (...args: unknown[]) => {
    const hex = args[0] as string;
    const chainId = parseInt(hex, 16);
    set({ chainId });
    void refreshBalance();
  });
}

async function postConnect(account: string, kind: WalletKind, chainId: number | null) {
  set({ status: "connected", account, kind, chainId });
  if (kind === "local") {
    // Bootstrap the local wallet from the hosted faucet (rate-limited
    // server-side, safe to attempt on every connect).
    await requestFaucet(account).catch(() => null);
  }
  await refreshBalance();
}

export async function connectWallet(): Promise<void> {
  if (state.status === "connecting") return;
  set({ status: "connecting" });
  try {
    const provider = injectedProvider();
    if (provider) {
      const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
      const account = accounts?.[0];
      if (!account) throw new Error("No account returned by the wallet.");
      const chainId = await ensureStudionet(provider);
      attachProviderListeners(provider);
      persist(account, "injected");
      await postConnect(account, "injected", chainId);
      notify("Wallet connected on the GenLayer Studio network.", "success");
    } else {
      let account: string | null = null;
      let isNew = false;
      try {
        account = localStorage.getItem(STORAGE_KEY + ".local");
      } catch {
        /* ignore */
      }
      if (!account) {
        account = randomAddress();
        isNew = true;
        try {
          localStorage.setItem(STORAGE_KEY + ".local", account);
        } catch {
          /* ignore */
        }
      }
      persist(account, "local");
      await postConnect(account, "local", null);
      notify(
        isNew
          ? "Local test wallet created and funded from the testnet faucet."
          : "Local test wallet reconnected.",
        "success",
      );
    }
  } catch (err) {
    set({ status: "disconnected", account: null, kind: null, chainId: null });
    notify(err instanceof Error ? err.message : String(err), "error");
  }
}

/** Switch / add the Studionet network for an already-connected injected wallet. */
export async function switchToStudionet(): Promise<void> {
  const provider = injectedProvider();
  if (!provider) return;
  try {
    const chainId = await ensureStudionet(provider);
    set({ chainId });
    await refreshBalance();
    notify("Switched to the GenLayer Studio network.", "success");
  } catch (err) {
    notify(err instanceof Error ? err.message : String(err), "error");
  }
}

function persist(account: string, kind: WalletKind) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ account, kind }));
  } catch {
    /* ignore */
  }
}

export function disconnectWallet() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  set({ status: "disconnected", account: null, kind: null, chainId: null, balanceWei: null });
  notify("Wallet disconnected.", "info");
}

export async function refreshBalance() {
  if (!state.account) return;
  try {
    if (state.kind === "injected") {
      // Real on-chain GEN balance from the Studionet account.
      const provider = injectedProvider();
      if (!provider) return;
      const hex = (await provider.request({
        method: "eth_getBalance",
        params: [state.account, "latest"],
      })) as string;
      set({ balanceWei: BigInt(hex).toString() });
    } else {
      set({ balanceWei: await fetchLedgerBalance(state.account) });
    }
  } catch {
    /* keep previous balance */
  }
}

/** Restore a persisted session on first client render. */
let hydrated = false;
export function hydrateWallet() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const { account, kind } = JSON.parse(raw) as { account?: string; kind?: WalletKind };
    if (!account || !/^0x[0-9a-fA-F]{40}$/.test(account)) return;
    void (async () => {
      let chainId: number | null = null;
      if (kind === "injected") {
        const provider = injectedProvider();
        if (!provider) return; // extension gone — stay disconnected
        chainId = await currentChainId(provider);
        attachProviderListeners(provider);
      }
      set({ status: "connected", account, kind: kind ?? "local", chainId });
      await refreshBalance();
    })();
  } catch {
    /* ignore */
  }
}
