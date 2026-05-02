// app/api/probes/resend/route.ts — Demo Polish UX Gate 4A.
//
// Returns the cached Resend API health probe, refreshing the cache when
// expired (5-minute TTL).

import { NextResponse } from 'next/server';

import { getCached, setCached } from '@/lib/probe-cache';
import { probeResend, type ProbeResult } from '@/lib/probes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CACHE_KEY = 'probe:resend';

export async function GET(): Promise<NextResponse> {
  const cached = getCached<ProbeResult>(CACHE_KEY);
  if (cached) {
    return NextResponse.json({ ...cached, cached: true });
  }
  const result = await probeResend();
  setCached(CACHE_KEY, result);
  return NextResponse.json({ ...result, cached: false });
}
