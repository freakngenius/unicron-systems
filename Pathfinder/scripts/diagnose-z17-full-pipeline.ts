// scripts/diagnose-z17-full-pipeline.ts
//
// Z17 — end-to-end diagnostic for the manual orchestrator. Drives
// runZedcorOrchestrator() against the live Zedcor backend (the same code
// path `POST /pathfinder/api/zedcor/run-orchestrator` takes) and prints a
// before/after dossier suitable for pasting verbatim into the Z17 PR.
//
// Run:
//   pnpm tsx scripts/diagnose-z17-full-pipeline.ts                # one trigger
//   pnpm tsx scripts/diagnose-z17-full-pipeline.ts --twice        # idempotency check
//   ZED_PROBE_ID=harris-county-bonfire:26/0163 pnpm tsx ...       # probe a different row
//
// Env: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required.
//      ANTHROPIC_API_KEY needed for the pitch wave + backfill pitch step.
//      NOTION_API_TOKEN needed for the Notion writes.

import { runZedcorOrchestrator } from '../lib/orchestrator/orchestrator';
import { supabaseAdmin } from '../lib/supabase';

const ZEDCOR_ORG_ID = '6cd87740-7c72-4337-ac79-316a54242eef';
const FEDERAL_SOURCES = ['sam.gov', 'usaspending'];
const PROBE_ID = process.env.ZED_PROBE_ID ?? 'harris-county-bonfire:26/0163';

interface AggregateCounts {
  total: number;
  with_score: number;
  with_hooks: number;
  with_gc_name: number;
  in_window: number;
  construction_total: number;
  construction_with_score: number;
  construction_with_hooks: number;
  construction_in_window: number;
}

async function aggregateCounts(): Promise<AggregateCounts> {
  const admin = supabaseAdmin();
  // Two queries: one for the full set, one for construction-relevant only.
  // RPC would be cleaner but we keep the diagnostic self-contained.
  const allRows = await fetchAllRows(admin);

  const total = allRows.length;
  let with_score = 0;
  let with_hooks = 0;
  let with_gc_name = 0;
  let in_window = 0;
  let construction_total = 0;
  let construction_with_score = 0;
  let construction_with_hooks = 0;
  let construction_in_window = 0;

  for (const r of allRows) {
    const isConstruction = !FEDERAL_SOURCES.includes(r.source);
    if (r.score !== null && r.score !== undefined) with_score += 1;
    const pm = r.pitch_metadata as { pitch_hooks?: unknown } | null;
    const hooks = Array.isArray(pm?.pitch_hooks) && pm!.pitch_hooks.length > 0;
    if (hooks) with_hooks += 1;
    const gc = r.gc_metadata as { gc_name?: string } | null;
    if (gc?.gc_name) with_gc_name += 1;
    if (r.buy_window_open === true) in_window += 1;
    if (isConstruction) {
      construction_total += 1;
      if (r.score !== null && r.score !== undefined) construction_with_score += 1;
      if (hooks) construction_with_hooks += 1;
      if (r.buy_window_open === true) construction_in_window += 1;
    }
  }

  return {
    total, with_score, with_hooks, with_gc_name, in_window,
    construction_total, construction_with_score,
    construction_with_hooks, construction_in_window,
  };
}

interface RawRow {
  source: string;
  score: number | null;
  pitch_metadata: Record<string, unknown> | null;
  gc_metadata: Record<string, unknown> | null;
  buy_window_open: boolean | null;
}

async function fetchAllRows(admin: ReturnType<typeof supabaseAdmin>): Promise<RawRow[]> {
  const PAGE = 1000;
  const out: RawRow[] = [];
  let start = 0;
  for (;;) {
    const res = await (admin.from('projects') as unknown as {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          range: (from: number, to: number) => Promise<{ data: RawRow[] | null; error: { message: string } | null }>;
        };
      };
    })
      .select('source, score, pitch_metadata, gc_metadata, buy_window_open')
      .eq('organization_id', ZEDCOR_ORG_ID)
      .range(start, start + PAGE - 1);
    if (res.error) throw new Error(`fetchAllRows page failed: ${res.error.message}`);
    const page = res.data ?? [];
    out.push(...page);
    if (page.length < PAGE) break;
    start += PAGE;
  }
  return out;
}

interface ProbeRow {
  id: string;
  source: string;
  source_id: string;
  title: string;
  score: number | null;
  rationale: string | null;
  project_stage: string | null;
  buy_window_open: boolean | null;
  posted_date: string | null;
  response_deadline: string | null;
  ranked_at: string | null;
  gc_metadata: Record<string, unknown> | null;
  pitch_metadata: Record<string, unknown> | null;
  external_refs: Record<string, unknown> | null;
}

async function fetchProbeRow(probeId: string): Promise<ProbeRow | null> {
  const [source, source_id] = probeId.split(':') as [string, string];
  const admin = supabaseAdmin();
  const res = await (admin.from('projects') as unknown as {
    select: (cols: string) => {
      eq: (col: string, val: string) => {
        eq: (col: string, val: string) => {
          maybeSingle: () => Promise<{ data: ProbeRow | null; error: { message: string } | null }>;
        };
      };
    };
  })
    .select('id, source, source_id, title, score, rationale, project_stage, buy_window_open, posted_date, response_deadline, ranked_at, gc_metadata, pitch_metadata, external_refs')
    .eq('source', source)
    .eq('source_id', source_id)
    .maybeSingle();
  if (res.error) throw new Error(`fetchProbeRow failed: ${res.error.message}`);
  return res.data ?? null;
}

