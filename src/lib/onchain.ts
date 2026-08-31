"use client";

import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { TransactionStatus, type CalldataEncodable } from "genlayer-js/types";
import { CONTRACT_ADDRESS } from "@/lib/chain";

/**
 * Browser write path for the deployed AEGIS contract: transactions are signed
 * by the user's injected wallet (MetaMask) via genlayer-js, so real GEN leaves
 * the wallet for payable calls (file_dispute / join_dispute) and every state
 * transition lands on the GenLayer Studio network (chain 61999).
 */

export function onchainAvailable(): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(CONTRACT_ADDRESS);
}

export interface OnchainFns {
  fileDispute: "file_dispute";
  joinDispute: "join_dispute";
  signalReady: "signal_ready";
  submitEvidence: "submit_evidence";
  requestResolution: "request_resolution";
  defaultJudgment: "default_judgment";
  executeRuling: "execute_ruling";
}

export async function writeOnchain(
  functionName: string,
  args: CalldataEncodable[],
  valueWei: string | bigint,
  account: string,
): Promise<string> {
  if (!onchainAvailable()) {
    throw new Error("Arbitration contract is not configured on-chain.");
  }
  const client = createClient({
    chain: studionet,
    account: account as `0x${string}`, // MetaMask signs (EIP-1193)
  });
  const hash = await client.writeContract({
    address: CONTRACT_ADDRESS as `0x${string}`,
    functionName,
    args,
    value: BigInt(valueWei),
  });
  // Consensus finalization can take a while (rulings fetch live evidence) —
  // wait patiently so the follow-up read shows the settled state.
  await client.waitForTransactionReceipt({
    hash,
    status: TransactionStatus.FINALIZED,
    interval: 5000,
    retries: 240,
  });
  return hash as string;
}
