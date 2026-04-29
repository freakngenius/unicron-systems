// lib/notifications.ts — outbound delivery for the Briefing agent.
//
// Two channels:
//   - Email via the Resend SDK (RESEND_API_KEY, RESEND_FROM_EMAIL)
//   - Slack via direct POST to SLACK_WEBHOOK_URL with Block Kit payload
//
// Plus formatters that turn a `BriefingPayload` into channel-appropriate
// shapes: HTML + plaintext for email, Block Kit JSON for Slack. The
// Briefing cron handler builds a payload, then fans it out to whichever
// channels are configured.
//
// All functions return a `DeliveryResult` so callers can log success or
// failure to `pathfinder.agent_log` with `event_type='delivery_success'`
// or `'delivery_failure'`.

import { Resend } from 'resend';

// ────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────

export interface BriefingMetric {
  label: string;
  value: string;
  /** Delta vs prior week, e.g. "+12" or "−3"; rendered with arrow + tint. */
  delta?: string;
  /** 'up' green, 'down' amber. Omit for neutral. */
  trend?: 'up' | 'down';
}

export interface BriefingOpportunity {
  id: string;
  title: string;
  source: string;
  value: string;
  distance: string;
  score: number;
  rationale: string;
  high_priority: boolean;
}

export interface BriefingPayload {
  /** "org" | "branch" — drives section selection. */
  scope: 'org' | 'branch';
  /** "Friday brief · 25 Apr 2026" or "Friday brief · Houston · 25 Apr 2026". */
  title: string;
  /** Recipient salutation, e.g. "Kyle Doenz". */
  recipient: string;
  /** Status strip: "LAST RUN · 12m ago | 247 SURFACED | 47 ACCEPTED | 12 HIGH-PRIORITY | 0 ERRORS". */
  statusStrip: string;
  /** 4-up grid of week summary metrics. */
  metrics: BriefingMetric[];
  /** Top opportunities for the week. Org-level: top 3. Branch-level: top 3 for that branch. */
  opportunities: BriefingOpportunity[];
  /** Optional 1–2 short competitive signal lines. Org-level only typically. */
  competitiveSignals?: string[];
  /** Optional summary line: "Adjacent agent surfaced 6 next-customer candidates this week — …". */
  adjacentDigest?: string;
  /** Dashboard URL the footer "Open operations console" button links to. */
  dashboardUrl: string;
}

export interface DeliveryResult {
  ok: boolean;
  channel: 'email' | 'slack';
  recipient?: string;
  message_id?: string;
  error?: string;
}

// ────────────────────────────────────────────────────────────────────────
// Email — Resend
// ────────────────────────────────────────────────────────────────────────

let _resend: Resend | null = null;
function resend(): Resend {
  if (_resend) return _resend;
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY is not set');
  _resend = new Resend(key);
  return _resend;
}

export interface SendEmailArgs {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
}

export async function sendEmail(args: SendEmailArgs): Promise<DeliveryResult> {
  const from = process.env.RESEND_FROM_EMAIL;
  if (!from) {
    return { ok: false, channel: 'email', error: 'RESEND_FROM_EMAIL is not set' };
  }
  const recipients = Array.isArray(args.to) ? args.to.join(', ') : args.to;
  try {
    const res = await resend().emails.send({
      from,
      to: args.to,
      subject: args.subject,
      html: args.html,
      text: args.text,
    });
    if (res.error) {
      return { ok: false, channel: 'email', recipient: recipients, error: res.error.message };
    }
    return {
      ok: true,
      channel: 'email',
      recipient: recipients,
      message_id: res.data?.id ?? undefined,
    };
  } catch (e) {
    return {
      ok: false,
      channel: 'email',
      recipient: recipients,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

// ────────────────────────────────────────────────────────────────────────
// Slack — two delivery paths:
//   1. sendSlack         — legacy webhook POST (kept as fallback for envs
//                          where no workspace install exists)
//   2. sendSlackDigest   — bot-token chat.postMessage to a workspace + channel
//                          (P0-04). Briefing flow prefers this when a
//                          slack_workspaces row exists for the recipient.
// ────────────────────────────────────────────────────────────────────────

interface SlackBlock {
  [key: string]: unknown;
}

export async function sendSlack(args: {
  /** Plain-text fallback for notifications + accessibility. Required by Slack. */
  text: string;
  /** Block Kit blocks. The webhook accepts `{ text, blocks }`. */
  blocks: SlackBlock[];
}): Promise<DeliveryResult> {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) {
    return { ok: false, channel: 'slack', error: 'SLACK_WEBHOOK_URL is not set' };
  }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: args.text, blocks: args.blocks }),
    });
    if (!res.ok) {
      const body = await res.text();
      return { ok: false, channel: 'slack', error: `${res.status} ${body.slice(0, 200)}` };
    }
    return { ok: true, channel: 'slack' };
  } catch (e) {
    return { ok: false, channel: 'slack', error: e instanceof Error ? e.message : String(e) };
  }
}

