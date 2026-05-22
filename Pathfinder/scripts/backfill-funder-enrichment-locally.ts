// scripts/backfill-funder-enrichment-locally.ts
//
// Operational backfill — runs the Funder enricher + adjacency-mapper for
// every qualified Funder project that does not yet carry a
// `funder_enrichment` block in raw_payload. Mirrors the body of the
// `funderEnrichAdjacency` Inngest function so the same bytes land in
// raw_payload either way.
//
// Why a script: most Funder rows were inserted via
// scripts/run-funder-ingest-locally.ts, which bypasses Inngest entirely
// (so no project.qualified events fired and no enrichment was triggered).
// Going forward, cloud Inngest covers fresh rows; this script closes the
// existing backlog.
//
// Idempotent on raw_payload.funder_enrichment.enriched_at.
//
// Usage:
//   pnpm tsx scripts/backfill-funder-enrichment-locally.ts [--limit N] [--dry-run]

import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.local' });
dotenvConfig({ path: '.env.production.local' });

import { createClient } from '@supabase/supabase-js';
import { enrichForFunder } from '@/lib/agents/funder/enricher';
import { findFunderAdjacency } from '@/lib/agents/funder/adjacency';

const FUNDER_SLUG = 'funder';
const DEFAULT_LIMIT = 500;

interface Args {
  limit: number;
  dryRun: boolean;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  let limit = DEFAULT_LIMIT;
  let dryRun = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--limit' && argv[i + 1]) {
      limit = Number(argv[i + 1]);
      i++;
    } else if (argv[i] === '--dry-run') {
      dryRun = true;
    }
  }
  return { limit, dryRun };
}

async function main() {
  const { limit, dryRun } = parseArgs();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required');
  if (!process.env.PERPLEXITY_API_KEY) throw new Error('PERPLEXITY_API_KEY required for Sonar calls');
  const sb = createClient(url, key, { db: { schema: 'pathfinder' }, auth: { persistSession: false } });

  const { data: orgRow, error: orgErr } = await sb
    .from('organizations')
    .select('id, slug')
    .eq('slug', FUNDER_SLUG)
    .maybeSingle();
  if (orgErr || !orgRow) throw new Error(`Funder org not found: ${orgErr?.message ?? 'missing'}`);
  const orgId = (orgRow as { id: string }).id;

  // Pull qualified, un-enriched rows. Qualifier-rejected rows never
  // made it into the table, so any row in pathfinder.projects for this
  // org is qualified by construction (the ingest subscriber drops
  // q.qualified=false events before insert).
  const { data: rows, error } = await sb
    .from('projects')
    .select('id, title, summary, source, raw_payload, score')
    .eq('organization_id', orgId)
    .order('score', { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) throw new Error(`select failed: ${error.message}`);
  type Row = { id: string; title: string | null; summary: string | null; source: string; raw_payload: Record<string, unknown> | null; score: number | null };
  const all = (rows ?? []) as Row[];
  const toEnrich = all.filter((r) => {
    const payload = (r.raw_payload ?? {}) as Record<string, unknown>;
    const enr = payload.funder_enrichment as { enriched_at?: string } | undefined;
    return !enr?.enriched_at;
  });

  console.log(`[backfill] org=${FUNDER_SLUG} total=${all.length} already_enriched=${all.length - toEnrich.length} to_enrich=${toEnrich.length} dryRun=${dryRun}`);
  if (toEnrich.length === 0) {
    console.log('[backfill] nothing to do');
    return;
  }
  if (dryRun) {
    for (const r of toEnrich.slice(0, 20)) {
      console.log(`  · ${r.id} | score=${r.score ?? 'null'} | ${r.title?.slice(0, 80) ?? '(no title)'}`);
    }
    if (toEnrich.length > 20) console.log(`  ... and ${toEnrich.length - 20} more`);
    return;
  }

  let enrichedCount = 0;
  let totalCost = 0;
  for (let i = 0; i < toEnrich.length; i++) {
    const r = toEnrich[i];
    const existingPayload = (r.raw_payload ?? {}) as Record<string, unknown>;
    process.stdout.write(`[${i + 1}/${toEnrich.length}] ${r.id} score=${r.score ?? '-'} ... `);
    let enrichment: Awaited<ReturnType<typeof enrichForFunder>> | null = null;
    let adjacency: Awaited<ReturnType<typeof findFunderAdjacency>> | null = null;
    try {
      enrichment = await enrichForFunder({
        project_id: r.id,
        title: r.title ?? '',
        summary: r.summary,
        source: r.source,
        raw_payload: existingPayload,
      });
    } catch (err) {
      console.log(`enrich FAILED: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
    try {
      const founders = (enrichment.founders ?? []).map((f) => ({
        name: f.name,
        prior_affiliation: f.prior_affiliation,
      }));
      const portfolioNames = (existingPayload.funder_portfolio_hint as string[] | undefined) ?? [];
      adjacency = await findFunderAdjacency({
        project_id: r.id,
        title: r.title ?? '',
        summary: r.summary,
        founders,
        portfolio_names: portfolioNames,
      });
    } catch (err) {
      console.log(`adjacency FAILED: ${err instanceof Error ? err.message : String(err)}`);
      // Persist enrichment without adjacency rather than dropping both.
      adjacency = {
        project_id: r.id,
        talent_edges: [],
        peer_funder_signal: null,
        portfolio_warm_intros: [],
        citations: [],
        model: 'unavailable',
        cost_usd: 0,
        latency_ms: 0,
        raw_response: '',
      };
    }

    const merged = {
      ...existingPayload,
      funder_enrichment: {
        org_name: enrichment.org_name,
        legal_form: enrichment.legal_form,
        founders: enrichment.founders,
        founded_year: enrichment.founded_year,
        raise_target_usd: enrichment.raise_target_usd,
        fundraising_stage: enrichment.fundraising_stage,
        brief: enrichment.brief,
        citations: enrichment.citations,
        model: enrichment.model,
        cost_usd: enrichment.cost_usd,
        latency_ms: enrichment.latency_ms,
        enriched_at: new Date().toISOString(),
      },
      funder_adjacency: {
        talent_edges: adjacency.talent_edges,
        peer_funder_signal: adjacency.peer_funder_signal,
        portfolio_warm_intros: adjacency.portfolio_warm_intros,
        citations: adjacency.citations,
        model: adjacency.model,
        cost_usd: adjacency.cost_usd,
        latency_ms: adjacency.latency_ms,
        adjacency_at: new Date().toISOString(),
      },
    };
    const { error: updErr } = await sb.from('projects').update({ raw_payload: merged }).eq('id', r.id);
    if (updErr) {
      console.log(`persist FAILED: ${updErr.message}`);
      continue;
    }
    enrichedCount++;
    totalCost += (enrichment.cost_usd ?? 0) + (adjacency.cost_usd ?? 0);
    console.log(
      `ok · founders=${enrichment.founders.length} talent_edges=${adjacency.talent_edges.length} cost_usd=${(enrichment.cost_usd + adjacency.cost_usd).toFixed(4)}`,
    );
  }

  console.log(`\n[backfill] DONE · enriched=${enrichedCount}/${toEnrich.length} total_cost_usd=${totalCost.toFixed(4)}`);
}

main().catch((err: unknown) => {
  console.error('[backfill-funder-enrichment-locally] FAILED:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
