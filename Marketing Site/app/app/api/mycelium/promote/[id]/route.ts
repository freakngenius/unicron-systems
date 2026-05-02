import { NextResponse } from "next/server";
import { promoteSignal } from "@/lib/patterns/mycelium/promote";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(_req: Request, ctx: { params: { id: string } }) {
  const r = await promoteSignal(ctx.params.id);
  if (r.ok) return NextResponse.json(r);
  return NextResponse.json(r, { status: 400 });
}
