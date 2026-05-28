// scripts/backfill-pitch-generation.ts
//
// Sprint Z4 — One-shot backfill: for every Zedcor project that is in a buy
// window OR in awarded/gc_selected/sub_bid/mobilization phase, generate the
// pitch_metadata jsonb (cross-pollination + hooks + recommended action +
// action_by_date) and update the corresponding Notion row.
//
// Usage:
//   pnpm tsx scripts/backfill-pitch-generation.ts                       # write
//   pnpm tsx scripts/backfill-pitch-generation.ts --dry-run             # log only
//   pnpm tsx scripts/backfill-pitch-generation.ts --limit=50            # cap
//   pnpm tsx scripts/backfill-pitch-generation.ts --skip-notion         # DB-only
//   pnpm tsx scripts/backfill-pitch-generation.ts --skip-anthropic      # Notion-only
//
// --skip-anthropic (Sprint Z5b) — Notion-update-only mode: iterate rows where
// pitch_metadata IS NOT NULL, read the cached hooks / cross-pollination /
// recommended-action from that jsonb, and push to Notion via the existing
// updateProjectPitchBySignature path. Never calls Sonnet, never re-runs
// cross-pollination, never re-writes pitch_metadata. Useful when an earlier
// run completed the DB side but the Notion writer was gated (e.g.
// NOTION_API_TOKEN absent at that time) and the cached pitches now need to
// be pushed without re-spending tokens.
//
// Env loading mirrors scripts/backfill-notion-zedcor.ts:
//   .env.production.local → .env.local → process.env
//
// Required envs: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
// ANTHROPIC_API_KEY (unless --skip-anthropic), NOTION_API_TOKEN (unless --skip-notion).

import { config as dotenvConfig } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { resolveCrossPollination } from '../lib/adapters/zedcor/cross-pollination';
import { generatePitchHooks } from '../lib/adapters/zedcor/pitch-generator';
import { assembleRecommendedAction } from '../lib/adapters/zedcor/recommended-action';
import { inferTypeTags } from '../lib/adapters/zedcor/type-tag-inferrer';
import { updateProjectPitchBySignature } from '../lib/notion/zedcor-writer';

dotenvConfig({ path: '.env.production.local' });
dotenvConfig({ path: '.env.local' });
dotenvConfig();

const DEFAULT_LIMIT = 300;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
const flags = process.argv.slice(2);
const dryRun = flags.includes('--dry-run');
const skipNotion = flags.includes('--skip-notion');
const skipAnthropic = flags.includes('--skip-anthropic');
const limitFlag = flags.find((f) => f.startsWith('--limit='));
const limit = limitFlag ? Number(limitFlag.split('=')[1]) : DEFAULT_LIMIT;
if (!Number.isFinite(limit) || limit <= 0) {
  console.error(`Invalid --limit value: ${limitFlag}`);
  process.exit(1);
}

if (skipAnthropic && skipNotion) {
  console.error('--skip-anthropic and --skip-notion together would do nothing. Pick one.');
  process.exit(1);
}

if (!skipAnthropic && !process.env.ANTHROPIC_API_KEY) {
  console.error('Missing ANTHROPIC_API_KEY — required for pitch generation (or pass --skip-anthropic to push cached pitches only)');
  process.exit(1);
}

if (!skipNotion && !process.env.NOTION_API_TOKEN) {
  console.error('Missing NOTION_API_TOKEN — set it or pass --skip-notion');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  db: { schema: 'pathfinder' },
  auth: { persistSession: false, autoRefreshToken: false },
});

interface ProjectRow {
  id: string;
  source: string;
  source_id: string;
  title: string;
  summary: string | null;
  project_value: number | null;
  project_stage: string | null;
  posted_date: string | null;
  raw_payload: Record<string, unknown> | null;
  buy_window_open: boolean | null;
  external_refs: Record<string, unknown> | null;
  gc_metadata: Record<string, unknown> | null;
  pitch_metadata: Record<string, unknown> | null;
}

