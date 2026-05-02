// app/api/probes/slack/route.ts — Demo Polish UX Gate 4A.
//
// Returns the cached Slack webhook health probe, refreshing the cache when
// expired (5-minute TTL). The Settings UI's IntegrationsSection calls
// this route to render the connection-status badge.

import { NextResponse } from 'next/server';

import { getCached, setCached } from '@/lib/probe-cache';
import { probeSlackWebhook, type ProbeResult } from '@/lib/probes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CACHE_KEY = 'probe:slack';

export async function GET(): Promise<NextResponse> {
  const cached = getCached<ProbeResult>(CACHE_KEY);
  if (cached) {
    return NextResponse.json({ ...cached, cached: true });
  }
  const result = await probeSlackWebhook();
  setCached(CACHE_KEY, result);
  return NextResponse.json({ ...result, cached: false });
}
