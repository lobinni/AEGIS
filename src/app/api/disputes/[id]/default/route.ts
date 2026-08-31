import { NextRequest, NextResponse } from "next/server";
import { defaultJudgment } from "@/lib/server/chain";
import { fail, parseId, requireAccount } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/** default_judgment — permissionless once the window passed with no join. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    requireAccount((await req.json()) as Record<string, unknown>); // anyone may call, wallet required
    const result = await defaultJudgment(parseId(id));
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return fail(err);
  }
}
