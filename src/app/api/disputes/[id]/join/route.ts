import { NextRequest, NextResponse } from "next/server";
import { joinDispute } from "@/lib/server/chain";
import { fail, parseId, requireAccount } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/** join_dispute — payable: named respondent locks the identical stake. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const account = requireAccount((await req.json()) as Record<string, unknown>);
    const result = await joinDispute(parseId(id), account);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return fail(err);
  }
}
