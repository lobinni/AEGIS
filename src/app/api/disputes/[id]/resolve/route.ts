import { NextRequest, NextResponse } from "next/server";
import { requestResolution } from "@/lib/server/chain";
import { fail, parseId, requireAccount } from "@/lib/server/http";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

/**
 * request_resolution — THE one AI adjudication. Validators fetch the linked
 * evidence live, reach comparative consensus on a single final verdict, and
 * the case becomes settleable immediately afterwards.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const account = requireAccount((await req.json()) as Record<string, unknown>);
    const record = await requestResolution(parseId(id), account);
    return NextResponse.json({ ok: true, record });
  } catch (err) {
    return fail(err);
  }
}
