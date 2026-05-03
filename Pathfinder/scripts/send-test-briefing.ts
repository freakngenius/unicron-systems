// scripts/send-test-briefing.ts — Demo Polish UX Gate 13W-D.
//
// Manual on-demand brief send for production verification. Composes a
// brief for the operator named on the CLI and dispatches it through
// the same pipeline the cron and the /dispatch route use, but bypasses
// every gate (BRIEFING_CRON_ENABLED, shouldSkip, route auth) so this
// runs cleanly from a local terminal with the right env.
//
// Usage:
//   pnpm tsx scripts/send-test-briefing.ts kyle@freakngenius.com
//
// Required env (in .env.local or shell):
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//   NEXT_PUBLIC_APP_URL              (defaults to https://pathfinder.unicron.systems)
//
// The user must have a connected gmail or outlook integration in
// pathfinder.email_integrations. The brief sends FROM that mailbox TO
// the same mailbox.
//
// Exit codes:
//   0 → ok=true, message_id printed
//   1 → no_active_integration (operator must connect a mailbox first)
//   2 → send failure (provider error printed)
//   3 → compose failure (error printed)

import { composeDailyBrief, sendDailyBrief } from '@/services/briefer';

async function main(): Promise<number> {
  const userId = process.argv[2];
  if (!userId || !userId.includes('@')) {
    console.error(
      'usage: pnpm tsx scripts/send-test-briefing.ts <operator-email>',
    );
    return 64;
  }

  console.log(`[briefing] composing brief for ${userId}`);
  let brief;
  try {
    brief = await composeDailyBrief({ userId, now: new Date() });
  } catch (e) {
    console.error('[briefing] compose failed:', e instanceof Error ? e.message : e);
    return 3;
  }
  console.log(`[briefing] composed: subject="${brief.subject}"`);
  console.log(`[briefing] metrics=${JSON.stringify(brief.metrics)}`);
  console.log(`[briefing] sections_rendered=${brief.sections_rendered.join(', ') || '(none)'}`);

  console.log('[briefing] sending …');
  const result = await sendDailyBrief({ userId, brief });
  if (result.ok) {
    console.log(
      `[briefing] sent ok via ${result.provider} message_id=${result.message_id} outreach_send_id=${result.outreach_send_id}`,
    );
    return 0;
  }

  if (result.error === 'no_active_integration') {
    console.error(
      `[briefing] no active gmail or outlook integration for ${userId} — connect one in /pathfinder/settings/connectors first`,
    );
    return 1;
  }
  console.error(
    `[briefing] send failed via ${result.provider ?? 'unknown'}: ${result.error}`,
  );
  return 2;
}

main()
  .then((code) => {
    process.exit(code);
  })
  .catch((e) => {
    console.error('[briefing] unhandled error:', e);
    process.exit(99);
  });
