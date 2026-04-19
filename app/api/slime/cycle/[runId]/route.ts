import { NextResponse } from "next/server";
import { runCycle } from "@/lib/patterns/slime/cycle";
import { writeFinalDecisions } from "@/lib/patterns/slime/notion";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(_req: Request, ctx: { params: { runId: string } }) {
  try {
    const r = await runCycle(ctx.params.runId);
    if (r.status === "succeeded") {
      writeFinalDecisions(ctx.params.runId).catch(() => void 0);
    }
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