export async function sendSlackDigest(args: {
  /** Slack team_id (T0123…) — must match a row in pathfinder.slack_workspaces. */
  teamId: string;
  /** Channel id (C0123…) for chat.postMessage. */
  channelId: string;
  text: string;
  blocks: SlackBlock[];
}): Promise<DeliveryResult> {
  // Imported lazily so this module stays usable in code paths that don't
  // need the bot (e.g. plain webhook delivery in environments where Slack
  // installs aren't wired up yet).
  const { getClient } = await import('@/lib/slack/bot');
  try {
    const client = await getClient(args.teamId);
    const res = await client.chat.postMessage({
      channel: args.channelId,
      text: args.text,
      blocks: args.blocks as unknown as never[],
    });
    return {
      ok: true,
      channel: 'slack',
      recipient: `${args.teamId}:${args.channelId}`,
      message_id: (res.ts as string | undefined) ?? undefined,
    };
  } catch (e) {
    return {
      ok: false,
      channel: 'slack',
      recipient: `${args.teamId}:${args.channelId}`,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

// ────────────────────────────────────────────────────────────────────────
// Block Kit formatter — Slack rendering of a BriefingPayload.
// Matches the Block Kit Builder schema; tested with Slack's webhook
// preview tool. Header → divider → metrics → opportunities → footer link.
// ────────────────────────────────────────────────────────────────────────

export function briefingToSlackBlocks(p: BriefingPayload): SlackBlock[] {
  const blocks: SlackBlock[] = [];

  // Header
  blocks.push({ type: 'header', text: { type: 'plain_text', text: p.title } });

  // Status strip — context line, mono-ish via inline backticks
  blocks.push({
    type: 'context',
    elements: [{ type: 'mrkdwn', text: `\`${p.statusStrip}\`` }],
  });

  blocks.push({ type: 'divider' });

  // Metrics — 4-up via fields list. Slack collapses long labels nicely.
  if (p.metrics.length > 0) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: '*Week summary*' },
      fields: p.metrics.flatMap((m) => [
        { type: 'mrkdwn', text: `*${m.label}*` },
        {
          type: 'mrkdwn',
          text: m.delta
            ? `\`${m.value}\`  ${m.trend === 'up' ? ':small_green_diamond:' : m.trend === 'down' ? ':small_orange_diamond:' : ''} ${m.delta}`
            : `\`${m.value}\``,
        },
      ]),
    });
  }

  blocks.push({ type: 'divider' });

  // Top opportunities
  if (p.opportunities.length > 0) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: '*Top opportunities*' },
    });
    for (const o of p.opportunities) {
      const badge = o.high_priority ? ' :large_orange_diamond: high-priority' : '';
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${o.title}*${badge}\n\`${o.source} · ${o.value} · ${o.distance} · score ${o.score}\`\n${o.rationale}`,
        },
      });
    }
  }

  // Competitive signals
  if (p.competitiveSignals && p.competitiveSignals.length > 0) {
    blocks.push({ type: 'divider' });
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Competitive signals*\n${p.competitiveSignals.map((s) => `• ${s}`).join('\n')}`,
      },
    });
  }

  // Adjacent digest
  if (p.adjacentDigest) {
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `_${p.adjacentDigest}_` }],
    });
  }

  // Footer
  blocks.push({ type: 'divider' });
  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: { type: 'plain_text', text: 'Open operations console' },
        url: p.dashboardUrl,
        style: 'primary',
      },
    ],
  });

  return blocks;
}

// ────────────────────────────────────────────────────────────────────────
// Email formatter — HTML + plaintext rendering of a BriefingPayload.
// Matches the dashboard's design language: dark surface, mono accents,
// hairline borders. Light-mode override via `@media`. Tables are used
// for cross-client compatibility (Outlook etc.).
// ────────────────────────────────────────────────────────────────────────

const DARK = {
  bg: '#0B0F14',
  surface: '#131922',
  surfaceUp: '#1B2230',
  rule: '#1F2735',
  ink: '#E6EAF0',
  inkSub: '#8A95A5',
  inkMuted: '#5B6675',
  cobalt: '#5B7FFF',
  mint: '#3DDC97',
  amber: '#FFB454',
  magenta: '#E879F9',
} as const;

export interface BriefingEmail {
  subject: string;
  html: string;
  text: string;
}

export function briefingToEmail(p: BriefingPayload): BriefingEmail {
  const subject = p.title;

  const metricRow = p.metrics
    .map(
      (m) => `
        <td style="padding:14px 12px;background:${DARK.surfaceUp};border:1px solid ${DARK.rule};vertical-align:top;width:25%">
          <div style="font:500 9px/1 Inter,system-ui,sans-serif;color:${DARK.inkMuted};letter-spacing:0.10em;text-transform:uppercase">${escapeHtml(m.label)}</div>
          <div style="font:500 18px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace;color:${DARK.ink};margin-top:4px">${escapeHtml(m.value)}</div>
          ${
            m.delta
              ? `<div style="font:400 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace;color:${m.trend === 'up' ? DARK.mint : m.trend === 'down' ? DARK.amber : DARK.inkSub};margin-top:4px">${m.trend === 'up' ? '▲' : m.trend === 'down' ? '▼' : ''} ${escapeHtml(m.delta)}</div>`
              : ''
          }
        </td>`,
    )
    .join('');

  const opportunityCards = p.opportunities
    .map(
      (o) => `
      <tr><td style="padding:0 0 12px 0">
        <table cellspacing="0" cellpadding="0" border="0" width="100%" style="background:${DARK.surface};border:1px solid ${DARK.rule}">
          <tr><td style="padding:14px 16px">
            <div style="font:500 9px/1 ui-monospace,SFMono-Regular,Menlo,monospace;color:${DARK.inkMuted};letter-spacing:0.08em;text-transform:uppercase">
              ${escapeHtml(o.source)} · ${escapeHtml(o.value)} · ${escapeHtml(o.distance)}
              <span style="display:inline-block;margin-left:8px;padding:1px 6px;background:${o.high_priority ? DARK.amber : DARK.mint};color:${DARK.bg};border-radius:2px">${o.score}</span>
            </div>
            <div style="font:500 14px/1.3 Inter,system-ui,sans-serif;color:${DARK.ink};margin-top:6px">${escapeHtml(o.title)}</div>
            <div style="font:400 12px/1.5 Inter,system-ui,sans-serif;color:${DARK.inkSub};margin-top:6px">${escapeHtml(o.rationale)}</div>
            <a href="${escapeAttr(p.dashboardUrl)}" style="font:500 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace;color:${DARK.cobalt};text-decoration:none;margin-top:10px;display:inline-block;letter-spacing:0.06em;text-transform:uppercase">View details ›</a>
          </td></tr>
        </table>
      </td></tr>`,
    )
    .join('');

  const competitiveBlock =
    p.competitiveSignals && p.competitiveSignals.length > 0
      ? `
      <tr><td style="padding:8px 0">
        <div style="font:500 9px/1 Inter,system-ui,sans-serif;color:${DARK.inkMuted};letter-spacing:0.10em;text-transform:uppercase;margin-bottom:8px">Competitive signals</div>
        ${p.competitiveSignals.map((s) => `<div style="font:400 12px/1.5 Inter,system-ui,sans-serif;color:${DARK.ink};margin-bottom:4px">• ${escapeHtml(s)}</div>`).join('')}
      </td></tr>`
      : '';

  const adjacentBlock = p.adjacentDigest
    ? `
      <tr><td style="padding:8px 0">
        <div style="font:400 12px/1.5 Inter,system-ui,sans-serif;color:${DARK.inkSub};font-style:italic">${escapeHtml(p.adjacentDigest)}</div>
      </td></tr>`
    : '';

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:${DARK.bg};color:${DARK.ink};font-family:Inter,system-ui,-apple-system,sans-serif">
  <table cellspacing="0" cellpadding="0" border="0" width="100%" style="background:${DARK.bg}">
    <tr><td align="center" style="padding:24px 12px">
      <table cellspacing="0" cellpadding="0" border="0" width="600" style="max-width:600px;width:100%">
        <!-- Header -->
        <tr><td style="padding:0 0 16px 0">
          <table cellspacing="0" cellpadding="0" border="0" width="100%">
            <tr>
              <td style="vertical-align:middle">
                <div style="font:500 14px/1 Inter,system-ui,sans-serif;color:${DARK.ink};letter-spacing:-0.005em">Pathfinder</div>
                <div style="font:400 11px/1 Inter,system-ui,sans-serif;color:${DARK.inkSub};margin-top:4px">${escapeHtml(p.title)}</div>
              </td>
              <td align="right" style="vertical-align:middle">
                <span style="display:inline-block;padding:3px 8px;background:${DARK.surfaceUp};border:1px solid ${DARK.rule};font:500 9px/1 ui-monospace,SFMono-Regular,Menlo,monospace;color:${DARK.mint};letter-spacing:0.10em;text-transform:uppercase">● LIVE</span>
              </td>
            </tr>
          </table>
        </td></tr>
        <!-- Status strip -->
        <tr><td style="padding:0 0 16px 0">
          <div style="background:${DARK.surface};border:1px solid ${DARK.rule};padding:10px 14px;font:500 11px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;color:${DARK.inkSub};letter-spacing:0.04em">${escapeHtml(p.statusStrip)}</div>
        </td></tr>
        <!-- Metrics 4-up -->
        <tr><td style="padding:0 0 16px 0">
          <table cellspacing="0" cellpadding="0" border="0" width="100%"><tr>${metricRow}</tr></table>
        </td></tr>
        <!-- Top opportunities -->
        <tr><td style="padding:0 0 8px 0">
          <div style="font:500 9px/1 Inter,system-ui,sans-serif;color:${DARK.inkMuted};letter-spacing:0.10em;text-transform:uppercase;margin-bottom:8px">Top opportunities</div>
        </td></tr>
        ${opportunityCards}
        ${competitiveBlock}
        ${adjacentBlock}
        <!-- Footer -->
        <tr><td style="padding:24px 0 0 0;border-top:1px solid ${DARK.rule}">
          <table cellspacing="0" cellpadding="0" border="0" width="100%"><tr>
            <td style="vertical-align:middle">
              <a href="${escapeAttr(p.dashboardUrl)}" style="display:inline-block;padding:8px 14px;background:${DARK.cobalt};color:${DARK.bg};font:500 12px/1 Inter,system-ui,sans-serif;text-decoration:none;border-radius:3px">Open operations console</a>
            </td>
            <td align="right" style="vertical-align:middle">
              <div style="font:400 10px/1 ui-monospace,SFMono-Regular,Menlo,monospace;color:${DARK.inkMuted};letter-spacing:0.04em">engine: 10 agents · pathfinder.unicron.systems</div>
            </td>
          </tr></table>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  // Plaintext — used for accessibility + deliverability. Mirrors the
  // structure but flat. Slack's preview also renders this when the HTML
  // is unsupported.
  const lines: string[] = [];
  lines.push(p.title);
  lines.push('='.repeat(p.title.length));
  lines.push('');
  lines.push(p.statusStrip);
  lines.push('');
  lines.push('Week summary');
  for (const m of p.metrics) {
    lines.push(`  ${m.label.padEnd(22)} ${m.value}${m.delta ? '   ' + (m.trend === 'up' ? '▲' : m.trend === 'down' ? '▼' : '') + ' ' + m.delta : ''}`);
  }
  lines.push('');
  lines.push('Top opportunities');
  for (const o of p.opportunities) {
    lines.push(`  • ${o.title}${o.high_priority ? '  [HIGH-PRIORITY]' : ''}`);
    lines.push(`    ${o.source} · ${o.value} · ${o.distance} · score ${o.score}`);
    lines.push(`    ${o.rationale}`);
    lines.push('');
  }
  if (p.competitiveSignals?.length) {
    lines.push('Competitive signals');
    for (const s of p.competitiveSignals) lines.push(`  • ${s}`);
    lines.push('');
  }
  if (p.adjacentDigest) {
    lines.push(p.adjacentDigest);
    lines.push('');
  }
  lines.push(`Open operations console: ${p.dashboardUrl}`);
  lines.push('');
  lines.push('engine: 10 agents · pathfinder.unicron.systems');

  return { subject, html, text: lines.join('\n') };
}

// ────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}
