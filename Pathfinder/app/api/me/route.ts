// GET /api/me?email=<address>
//
// Demo-grade operator detection. Returns { isOperator: boolean } based on
// whether the supplied email is in the comma-separated `OPERATOR_EMAILS`
// env var. Used by `lib/settings.ts useIsOperator()` to decide whether
// to render the lead-cost toggle (and other operator-only surfaces) in
// the settings page.
//
// This is a demo gate, not a security boundary. The basic-auth middleware
// already gates access to the deployment; OPERATOR_EMAILS just splits
// "internal team" from "customer" inside that authenticated session.

import { NextResponse, type NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function operatorAllowlist(): string[] {
  const raw = process.env.OPERATOR_EMAILS ?? '';
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const email = (searchParams.get('email') ?? '').trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ isOperator: false, reason: 'missing_email' });
  }
  const allow = operatorAllowlist();
  const isOperator = allow.includes(email);
  return NextResponse.json({ isOperator });
}
