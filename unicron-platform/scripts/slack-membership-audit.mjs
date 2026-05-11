// scripts/slack-membership-audit.mjs — Stream S1 CLI runner
//
// Self-contained Node ESM script that enumerates every channel in the workspace
// and reports which ones the orchestrator bot is currently a member of. Run from
// inside unicron-platform/ so process.cwd() lines up with the report path.
//
// Usage:
//   vercel env pull .env.local         # one-time, picks up SLACK_ORCHESTRATOR_BOT_TOKEN
//   npm run slack:audit                # prints summary + writes report
//   npm run slack:audit -- --out path  # custom output path
//
// Default report path:
//   ../Company Docs/Atrium/Reports/slack-membership-audit-<YYYY-MM-DD>.md
//
// We mirror the algorithm in lib/slack/membership-audit.ts (used by the
// in-server S2 Inngest function). Two implementations because we don't have
// a TS runtime in devDeps and don't want to add one for one script.
//
// Required Slack OAuth scopes:
//   channels:read   — every public channel (member or not)
//   groups:read     — private channels the bot has been added to
//   mpim:read       — MPIMs the bot has been added to
//
// Coverage limit: bot tokens cannot enumerate private channels the bot was
// never invited to. The audit is workspace-wide for public_channel and
// bot-visible-only for private_channel + mpim.

import fs from 'node:fs';
import path from 'node:path';

// ─── env loader (mirrors scripts/realtime-smoke.mjs) ────────────────────────

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, 'utf8');
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    // strip optional surrounding quotes
    if ((val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

loadEnvFile(path.resolve(process.cwd(), '.env.local'));
loadEnvFile(path.resolve(process.cwd(), '.env'));

// ─── arg parsing ────────────────────────────────────────────────────────────

function parseArgs(argv) {
  let out = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out' && argv[i + 1]) {
      out = argv[i + 1];
      i++;
    }
  }
  return { out };
}

function defaultOutPath() {
  const today = new Date().toISOString().slice(0, 10);
  return path.resolve(
    process.cwd(),
    '..',
    'Company Docs',
    'Atrium',
    'Reports',
    `slack-membership-audit-${today}.md`,
  );
}

// ─── Slack API ──────────────────────────────────────────────────────────────

const SLACK_API = 'https://slack.com/api';

async function slackGet(method, params = {}) {
  const token = process.env.SLACK_ORCHESTRATOR_BOT_TOKEN;
  if (!token) throw new Error('SLACK_ORCHESTRATOR_BOT_TOKEN not set');
  const url = new URL(`${SLACK_API}/${method}`);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    url.searchParams.set(k, String(v));
  }
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 429) {
    const retryAfter = res.headers.get('retry-after');
    const err = new Error(`[slack] ${method} failed: ratelimited`);
    err.method = method;
    err.slackError = 'ratelimited';
    err.httpStatus = 429;
    err.retryAfterSec = retryAfter ? Number.parseInt(retryAfter, 10) : undefined;
    throw err;
  }
  let body;
  try {
    body = await res.json();
  } catch {
    const err = new Error(`[slack] ${method} failed: http_${res.status}_non_json`);
    err.method = method;
    err.slackError = `http_${res.status}_non_json`;
    err.httpStatus = res.status;
    throw err;
  }
  if (!body.ok) {
    const err = new Error(`[slack] ${method} failed: ${body.error}`);
    err.method = method;
    err.slackError = body.error;
    err.httpStatus = res.status;
    throw err;
  }
  return body;
}

// ─── audit ──────────────────────────────────────────────────────────────────

function classify(c) {
  if (c.is_mpim) return 'mpim';
  if (c.is_private || c.is_group) return 'private_channel';
  return 'public_channel';
}

function displayName(c) {
  return c.name_normalized || c.name || `(unnamed:${c.id})`;
}

async function runAudit() {
  const out = [];
  let cursor;
  do {
    const page = await slackGet('conversations.list', {
      types: 'public_channel,private_channel,mpim',
      exclude_archived: true,
      limit: 200,
      cursor,
    });
    for (const c of page.channels ?? []) {
      out.push({
        channel_id: c.id,
        channel_name: displayName(c),
        type: classify(c),
        is_archived: !!c.is_archived,
        is_bot_member: !!c.is_member,
        num_members: typeof c.num_members === 'number' ? c.num_members : null,
        last_activity_ts: c.latest?.ts ?? null,
        topic: c.topic?.value || null,
        purpose: c.purpose?.value || null,
      });
    }
    cursor = page.response_metadata?.next_cursor || undefined;
  } while (cursor);

  const TYPE_ORDER = { public_channel: 0, private_channel: 1, mpim: 2 };
  out.sort((a, b) => {
    if (a.is_bot_member !== b.is_bot_member) return a.is_bot_member ? -1 : 1;
    if (a.type !== b.type) return TYPE_ORDER[a.type] - TYPE_ORDER[b.type];
    return a.channel_name.localeCompare(b.channel_name);
  });
  return out;
}

