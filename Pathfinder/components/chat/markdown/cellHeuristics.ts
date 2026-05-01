// Cell-content heuristics for the chat markdown renderer.
//
// Markdown alone tells us a cell's text but not its semantic type. The
// renderer infers the cell type from the column header and applies the
// matching formatter. The detection is deliberately tolerant — column
// headers come from agent output, so they vary in capitalization and
// punctuation.

export type CellKind =
  | 'score'
  | 'currency'
  | 'stage'
  | 'distance'
  | 'id'
  | 'title'
  | 'plain';

const SCORE_HEADERS = ['score', 'rank', 'priority'];
const CURRENCY_HEADERS = ['value', 'amount', 'budget', 'price', 'cost', 'revenue'];
const STAGE_HEADERS = ['stage', 'status', 'phase'];
const DISTANCE_HEADERS = ['distance', 'miles', 'km'];
const ID_HEADERS = ['project', 'project id', 'id', 'ref', 'lead id'];
const TITLE_HEADERS = ['title', 'name', 'project name', 'description'];

function norm(header: string): string {
  return header.trim().toLowerCase().replace(/[_·.:]+/g, ' ').replace(/\s+/g, ' ');
}

export function detectCellKind(header: string, sampleCell?: string): CellKind {
  const h = norm(header);
  if (SCORE_HEADERS.some((k) => h === k || h.startsWith(`${k} `) || h.endsWith(` ${k}`))) {
    return 'score';
  }
  if (
    CURRENCY_HEADERS.some((k) => h.includes(k)) ||
    (sampleCell !== undefined && /^\$\s?\d/.test(sampleCell.trim()))
  ) {
    return 'currency';
  }
  if (STAGE_HEADERS.some((k) => h === k || h.endsWith(` ${k}`))) return 'stage';
  if (DISTANCE_HEADERS.some((k) => h.includes(k))) return 'distance';
  if (ID_HEADERS.some((k) => h === k)) return 'id';
  if (TITLE_HEADERS.some((k) => h === k || h.endsWith(` ${k}`))) return 'title';
  return 'plain';
}

// ── Score ─────────────────────────────────────────────────────────────────
//
// Numeric score 0..100. Tone reflects the threshold — 90+ is a green pill,
// 80-89 amber, anything below red. Non-numeric input falls through unchanged
// so the renderer can em-dash empty cells.

export type ScoreTone = 'green' | 'amber' | 'red';

export function parseScore(s: string): number | null {
  const trimmed = s.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return null;
  return n;
}

export function scoreToneFor(score: number): ScoreTone {
  if (score >= 90) return 'green';
  if (score >= 80) return 'amber';
  return 'red';
}

// ── Currency ─────────────────────────────────────────────────────────────
//
// Accepts inputs the agents produce: "$4.2M", "$880K", "4200000", "$12,400".
// Falls back to the raw string when the input doesn't parse — better to
// surface what the agent said than to hide an unrecognised format.

export function formatCurrency(s: string): string {
  const trimmed = s.trim();
  if (!trimmed || trimmed === '—' || trimmed === '-') return '—';

  // Already formatted shorthand — pass through unchanged so a "$4.2M" stays
  // "$4.2M" rather than getting lossily reparsed.
  if (/^\$?\s?\d+(\.\d+)?\s?[KMB]$/i.test(trimmed)) {
    return trimmed.startsWith('$') ? trimmed : `$${trimmed}`;
  }

  const cleaned = trimmed.replace(/[$,]/g, '');
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return trimmed;

  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

// ── Stage ────────────────────────────────────────────────────────────────
//
// Stages are short uppercase tokens: RFP, PRE, AWARDED, DRAFT, IN_REVIEW.
// Each gets a tone so the badge reads at a glance.

export type StageTone = 'neutral' | 'progress' | 'won' | 'soft';

const STAGE_TONE: Record<string, StageTone> = {
  RFP: 'progress',
  PRE: 'soft',
  AWARDED: 'won',
  DRAFT: 'neutral',
  IN_REVIEW: 'progress',
  CLOSED: 'neutral',
  WON: 'won',
  LOST: 'neutral',
};

export function stageToneFor(stage: string): StageTone {
  const key = stage.trim().toUpperCase().replace(/\s+/g, '_');
  return STAGE_TONE[key] ?? 'neutral';
}

// ── Distance ─────────────────────────────────────────────────────────────
//
// Distances arrive as "6.2 mi", "12.4 km", or bare "9.8". Bare numbers
// inherit "mi" by default since Pathfinder is US/Canada-centric. The
// renderer right-aligns the cell and dims the unit suffix.

export type DistanceParts = { value: string; unit: string };

export function splitDistance(s: string): DistanceParts {
  const trimmed = s.trim();
  if (!trimmed || trimmed === '—' || trimmed === '-') return { value: '—', unit: '' };
  const m = trimmed.match(/^([\d,]+\.?\d*)\s*([a-zA-Z]+)?$/);
  if (!m) return { value: trimmed, unit: '' };
  const unit = (m[2] || 'mi').toLowerCase();
  return { value: m[1], unit };
}
