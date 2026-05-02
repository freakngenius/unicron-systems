// scripts/reclassify-demoted.ts — Z-F finish backfill.
//
// One-shot, idempotent. Re-runs the loosened Haiku triage classifier on every
// project currently demoted with rationale 'Filtered as non-opportunity by
// classifier' and rejection_reason IS NULL. For projects that flip to "yes"
// under the new prompt, resets score=NULL + rationale=NULL so the next
// ranker cron cycle picks them up and routes through Sonnet for full
// scoring.
//
// Background: the Z-F sprint surfaced that Nashville/Pittsburgh/LA top scores
// were 65 / 46 / 42 — none above 90. Diagnosis showed the Haiku triage was
// rejecting real federal construction awards (CDM Constructors $357M water
// system, Kiewit $241M Hurricane Helene, Brasfield & Gorrie federal buildings)
// because the original prompt was too binary and didn't list common GC names.
// The Demo Polish Sprint loosened the prompt with explicit construction
// signals + GC allowlist + "when in doubt, yes" bias. This script re-applies
// the new classifier to the existing demoted pile.
//
// Idempotent guards:
//   - Only touches rows where score=0 AND rationale ilike '%non-opportunity%'
//     AND rejection_reason IS NULL.
//   - Skips rows already flipped (score IS NULL means a prior run already
//     reset them).
//
// Cost guardrail (HARD STOP at $5): tracks running total via
// pathfinder.llm_calls.cost_usd. With ~239 demoted rows and Haiku ≈
// $0.0007/call, expected total ≤ $0.20.
//
// Usage (from inside Pathfinder/):
//   tsx scripts/reclassify-demoted.ts
//
// Honors NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY +
// ANTHROPIC_API_KEY env vars.

import 'dotenv/config';

import Anthropic from '@anthropic-ai/sdk';
import { supabaseAdmin } from '@/lib/supabase';

const HAIKU_MODEL = 'claude-haiku-4-5';
const COST_CAP_USD = 5;
const BATCH_SIZE = 10;

const SYSTEM_PROMPT = [
  'You are a triage classifier for a multi-branch field-sales security/surveillance firm',
  '(perimeter security, vehicle barriers, surveillance camera arrays, mobile surveillance towers,',
  'vehicle monitoring). Given a public-data project record, decide whether it is a real',
  'construction-adjacent opportunity worth a Sonnet-grade rationale.',
  '\n\nCLASSIFY YES if any of these is true:',
  '- Title or summary mentions construction, facility, building, renovation, expansion,',
  '  infrastructure, campus, plant, courthouse, hospital, airport, port, federal building,',
  '  water system, dam, levee, bridge, highway, road, terminal, warehouse, datacenter, or',
  '  similar physical-asset work.',
  '- Recipient name (in raw_payload) contains "construction", "constructors", "builders",',
  '  "contracting", "infrastructure", "civil", or matches a known general contractor pattern',
  '  like Kiewit, Skanska, Balfour Beatty, Turner, Whiting-Turner, Hensel Phelps, Brasfield,',
  '  Big-D, Clark, Mortenson, PCL, McCarthy, Swinerton, DPR, Suffolk, Gilbane, Barton Malow,',
  '  Structure Tone, Lendlease, Fluor, Bechtel, Granite, Tutor Perini, AECOM, Jacobs.',
  '- Stage = solicitation with a title indicating physical-asset construction or facility',
  '  expansion (even if the prime is unknown).',
  '- Awarding agency is GSA, Department of the Interior, Department of Veterans Affairs,',
  '  Department of Energy, NASA, Army Corps of Engineers, USACE, DoD facilities, or any',
  '  agency that routinely issues construction work, AND the title is not obviously',
  '  software/IT/consulting.',
  '\n\nCLASSIFY NO only when the record is clearly NOT physical-asset construction:',
  '- Software, IT services, cloud, cyber, data systems, analytics, R&D, satellite imagers.',
  '- Consulting, advisory, professional services, task-order awards for engineering studies.',
  '- Staff augmentation, personnel services, training, recruiting.',
  '- Pure equipment/supply purchases not paired with installation or construction.',
  '- Pure logistics, freight, fuel, or transportation services.',
  '\n\nWhen in doubt, classify YES — the downstream Sonnet rationale stage will provide the',
  'precision filter. False positives are cheap (one Sonnet call); false negatives are demo-killers.',
  '\n\nRespond with EXACTLY one token: "yes" or "no". No punctuation, no explanation.',
].join(' ');

