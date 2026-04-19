import { NextResponse } from "next/server";
import { z } from "zod";
import { createRun, loadFixture } from "@/lib/patterns/slime/cycle";
import { Criteria } from "@/lib/patterns/slime/types";

export const runtime = "nodejs";

const Body = z.object({
  criteria: Criteria.optional(),
  cycles_planned: z.number().int().positive().max(6).default(3),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => ({}));
  const parsed = Body.safeParse(json ?? {});
  if (!parsed.success) return NextResponse.json({ error: "invalid body" }, { status: 400 });
  const criteria = parsed.data.criteria ?? loadFixture().criteria;
  try {
    const run_id = await createRun(criteria, parsed.data.cycles_planned);
    return NextResponse.json({ run_id }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
