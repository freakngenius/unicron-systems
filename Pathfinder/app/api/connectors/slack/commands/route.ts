// POST /api/connectors/slack/commands
//
// Slack slash-command webhook for the connector framework. PUBLIC;
// signature-verified. middleware.ts exempts this path.
//
// Slack delivers form-encoded POST bodies. We must verify the v0
// signature against the raw body bytes BEFORE form-parsing. Response
// must be sent within 3 seconds; we do all work synchronously because
// each command's DB query is small. If a command grows expensive we
// will switch to the response_url ack pattern.
//
// Verbs: leads / rejected / feedback / help — see lib/connectors/slack/commands.ts.

import { NextResponse } from 'next/server';

import { recordAudit } from '@/lib/connectors/audit';
import { recordCommandFeedback } from '@/lib/connectors/feedback';
import { getConnectorByExternalId } from '@/lib/connectors/registry';
import { parseCommand } from '@/lib/connectors/slack/commands';
import {
  formatHelp,
  formatLead,
  formatPlainText,
  formatRejection,
} from '@/lib/connectors/slack/formatters';
import { verifySlackRequest } from '@/lib/connectors/slack/signature';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 10;

interface CommandFormFields {
  team_id: string;
  user_id: string;
  command: string;
  text: string;
  channel_id: string;
}

function parseSlackForm(body: string): CommandFormFields {
  const params = new URLSearchParams(body);
  return {
    team_id: params.get('team_id') ?? '',
    user_id: params.get('user_id') ?? '',
    command: params.get('command') ?? '',
    text: params.get('text') ?? '',
    channel_id: params.get('channel_id') ?? '',
  };
}

function ephemeral(payload: { text: string; blocks: unknown[] }): NextResponse {
  return NextResponse.json({ response_type: 'ephemeral', ...payload });
}

export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get('x-slack-signature');
  const timestamp = req.headers.get('x-slack-request-timestamp');

  const verify = verifySlackRequest({ signature, timestamp, body: rawBody });
  if (!verify.ok) {
    return new NextResponse(`Bad signature: ${verify.reason}`, { status: 401 });
  }

  const form = parseSlackForm(rawBody);
  if (!form.team_id) {
    return ephemeral(formatPlainText('Missing team_id'));
  }

  const connector = await getConnectorByExternalId('slack', form.team_id);
  if (!connector) {
    // Unknown workspace — likely an install that hasn't completed the
    // connector-framework callback yet. Tell the user to reconnect.
    return ephemeral(
      formatPlainText('This Slack workspace is not connected to Pathfinder. Visit Settings → Connectors to install.'),
    );
  }

  const parsed = parseCommand(form.text);

  try {
    if (parsed.kind === 'help' || parsed.kind === 'unknown') {
      const block = parsed.kind === 'unknown' ? formatPlainText(`Unknown command: \`${parsed.raw}\``) : formatHelp();
      const helpBlock = formatHelp();
      // For 'unknown' we send the error preface + the help block.
      const blocks = parsed.kind === 'unknown' ? [...block.blocks, ...helpBlock.blocks] : helpBlock.blocks;
      const text = parsed.kind === 'unknown' ? `Unknown command. ${helpBlock.text}` : helpBlock.text;
      await audit(connector.id, connector.customerOrgId, 'command.help', 'received', { kind: parsed.kind });
      return ephemeral({ text, blocks });
    }

    if (parsed.kind === 'leads') {
      const leads = await loadTopLeads(connector.customerOrgId, parsed.limit);
      await audit(connector.id, connector.customerOrgId, 'command.leads', 'received', {
        limit: parsed.limit,
        returned: leads.length,
      });
      if (leads.length === 0) {
        return ephemeral(formatPlainText('No leads to show right now.'));
      }
      const blocks = leads.flatMap(l =>
        formatLead({
          id: l.id,
          title: l.title,
          score: l.score,
          rationale: l.rationale,
          projectValue: l.project_value,
          source: l.source,
          branchName: null,
          dashboardUrl: dashboardUrlFor(l.id),
        }).blocks,
      );
      return ephemeral({ text: `Top ${leads.length} leads`, blocks });
    }

    if (parsed.kind === 'rejected') {
      const rejected = await loadRejectedSample(connector.customerOrgId, 5);
      await audit(connector.id, connector.customerOrgId, 'command.rejected', 'received', {
        returned: rejected.length,
      });
      if (rejected.length === 0) {
        return ephemeral(formatPlainText('No rejected leads in the recent window.'));
      }
      const blocks = rejected.flatMap(r =>
        formatRejection({ id: r.id, title: r.title, reason: r.reason }).blocks,
      );
      return ephemeral({ text: `Recent rejected pile sample`, blocks });
    }

    if (parsed.kind === 'feedback') {
      await recordCommandFeedback({
        customerOrgId: connector.customerOrgId,
        projectId: parsed.projectId,
        thumb: parsed.thumb,
        reason: parsed.reason,
        userExternalId: form.user_id,
        connectorId: connector.id,
      });
      await audit(connector.id, connector.customerOrgId, 'command.feedback', 'received', {
        project_id: parsed.projectId,
        thumb: parsed.thumb,
        has_reason: Boolean(parsed.reason),
      });
      const verbText = parsed.thumb === 'up' ? 'thumbs up' : 'thumbs down';
      return ephemeral(
        formatPlainText(`Recorded ${verbText} on \`${parsed.projectId}\`. Thanks!`),
      );
    }

    // Should be unreachable thanks to ParsedCommand exhaustiveness.
    return ephemeral(formatHelp());
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await audit(connector.id, connector.customerOrgId, 'command.error', 'failed', {
      kind: parsed.kind,
      error: message,
    });
    return ephemeral(formatPlainText(`Error: ${message}`));
  }
}

