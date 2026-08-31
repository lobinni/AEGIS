import { NextRequest, NextResponse } from "next/server";
import { submitEvidence } from "@/lib/server/chain";
import { fail, parseId, requireAccount } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/** submit_evidence — parties only, inside the evidence window. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = (await req.json()) as Record<string, unknown>;
    const account = requireAccount(body);
    await submitEvidence(
      parseId(id),
      account,
      String(body.description ?? ""),
      String(body.url ?? ""),
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fail(err);
  }
}
