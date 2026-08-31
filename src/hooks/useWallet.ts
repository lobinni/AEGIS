"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import {
  connectWallet,
  disconnectWallet,
  getWallet,
  hydrateWallet,
  injectedProvider,
  refreshBalance,
  requestFaucet,
  subscribeWallet,
} from "@/lib/wallet";
import { notify } from "@/lib/toast";

/** Shared wallet connection — the reference frontend's hooks/useWallet.js. */
export function useWallet() {
  const state = useSyncExternalStore(subscribeWallet, getWallet, getWallet);

  useEffect(() => {
    hydrateWallet();
  }, []);

  const api = useMemo(
    () => ({
      ...state,
      hasInjected: typeof window !== "undefined" && Boolean(injectedProvider()),
      connect: connectWallet,
      disconnect: disconnectWallet,
      refreshBalance,
      async faucet() {
        if (!state.account) return;
        try {
          await requestFaucet(state.account);
          await refreshBalance();
          notify("Faucet credited 10,000 GEN.", "success");
        } catch (err) {
          notify(err instanceof Error ? err.message : String(err), "error");
          throw err;
        }
      },
    }),
    [state],
  );

  return api;
}
