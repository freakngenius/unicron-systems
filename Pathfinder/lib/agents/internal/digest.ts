// lib/agents/internal/digest.ts
//
// Internal onboarding Stage 8 — Daily morning digest.
//
// Generates the top-N verified Internal companies from the past 24h and
// renders a Slack-formatted message. The cron handler at
// app/api/cron/internal-digest/route.ts wires the digest into Vercel
// cron and the optional Slack webhook.
//
// Spec: Pathfinder/Pathfinder-Internal-Architecture.json business_summary
//       ("Every morning, the Unicron sales team receives a ranked list…").
//       Pathfinder/Pathfinder-Internal-Blueprint.md §9.

import type { Project } from '@/lib/types';
import { publicUrl } from '@/lib/public-url';

export interface InternalDigestEntry {
  project_id: string;
  company_name: string;
  service_category: string | null;
  score: number;
  hq_state: string | null;
  operating_states: string[];
  first_step: string | null;
  url: string;
}

export interface InternalDigestPayload {
  generated_at: string;
  window_hours: number;
  total_verified: number;
  top_n: number;
  entries: InternalDigestEntry[];
  slack_text: string;
  slack_blocks: Array<Record<string, unknown>>;
}

const DEFAULT_TOP_N = 10;
const DEFAULT_WINDOW_HOURS = 24;

function rawPayload(project: Project): Record<string, unknown> {
  return (project.raw_payload as Record<string, unknown> | null) ?? {};
}

function readEntry(project: Project): InternalDigestEntry {
  const payload = rawPayload(project);
  const enr = (payload.internal_enrichment as Record<string, unknown> | undefined) ?? {};
  const geo = (payload.internal_geo as Record<string, unknown> | undefined) ?? {};
  const service =
    (enr.service_category as string | undefined) ??
    (payload.internal_inferred_service_category as string | undefined) ??
    null;
  const hq = (geo.hq_state as string | undefined) ?? null;
  const ops = (geo.operating_states as string[] | undefined) ?? [];
  return {
    project_id: project.id,
    company_name: project.title ?? '(unknown)',
    service_category: service,
    score: project.score ?? 0,
    hq_state: hq,
    operating_states: ops,
    first_step: project.outreach_hook ?? null,
    url: `${publicUrl()}/internal/lead/${project.id}`,
  };
}

function renderSlackText(entries: InternalDigestEntry[], displayName: string): string {
  if (entries.length === 0) {
    return `${displayName} morning digest: no new verified companies in the last 24h.`;
  }
  const lines = entries.slice(0, 5).map((e, i) => {
    const ops = e.operating_states.length > 0 ? e.operating_states.join('/') : '?';
    return `${i + 1}. ${e.company_name} (${e.score}/100, ${e.service_category ?? 'unknown'}, HQ ${e.hq_state ?? '?'}, ops ${ops})`;
  });
  return `${displayName} morning digest · ${entries.length} verified company${entries.length === 1 ? '' : 'ies'} ready\n${lines.join('\n')}`;
}

function renderSlackBlocks(
  entries: InternalDigestEntry[],
  displayName: string,
): Array<Record<string, unknown>> {
  const blocks: Array<Record<string, unknown>> = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `${displayName} morning digest · ${entries.length} verified`,
      },
    },
  ];
  if (entries.length === 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: 'No new verified companies in the last 24h. The pipeline is quiet.',
      },
    });
    return blocks;
  }
  for (const e of entries) {
    const ops = e.operating_states.length > 0 ? e.operating_states.join(', ') : 'unknown';
    const lines = [
      `*<${e.url}|${e.company_name}>* · ${e.score}/100`,
      `${e.service_category ?? 'service category unknown'} · HQ ${e.hq_state ?? 'unknown'} · ops ${ops}`,
    ];
    if (e.first_step) lines.push(`First step: ${e.first_step}`);
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: lines.join('\n') },
    });
    blocks.push({ type: 'divider' });
  }
  return blocks;
}

export interface ComposeDigestArgs {
  projects: Project[];
  display_name?: string;
  top_n?: number;
  window_hours?: number;
}

export function composeInternalDigest(args: ComposeDigestArgs): InternalDigestPayload {
  const topN = args.top_n ?? DEFAULT_TOP_N;
  const windowHours = args.window_hours ?? DEFAULT_WINDOW_HOURS;
  const display = args.display_name ?? 'Unicron Internal';

  const sorted = [...args.projects].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const top = sorted.slice(0, topN);
  const entries = top.map(readEntry);
  return {
    generated_at: new Date().toISOString(),
    window_hours: windowHours,
    total_verified: args.projects.length,
    top_n: topN,
    entries,
    slack_text: renderSlackText(entries, display),
    slack_blocks: renderSlackBlocks(entries, display),
  };
}

// Exported for tests.
export { readEntry, renderSlackText, renderSlackBlocks };
