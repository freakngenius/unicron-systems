// lib/inngest/functions/verify-build-out.ts — Build-Out Pass Slices 3+5.
//
// Subscribes to `pathfinder/org.ready_to_view`, fetches the customer's
// /[slug] route, parses returned HTML via regex, and flips
// pathfinder.organizations.status to either `build_out_complete` (pass)
// or `build_out_failed` (with diagnostic jsonb).
//
// Markers (data-kpi-strip, data-lead-card, data-chart, data-error,
// data-empty-state) are emitted by the Slice 2 renderer (parallel
// sub-agent's PR). Until that lands, this function will fail with a
// clear diagnostic, which is intentional — failure here is signal, not
// noise.
//
// Single-attempt verification only for the demo. The full iterate-to-green
// retry loop (max 5 attempts with adaptive fix routing per SPEC §4) is
// deferred to a separate card.
//
// Spec: Company Docs/Metacron/SPEC - Pathfinder Build-Out Pass.md §3 + §5.

import { inngest } from '../client';
import { supabaseAdmin } from '@/lib/supabase';

// TODO(buildout): iterate-to-green loop — separate card. Single-attempt
// verification is enough for the 2026-05-13 demo; the spec's max-5-attempt
// loop with adaptive fix routing (rerun ingestion / adjust ui_plan /
// regenerate component) ships in a follow-up.

type DiagnosticReason =
  | 'missing_kpi_strip'
  | 'too_few_lead_cards'
  | 'http_401'
  | 'http_5xx'
  | 'no_charts'
  | 'data_error_marker';

interface Diagnostic {
  reason: DiagnosticReason;
  html_snippet?: string;
  http_status?: number;
}

interface OrgRow {
  id: string;
  slug: string;
  status: string;
}

const HTML_SNIPPET_MAX = 500;

function truncate(html: string): string {
  if (html.length <= HTML_SNIPPET_MAX) return html;
  return `${html.slice(0, HTML_SNIPPET_MAX)}...[truncated]`;
}

function countMatches(html: string, re: RegExp): number {
  // Use a fresh global regex per call to avoid lastIndex leakage.
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
  let n = 0;
  while (g.exec(html) !== null) n++;
  return n;
}

function verifyHtml(html: string): { ok: true } | { ok: false; diagnostic: Diagnostic } {
  // 1. data-error markers fail the build-out regardless of other checks.
  if (/data-error\b/.test(html)) {
    return { ok: false, diagnostic: { reason: 'data_error_marker', html_snippet: truncate(html) } };
  }

  // 2. KPI strip must be present.
  if (!/data-kpi-strip\b/.test(html)) {
    return { ok: false, diagnostic: { reason: 'missing_kpi_strip', html_snippet: truncate(html) } };
  }

  // 3. At least one chart must be present.
  if (!/data-chart\b/.test(html)) {
    return { ok: false, diagnostic: { reason: 'no_charts', html_snippet: truncate(html) } };
  }

  // 4. At least 3 lead cards OR an explicit empty-state marker.
  const leadCardCount = countMatches(html, /data-lead-card\b/);
  const hasEmptyState = /data-empty-state\b/.test(html);
  if (leadCardCount < 3 && !hasEmptyState) {
    return {
      ok: false,
      diagnostic: { reason: 'too_few_lead_cards', html_snippet: truncate(html) },
    };
  }

  return { ok: true };
}

export const verifyBuildOut = inngest.createFunction(
  {
    id: 'pathfinder-verify-build-out',
    name: 'Verify build-out — flip status to build_out_complete/failed (Build-Out Pass slice 3+5)',
    retries: 1,
    triggers: [{ event: 'pathfinder/org.ready_to_view' }],
  },
  async ({
    event,
    step,
  }: {
    event: { data: { organization_id: string } };
    step: unknown;
  }) => {
    const stepCtx = step as {
      run: <T>(name: string, fn: () => Promise<T>) => Promise<T>;
    };
    const { organization_id } = event.data;

    // 1. Fetch org row.
    const org = await stepCtx.run('fetch-org', async () => {
      const admin = supabaseAdmin();
      const { data, error } = await (
        admin.from('organizations') as unknown as {
          select: (cols: string) => {
            eq: (col: string, val: string) => {
              maybeSingle: () => Promise<{
                data: OrgRow | null;
                error: { message: string } | null;
              }>;
            };
          };
        }
      )
        .select('id,slug,status')
        .eq('id', organization_id)
        .maybeSingle();
      if (error) throw new Error(`verify-build-out: fetch failed: ${error.message}`);
      if (!data) throw new Error(`verify-build-out: organization ${organization_id} not found`);
      return data;
    });

    // 2. HTTP fetch the /[slug] route + parse HTML.
    const verdict = await stepCtx.run(`http-verify-${org.slug}`, async () => {
      const base = process.env.PATHFINDER_BASE_URL ?? 'https://pathfinder-ashy.vercel.app';
      const url = `${base}/pathfinder/${org.slug}`;

      // Note: operator session header would go here if we had one. For
      // demo, treat 401 as a build-out failure with a clear reason.
      const res = await fetch(url, {
        headers: {
          'user-agent': 'pathfinder-verify-build-out/1.0',
          accept: 'text/html',
        },
      });

      if (res.status === 401) {
        return {
          ok: false as const,
          diagnostic: { reason: 'http_401' as const, http_status: 401 },
        };
      }
      if (res.status >= 500) {
        return {
          ok: false as const,
          diagnostic: { reason: 'http_5xx' as const, http_status: res.status },
        };
      }
      // Any other non-2xx is treated like the body might still contain
      // markers; if not, the regex checks will catch it.
      const html = await res.text();
      const verifyResult = verifyHtml(html);
      if (verifyResult.ok) return { ok: true as const };
      return { ok: false as const, diagnostic: verifyResult.diagnostic };
    });

    // 3. Update org status + diagnostic per verdict.
    if (verdict.ok) {
      await stepCtx.run(`mark-complete-${org.slug}`, async () => {
        const admin = supabaseAdmin();
        const { error } = await (
          admin.from('organizations') as unknown as {
            update: (v: {
              status: string;
              status_changed_at: string;
              build_out_diagnostic: null;
            }) => {
              eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>;
            };
          }
        )
          .update({
            status: 'build_out_complete',
            status_changed_at: new Date().toISOString(),
            build_out_diagnostic: null,
          })
          .eq('id', organization_id);
        if (error) throw new Error(`verify-build-out: pass update failed: ${error.message}`);
      });
      return { organization_id, slug: org.slug, status: 'build_out_complete' as const };
    }

    const diag = verdict.diagnostic;
    await stepCtx.run(`mark-failed-${org.slug}`, async () => {
      const admin = supabaseAdmin();
      const { error } = await (
        admin.from('organizations') as unknown as {
          update: (v: {
            status: string;
            status_changed_at: string;
            build_out_diagnostic: Diagnostic;
          }) => {
            eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>;
          };
        }
      )
        .update({
          status: 'build_out_failed',
          status_changed_at: new Date().toISOString(),
          build_out_diagnostic: diag,
        })
        .eq('id', organization_id);
      if (error) throw new Error(`verify-build-out: fail update failed: ${error.message}`);
    });
    return {
      organization_id,
      slug: org.slug,
      status: 'build_out_failed' as const,
      diagnostic: diag,
    };
  },
);
