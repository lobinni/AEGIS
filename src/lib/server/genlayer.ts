import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import type { CalldataEncodable } from "genlayer-js/types";
import deployments from "../../../deployments.json";

/**
 * Server-side read client for the deployed AEGIS Intelligent Contract on the
 * GenLayer Studio network (chain 61999). Route handlers under /api/onchain
 * proxy these reads so the dApp can render the real on-chain docket without
 * CORS trouble, while writes are signed by the user's wallet in the browser.
 */

export const ONCHAIN_CONTRACT = (
  process.env.AEGIS_CONTRACT_ADDRESS ||
  process.env.NEXT_PUBLIC_AEGIS_CONTRACT_ADDRESS ||
  deployments.studionet.contracts.AEGISArbitration.address ||
  ""
).trim();

export function onchainEnabled(): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(ONCHAIN_CONTRACT);
}

/** Normalize genlayer-js decoded values into plain JSON-shaped data. */
function norm(value: unknown): unknown {
  if (value instanceof Map) {
    return Object.fromEntries(
      [...value.entries()].map(([k, v]) => [String(k), norm(v)]),
    );
  }
  if (Array.isArray(value)) return value.map(norm);
  if (typeof value === "bigint") {
    const n = Number(value);
    return Number.isSafeInteger(n) ? n : value.toString();
  }
  return value;
}

export async function readContractValue<T = unknown>(
  functionName: string,
  args: CalldataEncodable[] = [],
): Promise<T> {
  const client = createClient({ chain: studionet });
  const out = (await client.readContract({
    address: ONCHAIN_CONTRACT as `0x${string}`,
    functionName,
    args,
  })) as unknown;
  return norm(out) as T;
}