function summarize(channels) {
  const by_type = {
    public_channel: { total: 0, bot_member: 0, coverage: 'workspace' },
    private_channel: { total: 0, bot_member: 0, coverage: 'bot_visible_only' },
    mpim: { total: 0, bot_member: 0, coverage: 'bot_visible_only' },
  };
  let bot_member_total = 0;
  for (const c of channels) {
    by_type[c.type].total++;
    if (c.is_bot_member) {
      by_type[c.type].bot_member++;
      bot_member_total++;
    }
  }
  return {
    generated_at: new Date().toISOString(),
    exclude_archived: true,
    visible_total: channels.length,
    bot_member_total,
    bot_missing_total: channels.length - bot_member_total,
    by_type,
    channels,
  };
}

function renderMarkdown(s) {
  const L = [];
  L.push('# Slack channel membership audit');
  L.push('');
  L.push(`Generated: ${s.generated_at}`);
  L.push('');
  L.push(`- Visible channels (active${s.exclude_archived ? '' : ', incl. archived'}): **${s.visible_total}**`);
  L.push(`- Bot is member of: **${s.bot_member_total}**`);
  L.push(`- Bot missing from (visible only): **${s.bot_missing_total}**`);
  L.push('');
  L.push('> **Coverage note:** `channels:read` returns every public channel in the workspace (member or not).');
  L.push('> `groups:read` and `mpim:read` only return private/MPIM conversations the bot has already been');
  L.push('> added to — so missing-membership for private channels is not enumerable from this report.');
  L.push('');
  L.push('| type | total | bot member | coverage |');
  L.push('|---|---:|---:|---|');
  for (const t of ['public_channel', 'private_channel', 'mpim']) {
    L.push(`| ${t} | ${s.by_type[t].total} | ${s.by_type[t].bot_member} | ${s.by_type[t].coverage} |`);
  }
  L.push('');
  L.push('## Channels');
  L.push('');
  L.push('| name | id | type | bot? | members | last activity |');
  L.push('|---|---|---|:---:|---:|---|');
  for (const c of s.channels) {
    const last = c.last_activity_ts
      ? new Date(Math.floor(parseFloat(c.last_activity_ts) * 1000)).toISOString()
      : '—';
    L.push(`| ${c.channel_name} | \`${c.channel_id}\` | ${c.type} | ${c.is_bot_member ? '✓' : '·'} | ${c.num_members ?? '—'} | ${last} |`);
  }
  L.push('');
  return L.join('\n');
}

// ─── main ───────────────────────────────────────────────────────────────────

async function main() {
  if (!process.env.SLACK_ORCHESTRATOR_BOT_TOKEN) {
    console.error('SLACK_ORCHESTRATOR_BOT_TOKEN not set. Run `vercel env pull .env.local` from this directory first.');
    process.exit(2);
  }

  const { out } = parseArgs(process.argv.slice(2));
  const outPath = out ? path.resolve(out) : defaultOutPath();

  console.log('[slack-audit] enumerating workspace channels…');
  const channels = await runAudit();
  const summary = summarize(channels);
  const markdown = renderMarkdown(summary);

  const dir = path.dirname(outPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(outPath, markdown, 'utf-8');

  console.log('');
  console.log(`visible channels (active) : ${summary.visible_total}`);
  console.log(`bot is member of          : ${summary.bot_member_total}`);
  console.log(`bot missing from          : ${summary.bot_missing_total}  (visible only)`);
  console.log('');
  console.log('by type:');
  for (const [t, row] of Object.entries(summary.by_type)) {
    console.log(`  ${t.padEnd(18)} total=${row.total}  bot=${row.bot_member}  coverage=${row.coverage}`);
  }
  console.log('');
  console.log(`report written → ${outPath}`);
}

main().catch((err) => {
  if (err.slackError === 'missing_scope') {
    console.error(`Slack API error on ${err.method}: missing_scope`);
    console.error('');
    console.error('The orchestrator bot is missing one or more required scopes.');
    console.error('Update slack-app-manifest.json (channels:read, groups:read, mpim:read) and re-install:');
    console.error('  https://api.slack.com/apps → Unicron Orchestrator → "Install App" → reinstall');
    process.exit(1);
  }
  if (err.slackError) {
    console.error(`Slack API error on ${err.method}: ${err.slackError}`);
    process.exit(1);
  }
  console.error(err);
  process.exit(1);
});
