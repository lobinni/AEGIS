import { NextRequest, NextResponse } from "next/server";
import { faucet } from "@/lib/server/chain";
import { fail, requireAccount } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/** Testnet faucet: credits 10,000 GEN to a wallet on the demo ledger (1/hr). */
export async function POST(req: NextRequest) {
  try {
    const account = requireAccount((await req.json()) as Record<string, unknown>);
    const result = await faucet(account);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return fail(err);
  }
}