function probeSnapshot(p: ProbeRow | null): string {
  if (!p) return '(no row)';
  const pm = p.pitch_metadata as { pitch_hooks?: unknown; recommended_action?: unknown } | null;
  const hooks = Array.isArray(pm?.pitch_hooks) ? pm!.pitch_hooks.length : 0;
  const action = typeof pm?.recommended_action === 'string' ? pm!.recommended_action!.slice(0, 80) : null;
  const gc = p.gc_metadata as { gc_name?: string } | null;
  return [
    `  id:                 ${p.id}`,
    `  title:              ${p.title.slice(0, 100)}`,
    `  project_stage:      ${p.project_stage}`,
    `  buy_window_open:    ${p.buy_window_open}`,
    `  score:              ${p.score}`,
    `  rationale:          ${p.rationale}`,
    `  ranked_at:          ${p.ranked_at}`,
    `  gc_metadata.gc_name:${gc?.gc_name ?? '(null)'}`,
    `  pitch_hooks:        ${hooks} hooks`,
    `  recommended_action: ${action ? `"${action}…"` : '(null)'}`,
    `  notion_page_url:    ${(p.external_refs?.notion_page_url as string | undefined) ?? '(none)'}`,
  ].join('\n');
}

function printAggregate(label: string, a: AggregateCounts): void {
  console.log(`[${label}]`);
  console.log(`  total                       : ${a.total}`);
  console.log(`  with_score                  : ${a.with_score}`);
  console.log(`  with_hooks                  : ${a.with_hooks}`);
  console.log(`  with_gc_name                : ${a.with_gc_name}`);
  console.log(`  in_window                   : ${a.in_window}`);
  console.log(`  construction_total          : ${a.construction_total}`);
  console.log(`  construction_with_score     : ${a.construction_with_score}`);
  console.log(`  construction_with_hooks     : ${a.construction_with_hooks}`);
  console.log(`  construction_in_window      : ${a.construction_in_window}`);
}

async function main(): Promise<void> {
  const twice = process.argv.includes('--twice');

  console.log('==========================================================');
  console.log('Z17 — Manual-trigger full-pipeline diagnostic');
  console.log(`probe row : ${PROBE_ID}`);
  console.log(`twice mode: ${twice}`);
  console.log('==========================================================\n');

  console.log('### BEFORE');
  const beforeAgg = await aggregateCounts();
  printAggregate('aggregate before', beforeAgg);
  const beforeProbe = await fetchProbeRow(PROBE_ID);
  console.log(`\n[probe before — ${PROBE_ID}]`);
  console.log(probeSnapshot(beforeProbe));

  console.log('\n### TRIGGER #1');
  const t0 = Date.now();
  const summary1 = await runZedcorOrchestrator();
  const ms1 = Date.now() - t0;
  console.log(`run #1 completed in ${ms1}ms`);
  console.log(JSON.stringify(summary1, null, 2));

  let summary2: typeof summary1 | null = null;
  if (twice) {
    console.log('\n### TRIGGER #2 (idempotency)');
    const t1 = Date.now();
    summary2 = await runZedcorOrchestrator();
    const ms2 = Date.now() - t1;
    console.log(`run #2 completed in ${ms2}ms`);
    console.log(JSON.stringify(summary2, null, 2));
  }

  console.log('\n### AFTER');
  const afterAgg = await aggregateCounts();
  printAggregate('aggregate after', afterAgg);
  const afterProbe = await fetchProbeRow(PROBE_ID);
  console.log(`\n[probe after — ${PROBE_ID}]`);
  console.log(probeSnapshot(afterProbe));

  // Delta summary
  console.log('\n### DELTA');
  console.log(`  with_score                  : ${beforeAgg.with_score} → ${afterAgg.with_score}  (Δ ${afterAgg.with_score - beforeAgg.with_score})`);
  console.log(`  with_hooks                  : ${beforeAgg.with_hooks} → ${afterAgg.with_hooks}  (Δ ${afterAgg.with_hooks - beforeAgg.with_hooks})`);
  console.log(`  construction_with_score     : ${beforeAgg.construction_with_score} → ${afterAgg.construction_with_score}  (Δ ${afterAgg.construction_with_score - beforeAgg.construction_with_score})`);
  console.log(`  construction_with_hooks     : ${beforeAgg.construction_with_hooks} → ${afterAgg.construction_with_hooks}  (Δ ${afterAgg.construction_with_hooks - beforeAgg.construction_with_hooks})`);
  console.log(`  construction_in_window      : ${beforeAgg.construction_in_window} → ${afterAgg.construction_in_window}`);
  console.log(`  total                       : ${beforeAgg.total} → ${afterAgg.total}  (Δ ${afterAgg.total - beforeAgg.total})  ← idempotency: should be 0 on re-trigger`);

  // Note: probes for ZED-58 (or whatever ZED_PROBE_ID was set to) show the
  // bare → enriched transition required by acceptance criterion #1.
}

main().catch((err) => {
  console.error('diagnose-z17 failed:', err);
  process.exit(1);
});
