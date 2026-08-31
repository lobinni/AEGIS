import { NextRequest, NextResponse } from "next/server";
import { onchainEnabled, readContractValue } from "@/lib/server/genlayer";

export const dynamic = "force-dynamic";

type Summary = Record<string, unknown>;

function fail(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return NextResponse.json(
    { error: `Studionet read failed: ${message}` },
    { status: 502 },
  );
}

/**
 * On-chain docket summaries straight from get_disputes/get_total_disputes on
 * the deployed contract. Paged newest-first like the hosted-ledger route;
 * supports ?account= filtering for the My-cases view.
 */
export async function GET(req: NextRequest) {
  try {
    if (!onchainEnabled()) {
      return NextResponse.json(
        { error: "Arbitration contract not configured on-chain" },
        { status: 503 },
      );
    }
    const sp = req.nextUrl.searchParams;
    const offset = Math.max(0, Number(sp.get("offset") ?? 0) || 0);
    const limit = Math.min(Math.max(1, Number(sp.get("limit") ?? 50) || 50), 50);
    const account = (sp.get("account") ?? "").trim().toLowerCase();

    const total = Number(await readContractValue("get_total_disputes"));

    if (account) {
      // No per-account view on-chain: scan summaries (bounded) and filter.
      const pages: Summary[] = [];
      const cap = Math.min(total, 200);
      for (let start = 0; start < cap; start += 50) {
        const page = await readContractValue("get_disputes", [
          start,
          Math.min(50, cap - start),
        ]);
        pages.push(...(page as Summary[]));
      }
      const items = pages
        .filter(
          (s) =>
            String(s.claimant).toLowerCase() === account ||
            String(s.respondent).toLowerCase() === account,
        )
        .sort((a, b) => Number(b.created_at) - Number(a.created_at));
      return NextResponse.json({ total: items.length, items: items.slice(0, limit) });
    }

    // Newest-first window over the contract's filing-ordered list.
    const endIdx = Math.max(0, total - offset);
    const startIdx = Math.max(0, endIdx - limit);
    let items: Summary[] = [];
    if (endIdx > startIdx) {
      items = await readContractValue("get_disputes", [startIdx, endIdx - startIdx]);
      items.reverse();
    }
    return NextResponse.json({ total, items });
  } catch (err) {
    return fail(err);
  }
}
