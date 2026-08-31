import { NextRequest, NextResponse } from "next/server";
import { fileDispute, listDisputes, type FileDisputeInput } from "@/lib/server/chain";
import { fail, requireAccount } from "@/lib/server/http";
import { parseGenToWei } from "@/lib/shared";

export const dynamic = "force-dynamic";

/** Paged docket summaries (mirrors contract get_disputes + get_total_disputes). */
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const offset = Number(sp.get("offset") ?? 0) || 0;
    const limit = Number(sp.get("limit") ?? 50) || 50;
    const account = sp.get("account")?.trim() || undefined;
    const { total, items } = await listDisputes(offset, limit, account);
    return NextResponse.json({ total, items });
  } catch (err) {
    return fail(err);
  }
}

/** file_dispute — payable: locks the claimant stake exactly. */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const account = requireAccount(body);
    const amountWei =
      typeof body.amountWei === "string" && body.amountWei
        ? body.amountWei
        : parseGenToWei(String(body.amount ?? ""));
    if (!amountWei) return NextResponse.json({ error: "amount out of range" }, { status: 400 });
    const input: FileDisputeInput = {
      category: String(body.category ?? ""),
      title: String(body.title ?? ""),
      description: String(body.description ?? ""),
      respondent: String(body.respondent ?? ""),
      amountWei,
      evidenceDescription: String(body.evidenceDescription ?? ""),
      evidenceUrl: String(body.evidenceUrl ?? ""),
    };
    const { id } = await fileDispute(input, account);
    return NextResponse.json({ ok: true, id });
  } catch (err) {
    return fail(err);
  }
}
