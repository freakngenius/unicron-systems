// POST /api/notifications/test
//
// CRON_SECRET-authenticated test endpoint that fires a sample Pathfinder
// briefing to one or both delivery pipes. Used to verify Resend +
// SLACK_WEBHOOK_URL wiring without waiting for the Friday cron.
//
// Body: { channel: 'email' | 'slack' | 'both' }
// Auth: Bearer ${CRON_SECRET} (or `?secret=` query param for local).

import { NextResponse, type NextRequest } from 'next/server';

import {
  briefingToEmail,
  briefingToSlackBlocks,
  sendEmail,
  sendSlack,
  type BriefingPayload,
  type DeliveryResult,
} from '@/lib/notifications';
import { buildOrgBriefing } from '@/lib/briefing';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 60;

const TEST_RECIPIENT = process.env.BRIEFING_ORG_EMAIL ?? 'kyle@demystified.ai';

function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return process.env.NODE_ENV !== 'production';
  const header = req.headers.get('authorization') ?? req.headers.get('Authorization');
  if (header && header.startsWith('Bearer ')) {
    return header.slice(7).trim() === expected;
  }
  try {
    const url = new URL(req.url);
    const q = url.searchParams.get('secret');
    if (q && q === expected) return true;
  } catch {
    // ignore URL parse errors
  }
  return false;
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: { channel?: 'email' | 'slack' | 'both' };
  try {
    body = (await req.json()) as { channel?: 'email' | 'slack' | 'both' };
  } catch {
    body = { channel: 'both' };
  }
  const channel = body.channel ?? 'both';
  if (channel !== 'email' && channel !== 'slack' && channel !== 'both') {
    return NextResponse.json(
      { error: 'invalid_channel', detail: "expected 'email' | 'slack' | 'both'" },
      { status: 400 },
    );
  }

  // Build a real briefing payload from current DB state — proves the
  // whole Friday pipeline (data → format → deliver) works end-to-end.
  // Falls back to a minimal fixture if the build fails (e.g. empty DB).
  let payload: BriefingPayload;
  try {
    payload = await buildOrgBriefing();
    payload.title = `[TEST] ${payload.title}`;
  } catch {
    payload = sampleFixture();
  }

  let email: DeliveryResult | null = null;
  let slack: DeliveryResult | null = null;

  if (channel === 'email' || channel === 'both') {
    const content = briefingToEmail(payload);
    email = await sendEmail({
      to: TEST_RECIPIENT,
      subject: content.subject,
      html: content.html,
      text: content.text,
    });
  }

  if (channel === 'slack' || channel === 'both') {
    const blocks = briefingToSlackBlocks(payload);
    slack = await sendSlack({ text: payload.title, blocks });
  }

  return NextResponse.json({
    ok: (email === null || email.ok) && (slack === null || slack.ok),
    channel,
    recipient: TEST_RECIPIENT,
    email,
    slack,
    payload_summary: {
      title: payload.title,
      metric_count: payload.metrics.length,
      opportunity_count: payload.opportunities.length,
    },
  });
}

function sampleFixture(): BriefingPayload {
  return {
    scope: 'org',
    title: '[TEST] Pathfinder · Friday brief · sample',
    recipient: 'Kyle Doenz',
    statusStrip: 'LAST RUN · 12m ago | 32 TRACKED | 5 RANKED THIS WEEK | 12 HIGH-PRIORITY | 0 ERRORS',
    metrics: [
      { label: 'Projects surfaced', value: '5', delta: '+2', trend: 'up' },
      { label: 'Projects ranked', value: '5', delta: '+2', trend: 'up' },
      { label: 'High-priority', value: '12' },
      { label: 'Errors', value: '0', delta: '0' },
    ],
    opportunities: [
      {
        id: 'sample-1',
        title: 'TxDOT I-45 corridor security expansion',
        source: 'sam.gov',
        value: '$3.4M',
        distance: '12.3mi',
        score: 97,
        rationale:
          'Pre-RFP corridor expansion overlapping the Houston branch with a tight RFP window. Stage RFP open; 3 existing customers within 30mi.',
        high_priority: true,
      },
      {
        id: 'sample-2',
        title: 'Hines VA Hospital perimeter upgrade',
        source: 'usaspending',
        value: '$1.2M',
        distance: '8.1mi',
        score: 91,
        rationale:
          'VA-funded perimeter security work. Strong fit for Chicago branch; aligns with existing VA framework agreements.',
        high_priority: true,
      },
    ],
    competitiveSignals: [
      'ADT won 4 of last 6 federal security contracts in Atlanta — up from 1 of 6 in Q1.',
    ],
    adjacentDigest:
      'Adjacent agent surfaced 3 next-customer candidates this week — equipment rental + temp services.',
    dashboardUrl: 'https://pathfinder-ashy.vercel.app/pathfinder',
  };
}