async function loadCandidates(): Promise<ProjectRow[]> {
  // Sprint Z5b — in --skip-anthropic mode the candidate pool is "rows that
  // already carry a cached pitch_metadata.pitch_hooks array". The legacy
  // pitch_metadata column on older rows holds a stub shape (type_tags /
  // degraded only) without the pitch_hooks key; filtering by the key's
  // presence avoids loading stubs that would no-op.
  if (skipAnthropic) {
    const cached = await supabase
      .from('projects')
      .select('*')
      .not('pitch_metadata->pitch_hooks', 'is', null)
      .order('posted_date', { ascending: false, nullsFirst: false })
      .limit(limit);
    if (cached.error) throw new Error(`load cached-pitch rows failed: ${cached.error.message}`);
    return ((cached.data ?? []) as unknown as ProjectRow[]).slice(0, limit);
  }

  // SELECT * so missing optional columns (gc_metadata pre-Z3.5) don't fail.
  // PostgREST .or filter for stage OR buy_window_open.
  const stageList = 'project_stage.in.(awarded,gc_selected,sub_bid,mobilization)';
  const buyWindow = 'buy_window_open.is.true';
  // First page: buy_window_open=true (priority).
  const priority = await supabase
    .from('projects')
    .select('*')
    .eq('buy_window_open', true)
    .order('posted_date', { ascending: false })
    .limit(limit);
  if (priority.error) throw new Error(`load priority failed: ${priority.error.message}`);

  const pool = (priority.data ?? []) as unknown as ProjectRow[];
  if (pool.length < limit) {
    const remaining = limit - pool.length;
    const stage = await supabase
      .from('projects')
      .select('*')
      .or(`${stageList},${buyWindow}`)
      .order('posted_date', { ascending: false })
      .limit(remaining + pool.length);
    if (stage.error) throw new Error(`load stage-eligible failed: ${stage.error.message}`);
    const stageRows = (stage.data ?? []) as unknown as ProjectRow[];
    const seen = new Set(pool.map((p) => p.id));
    for (const r of stageRows) {
      if (!seen.has(r.id)) pool.push(r);
      if (pool.length >= limit) break;
    }
  }
  return pool.slice(0, limit);
}

interface Stats {
  considered: number;
  generated: number;
  notion_updated: number;
  notion_missing: number;
  failures: number;
}

