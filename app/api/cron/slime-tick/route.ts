import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ ok: true, stub: "slime-tick" });
}
export async function POST() {
  return NextResponse.json({ ok: true, stub: "slime-tick" });
}
