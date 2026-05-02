// GET /api/cron/cost-alert — Phase 1 G2 Task 6.
//
// Daily LLM-cost alert. Vercel cron at `0 13 * * *` (1pm UTC, after the
// morning briefing window). Sums pathfinder.llm_calls.cost_usd over the
// trailing 24h. If total >= COST_ALERT_THRESHOLD_USD ($50 default), posts
// to Slack via SLACK_WEBHOOK_URL and emails BRIEFING_ORG_EMAIL via Resend.
//
// Auth: Vercel sets `Authorization: Bearer ${CRON_SECRET}`. Same gating
// pattern as the verifier + outreach crons.
//
// Env-gated fail-open: missing SLACK_WEBHOOK_URL skips Slack; missing
// RESEND_FROM_EMAIL or BRIEFING_ORG_EMAIL skips email. The endpoint never
// returns 5xx — alert delivery failures are logged via trackEvent and the
// response includes per-channel outcome.
//
// Threshold tunable via COST_ALERT_THRESHOLD_USD env (defaults to 50).
// Set to 0 to alert on every run (useful for first-cycle smoke test).

import { NextResponse } from 'next/server';
import { closeAgentRun, openAgentRun } from '@/lib/agent-runs';
import { supabaseAdmin } from '@/lib/supabase';
import { sendEmail, sendSlack } from '@/lib/notifications';
import { trackEvent } from '@/lib/observability/axiom';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 30;

const DEFAULT_THRESHOLD_USD = 50;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== 'production';
  const auth = req.headers.get('authorization');
  if (auth === `Bearer ${secret}`) return true;
  const url = new URL(req.url);
  return url.searchParams.get('secret') === secret;
}

interface CostByModel {
  model: string;
  calls: number;
  cost_usd: number;
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const run = await openAgentRun('cost-alert');
  const threshold = Number(process.env.COST_ALERT_THRESHOLD_USD ?? DEFAULT_THRESHOLD_USD);
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('llm_calls')
    .select('model, cost_usd')
    .gte('created_at', since)
    .limit(50000);

  if (error) {
    await closeAgentRun(run, { status: 'failed', error_message: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as { model: string; cost_usd: number | null }[];
  let total = 0;
  const byModel = new Map<string, CostByModel>();
  for (const r of rows) {
    const cost = Number(r.cost_usd ?? 0);
    total += cost;
    const slot = byModel.get(r.model) ?? { model: r.model, calls: 0, cost_usd: 0 };
    slot.calls += 1;
    slot.cost_usd += cost;
    byModel.set(r.model, slot);
  }
  total = Number(total.toFixed(4));

  const breakdown = Array.from(byModel.values())
    .map((m) => ({ ...m, cost_usd: Number(m.cost_usd.toFixed(4)) }))
    .sort((a, b) => b.cost_usd - a.cost_usd);

  trackEvent({
    level: total >= threshold ? 'warn' : 'info',
    surface: 'cost-alert',
    message: `cost-alert cycle: $${total} / $${threshold} threshold`,
    total_usd: total,
    threshold_usd: threshold,
    call_count: rows.length,
    by_model: breakdown,
  });

  if (total < threshold) {
    await closeAgentRun(run, {
      status: 'success',
      records_processed: rows.length,
      records_new: 0,
    });
    return NextResponse.json({
      ok: true,
      alerted: false,
      total_usd: total,
      threshold_usd: threshold,
      call_count: rows.length,
      by_model: breakdown,
    });
  }

  // ALERT path — fan out to Slack + email.
  const subject = `[Pathfinder] LLM cost alert · $${total.toFixed(2)} in last 24h`;
  const body = [
    `Pathfinder LLM cost crossed the alert threshold.`,
    ``,
    `Last 24h spend: $${total.toFixed(4)}`,
    `Threshold:      $${threshold.toFixed(2)}`,
    `Call count:     ${rows.length}`,
    ``,
    `By model:`,
    ...breakdown.map((m) => `  ${m.model.padEnd(28)} ${String(m.calls).padStart(5)} calls   $${m.cost_usd.toFixed(4)}`),
    ``,
    `Source: pathfinder.llm_calls (last 24h).`,
    `Tunable via COST_ALERT_THRESHOLD_USD env (current: ${threshold}).`,
  ].join('\n');

  const slackBlocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: '⚠️ Pathfinder LLM cost alert', emoji: true },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Last 24h:*\n$${total.toFixed(4)}` },
        { type: 'mrkdwn', text: `*Threshold:*\n$${threshold.toFixed(2)}` },
        { type: 'mrkdwn', text: `*Calls:*\n${rows.length}` },
        { type: 'mrkdwn', text: `*Top model:*\n${breakdown[0]?.model ?? 'n/a'}` },
      ],
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text:
          '*By model:*\n' +
          breakdown
            .slice(0, 10)
            .map((m) => `• \`${m.model}\` — ${m.calls} calls · $${m.cost_usd.toFixed(4)}`)
            .join('\n'),
      },
    },
  ];

  const slackResult = await sendSlack({ text: subject, blocks: slackBlocks });

  const emailTo = process.env.BRIEFING_ORG_EMAIL;
  let emailResult: Awaited<ReturnType<typeof sendEmail>> | { ok: false; channel: 'email'; error: string } = {
    ok: false,
    channel: 'email',
    error: 'BRIEFING_ORG_EMAIL is not set',
  };
  if (emailTo) {
    emailResult = await sendEmail({
      to: emailTo.split(',').map((s) => s.trim()).filter(Boolean),
      subject,
      html: `<pre style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;">${body
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')}</pre>`,
      text: body,
    });
  }

  await closeAgentRun(run, {
    status: 'success',
    records_processed: rows.length,
    records_new: 1,
  });

  return NextResponse.json({
    ok: true,
    alerted: true,
    total_usd: total,
    threshold_usd: threshold,
    call_count: rows.length,
    by_model: breakdown,
    delivery: { slack: slackResult, email: emailResult },
  });
}
