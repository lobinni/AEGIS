import { NextRequest, NextResponse } from "next/server";
import { executeRuling } from "@/lib/server/chain";
import { fail, parseId, requireAccount } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/**
 * execute_ruling — permissionless, deterministic, IMMEDIATE once the single
 * ruling exists. The winner sweeps both stakes; splits/dismissals refund
 * everyone their own. The caller cannot steer the outcome.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    requireAccount((await req.json()) as Record<string, unknown>);
    const result = await executeRuling(parseId(id));
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return fail(err);
  }
}