async function main(): Promise<void> {
  const stats: Stats = { considered: 0, generated: 0, notion_updated: 0, notion_missing: 0, failures: 0 };
  const candidates = await loadCandidates();
  stats.considered = candidates.length;
  console.log(`[backfill-pitch] loaded ${candidates.length} candidates (limit=${limit}, dryRun=${dryRun}, skipNotion=${skipNotion}, skipAnthropic=${skipAnthropic})`);

  for (const p of candidates) {
    try {
      // Sprint Z5b — --skip-anthropic branch: read cached pitch_metadata and
      // push to Notion only. No Sonnet, no CP, no recommended-action recompute.
      if (skipAnthropic) {
        const pm = (p.pitch_metadata ?? {}) as Record<string, unknown>;
        const hooksArr = Array.isArray(pm.pitch_hooks) ? (pm.pitch_hooks as unknown[]) : [];
        const hook1 = typeof hooksArr[0] === 'string' ? (hooksArr[0] as string) : '';
        const hook2 = typeof hooksArr[1] === 'string' ? (hooksArr[1] as string) : '';
        const hook3 = typeof hooksArr[2] === 'string' ? (hooksArr[2] as string) : '';
        const crossPoll = typeof pm.cross_pollination === 'string' ? (pm.cross_pollination as string) : null;
        const warmIntro = typeof pm.warm_intro_path === 'string' ? (pm.warm_intro_path as string) : null;
        const recAction = typeof pm.recommended_action === 'string' ? (pm.recommended_action as string) : null;
        const actionByDate = typeof pm.action_by_date === 'string' ? (pm.action_by_date as string) : null;

        if (!hook1 && !hook2 && !hook3 && !recAction) {
          stats.notion_missing += 1;
          continue;
        }

        if (dryRun) {
          console.log(`[backfill-pitch] DRY-skip-anthropic ${p.source}:${p.source_id} hooks=[${[hook1.slice(0, 40), hook2.slice(0, 40), hook3.slice(0, 40)].join(' | ')}]`);
          stats.generated += 1;
          continue;
        }

        stats.generated += 1;
        const notionRes = await updateProjectPitchBySignature({
          source: p.source,
          source_id: p.source_id,
          pitch: {
            cross_pollination: crossPoll,
            warm_intro_path: warmIntro,
            pitch_hooks: [hook1, hook2, hook3],
            recommended_action: recAction,
            action_by_date: actionByDate,
          },
        });
        if (notionRes) stats.notion_updated += 1;
        else stats.notion_missing += 1;
        await new Promise((r) => setTimeout(r, 350));
        continue;
      }

      const gcMeta = (p.gc_metadata ?? {}) as Record<string, unknown>;
      const gcName = (gcMeta.gc_name as string | null | undefined) ?? null;
      const gcContactName = (gcMeta.gc_contact_name as string | null | undefined) ?? null;
      const gcContactRole = (gcMeta.gc_contact_role as string | null | undefined) ?? null;
      const gcContactPhone = (gcMeta.gc_contact_phone as string | null | undefined) ?? null;
      const subBidDeadline = (gcMeta.sub_bid_deadline as string | null | undefined) ?? null;
      const gcAwardDate = (gcMeta.gc_award_date as string | null | undefined) ?? null;

      const agency = (p.raw_payload?.agency as string | null) ?? null;
      const city = (p.raw_payload?.city as string | null) ?? null;
      const county = (p.raw_payload?.county as string | null) ?? null;
      const state = (p.raw_payload?.state as string | null) ?? null;

      const typeTags = inferTypeTags({ title: p.title, summary: p.summary });

      // Sprint Z12 — pass project title + summary so cross-pollination can
      // apply the construction-relevance gate.
      const cp = gcName
        ? await resolveCrossPollination({
            gcName,
            supabase: supabase as unknown as Parameters<typeof resolveCrossPollination>[0]['supabase'],
            projectTitle: p.title,
            projectSummary: p.summary,
          })
        : { cross_pollination: null, warm_intro_path: null, matched_customer: null, confidence: 0, possible_cross_pollination: [] };

      const pitchResult = await generatePitchHooks({
        title: p.title,
        agency,
        summary: p.summary,
        project_value: p.project_value,
        city,
        county,
        state,
        project_stage: p.project_stage,
        posted_date: p.posted_date,
        gc_name: gcName,
        inferred_type_tags: typeTags,
      });

      const action = assembleRecommendedAction({
        title: p.title,
        gc_name: gcName,
        gc_contact_name: gcContactName,
        gc_contact_role: gcContactRole,
        gc_contact_phone: gcContactPhone,
        cross_pollination: cp.cross_pollination,
        hooks: pitchResult.hooks,
        sub_bid_deadline: subBidDeadline,
        gc_award_date: gcAwardDate,
        posted_date: p.posted_date,
      });

      const metadata = {
        cross_pollination: cp.cross_pollination,
        warm_intro_path: cp.warm_intro_path,
        matched_customer: cp.matched_customer,
        match_confidence: cp.confidence,
        possible_cross_pollination: cp.possible_cross_pollination,
        pitch_hooks: [pitchResult.hooks.hook_1, pitchResult.hooks.hook_2, pitchResult.hooks.hook_3],
        pitch_model: pitchResult.model,
        recommended_action: action.recommended_action,
        action_by_date: action.action_by_date,
        type_tags: typeTags,
        degraded: pitchResult.degraded,
        generated_at: pitchResult.generated_at,
      };

      if (dryRun) {
        console.log(`[backfill-pitch] DRY ${p.source}:${p.source_id} hooks=[${[pitchResult.hooks.hook_1.slice(0, 40), pitchResult.hooks.hook_2.slice(0, 40), pitchResult.hooks.hook_3.slice(0, 40)].join(' | ')}]`);
      } else {
        const { error: upErr } = await supabase
          .from('projects')
          .update({ pitch_metadata: metadata })
          .eq('id', p.id);
        if (upErr) throw new Error(`pitch_metadata write failed: ${upErr.message}`);
      }

      stats.generated += 1;

      if (!dryRun && !skipNotion) {
        const notionRes = await updateProjectPitchBySignature({
          source: p.source,
          source_id: p.source_id,
          pitch: {
            cross_pollination: cp.cross_pollination,
            warm_intro_path: cp.warm_intro_path,
            pitch_hooks: [pitchResult.hooks.hook_1, pitchResult.hooks.hook_2, pitchResult.hooks.hook_3],
            recommended_action: action.recommended_action,
            action_by_date: action.action_by_date,
          },
        });
        if (notionRes) {
          stats.notion_updated += 1;
        } else {
          stats.notion_missing += 1;
        }
        await new Promise((r) => setTimeout(r, 350));
      }
    } catch (err) {
      stats.failures += 1;
      console.error(`[backfill-pitch] FAILED ${p.source}:${p.source_id} — ${(err as Error).message}`);
    }
  }

  console.log(`[backfill-pitch] DONE ${JSON.stringify(stats)}`);
}

main().catch((err) => {
  console.error('[backfill-pitch] fatal', err);
  process.exit(1);
});
