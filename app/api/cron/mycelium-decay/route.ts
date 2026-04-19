import { NextResponse } from "next/server";

// Real decay logic lives in Mycelium pattern (Chunk 2 task M5).
// This stub is middleware-gated by CRON_SECRET; it's a placeholder
// so vercel.json scheduling works from day 1.
export async function GET() {
  return NextResponse.json({ ok: true, stub: "mycelium-decay" });
}
export async function POST() {
  return NextResponse.json({ ok: true, stub: "mycelium-decay" });
}
