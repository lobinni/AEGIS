import { NextResponse } from "next/server";
import { getDisputeView } from "@/lib/server/chain";
import { fail, parseId } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/** get_dispute — the full record including evidence + arbitration report. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const record = await getDisputeView(parseId(id));
    return NextResponse.json({ record });
  } catch (err) {
    return fail(err);
  }
}
