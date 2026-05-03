// app/api/leads/[projectId]/outreach/connection/route.ts — Demo Polish
// UX Gate 9D. Returns the operator's resolved connection so the v2
// Outreach Composer can render the From display + isConnected state.
//
// Read-only. Resolves the same connection the Send endpoint uses.

import { NextResponse, type NextRequest } from 'next/server';

import { formatFromDisplay, resolveActiveConnection } from '@/lib/outreach/user-connection';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const DEMO_OPERATOR_EMAIL =
  process.env.PF_DEMO_OPERATOR_EMAIL ?? 'kyle@freakngenius.com';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const actorEmail = url.searchParams.get('actor') ?? DEMO_OPERATOR_EMAIL;
  const conn = await resolveActiveConnection(actorEmail);
  return NextResponse.json({
    connection: conn,
    fromDisplay: formatFromDisplay(conn),
    isConnected: conn?.isConnected ?? false,
  });
}