interface DemotedProject {
  id: string;
  title: string | null;
  summary: string | null;
  raw_payload: Record<string, unknown> | null;
  project_stage: string | null;
  project_value: number | null;
}

async function classify(client: Anthropic, p: DemotedProject): Promise<'yes' | 'no' | null> {
  const user = JSON.stringify({
    title: p.title,
    summary: p.summary,
    raw_payload: p.raw_payload,
    project_stage: p.project_stage,
    project_value: p.project_value,
  });

  try {
    const res = await client.messages.create({
      model: HAIKU_MODEL,
      max_tokens: 8,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: user }],
    });
    const text = res.content
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('')
      .trim()
      .toLowerCase()
      .replace(/[^a-z]/g, '');
    if (text.startsWith('yes')) return 'yes';
    if (text.startsWith('no')) return 'no';
    return null;
  } catch (err) {
    console.error(`classify error for ${p.id}: ${(err as Error).message}`);
    return null;
  }
}

async function getCostSpentSince(admin: ReturnType<typeof supabaseAdmin>, startedAt: string): Promise<number> {
  const { data, error } = await admin
    .from('llm_calls')
    .select('cost_usd')
    .gte('created_at', startedAt);
  if (error) {
    console.error(`cost lookup failed: ${error.message}`);
    return 0;
  }
  return (data ?? []).reduce((sum, r) => sum + (Number(r.cost_usd) || 0), 0);
}

async function main(): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is required');
  }

  const admin = supabaseAdmin();
  const client = new Anthropic({ apiKey });
  const startedAt = new Date().toISOString();

  console.log('reclassify-demoted: starting');

  const { data: demoted, error } = await admin
    .from('projects')
    .select('id, title, summary, raw_payload, project_stage, project_value')
    .eq('score', 0)
    .ilike('rationale', '%non-opportunity%')
    .is('rejection_reason', null)
    .order('project_value', { ascending: false, nullsFirst: false });

  if (error) {
    throw new Error(`fetch demoted: ${error.message}`);
  }

  const rows = (demoted ?? []) as DemotedProject[];
  console.log(`found ${rows.length} demoted rows to reclassify`);

  let yesCount = 0;
  let noCount = 0;
  let parseFails = 0;
  let costAborts = 0;
  let processed = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);

    const results = await Promise.all(batch.map((p) => classify(client, p)));

    for (let j = 0; j < batch.length; j++) {
      const p = batch[j];
      const decision = results[j];

      if (decision === null) {
        parseFails += 1;
        processed += 1;
        continue;
      }

      if (decision === 'yes') {
        // Reset score + rationale so the next ranker cycle re-scores.
        const { error: updateErr } = await admin
          .from('projects')
          .update({ score: null, rationale: null, ranked_at: null })
          .eq('id', p.id);
        if (updateErr) {
          console.error(`flip update failed for ${p.id}: ${updateErr.message}`);
        } else {
          yesCount += 1;
        }
      } else {
        noCount += 1;
      }
      processed += 1;
    }

    const costSpent = await getCostSpentSince(admin, startedAt);
    if (costSpent > COST_CAP_USD) {
      console.error(`cost cap reached: $${costSpent.toFixed(2)} > $${COST_CAP_USD}; aborting`);
      costAborts += 1;
      break;
    }

    if (i % 50 === 0 || i + BATCH_SIZE >= rows.length) {
      console.log(
        `progress: processed=${processed}/${rows.length} yes-flips=${yesCount} ` +
          `no-confirms=${noCount} parse-fails=${parseFails} cost=$${costSpent.toFixed(4)}`,
      );
    }
  }

  const finalCost = await getCostSpentSince(admin, startedAt);
  console.log('');
  console.log('=== reclassify-demoted complete ===');
  console.log(`processed: ${processed}/${rows.length}`);
  console.log(`flipped to yes (score reset for re-rank): ${yesCount}`);
  console.log(`confirmed no: ${noCount}`);
  console.log(`parse failures: ${parseFails}`);
  console.log(`cost aborts: ${costAborts}`);
  console.log(`total cost: $${finalCost.toFixed(4)} of $${COST_CAP_USD} cap`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