async function audit(
  connectorId: string,
  orgId: string,
  eventType: string,
  status: 'received' | 'failed' | 'succeeded',
  summary: Record<string, unknown>,
): Promise<void> {
  await recordAudit({
    connectorId,
    customerOrgId: orgId,
    eventType,
    direction: 'inbound',
    status,
    payloadSummary: summary,
  });
}

function dashboardUrlFor(projectId: string): string {
  const base = process.env.PATHFINDER_PUBLIC_URL ?? 'https://www.unicron.systems/pathfinder';
  return `${base}/projects/${projectId}`;
}

interface LeadRow {
  id: string;
  title: string;
  score: number | null;
  rationale: string | null;
  project_value: number | null;
  source: string | null;
}

async function loadTopLeads(_orgId: string, limit: number): Promise<LeadRow[]> {
  // Org scoping: Pathfinder is currently single-tenant; the projects
  // table doesn't yet have customer_org_id. v1 returns the top leads
  // globally. Phase 2 (multi-tenant cutover) will scope by org.
  const sb = supabaseAdmin() as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: boolean) => {
          order: (col: string, opts: { ascending: boolean }) => {
            limit: (n: number) => Promise<{
              data: Record<string, unknown>[] | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    };
  };
  const r = await sb
    .from('projects')
    .select('id, title, score, rationale, project_value, source')
    .eq('verified', true)
    .order('score', { ascending: false })
    .limit(limit);
  if (r.error || !r.data) return [];
  return r.data as unknown as LeadRow[];
}

interface RejectedRow {
  id: string;
  title: string;
  reason: string | null;
}

async function loadRejectedSample(_orgId: string, limit: number): Promise<RejectedRow[]> {
  const sb = supabaseAdmin() as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: boolean) => {
          order: (col: string, opts: { ascending: boolean }) => {
            limit: (n: number) => Promise<{
              data: Record<string, unknown>[] | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    };
  };
  const r = await sb
    .from('projects')
    .select('id, title, rationale')
    .eq('verified', false)
    .order('updated_at', { ascending: false })
    .limit(limit);
  if (r.error || !r.data) return [];
  return (r.data as unknown as { id: string; title: string; rationale: string | null }[]).map(
    row => ({ id: row.id, title: row.title, reason: row.rationale }),
  );
}
