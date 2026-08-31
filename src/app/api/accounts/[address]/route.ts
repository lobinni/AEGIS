import { NextResponse } from "next/server";
import { getBalance } from "@/lib/server/chain";
import { fail } from "@/lib/server/http";
import { isAddress } from "@/lib/shared";

export const dynamic = "force-dynamic";

/** Demo-ledger balance for a wallet address. */
export async function GET(_req: Request, ctx: { params: Promise<{ address: string }> }) {
  try {
    const { address } = await ctx.params;
    if (!isAddress(address)) {
      return NextResponse.json({ error: "invalid address" }, { status: 400 });
    }
    return NextResponse.json(await getBalance(address.trim()));
  } catch (err) {
    return fail(err);
  }
}
