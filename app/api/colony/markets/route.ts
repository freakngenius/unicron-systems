import { NextResponse } from "next/server";
import { listMarkets } from "@/lib/patterns/colony/dispatch";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ markets: listMarkets() });
}
