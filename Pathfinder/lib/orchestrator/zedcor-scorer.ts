// lib/orchestrator/zedcor-scorer.ts
//
// Sprint Z1A — deterministic, Anthropic-free scorer for the Zedcor
// Houston manual orchestrator. The existing org-aware ranker
// (lib/agents/ranker/genericScorer.ts + Zedcor's lib/scoring.ts) is
// out of Z1A scope — wiring through the architecture machinery is a
// follow-up. Z1A ships a small, honest, deterministic score so the
// orchestrator chain works end-to-end today.
//
// Z17: the prior `anthropicEnabled()` gate was wrong — none of the
// arithmetic below calls Anthropic, so returning
// { score: null, rationale: '(scoring disabled)' } when
// ZEDCOR_DISABLE_ANTHROPIC=true (or ANTHROPIC_API_KEY absent) was a
// trap: the orchestrator then wrote bare rows to Notion where the
// Notion writer (lib/notion/zedcor-writer.ts) surfaced "(scoring
// disabled)" in the Rationale property. The scorer now always
// computes its deterministic 0..100 score; a future Anthropic-backed
// rationale upgrade lands as a separate stage if/when it ships.
//
// Score components (caps at 100):
//   - 50 baseline
//   - +20 if response_deadline within next 30 days
//   - +15 if city/county is in Greater Houston (Harris/Fort Bend/Galveston/Brazoria/Montgomery)
//   - +10 if estimated_value within Zedcor sweet-spot ($75k – $2M)
//   - -10 if estimated_value above $5M (likely prime contractor only) or below $25k

const HOUSTON_COUNTIES: ReadonlySet<string> = new Set([
  'Harris County', 'Fort Bend County', 'Galveston County',
  'Brazoria County', 'Montgomery County',
]);

export interface ZedcorScoreInput {
  response_deadline?: string | null;
  estimated_value?: number | null;
  county?: string | null;
  agency?: string | null;
}

export interface ZedcorScoreResult {
  score: number | null;
  rationale: string;
}

function daysUntil(dateISO: string | null | undefined): number | null {
  if (!dateISO) return null;
  const t = new Date(dateISO).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.ceil((t - Date.now()) / 86_400_000);
}

export function scoreZedcorProject(input: ZedcorScoreInput): ZedcorScoreResult {
  let score = 50;
  const reasons: string[] = [];

  const days = daysUntil(input.response_deadline ?? null);
  if (days !== null && days >= 0 && days <= 30) {
    score += 20;
    reasons.push(`deadline ${days}d out`);
  }

  if (input.county && HOUSTON_COUNTIES.has(input.county)) {
    score += 15;
    reasons.push(`${input.county} (in-network)`);
  }

  const v = input.estimated_value ?? null;
  if (v !== null && v >= 75_000 && v <= 2_000_000) {
    score += 10;
    reasons.push(`$${Math.round(v).toLocaleString()} fits sweet spot`);
  } else if (v !== null && v > 5_000_000) {
    score -= 10;
    reasons.push(`$${Math.round(v).toLocaleString()} above prime threshold`);
  } else if (v !== null && v < 25_000) {
    score -= 10;
    reasons.push(`$${Math.round(v).toLocaleString()} below minimum spend`);
  }

  score = Math.max(0, Math.min(100, score));

  const agency = input.agency ? `${input.agency}: ` : '';
  const rationale = reasons.length > 0
    ? `${agency}${reasons.join(', ')}.`
    : `${agency}baseline score; no strong signal in deadline / location / value.`;

  return { score, rationale };
}
