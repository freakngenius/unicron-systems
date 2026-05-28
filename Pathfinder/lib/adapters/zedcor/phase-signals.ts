// lib/adapters/zedcor/phase-signals.ts
//
// Sprint Z3 — bid-lifecycle phase inference from HTML/text of opportunity
// detail pages. Deterministic regex/keyword library shared by all Zedcor
// Houston adapters during detail-page enrichment.
//
// Spec: Specs/SPEC-zedcor-z3-parser-phase-fix.md §"Phase signals to look for".
//
// Usage from an adapter:
//   import { inferPhaseFromText } from '@/lib/adapters/zedcor/phase-signals';
//   const inf = inferPhaseFromText(detailHtml);
//   if (inf.confidence > existing.confidence) {
//     applyPhase(opp, inf.phase, inf.confidence, inf.signals);
//   }
//
// The taxonomy mirrors pathfinder.projects.project_stage values:
//   pre_budget · solicitation · awarded · gc_selected · sub_bid ·
//   mobilization · subs_selected · unknown
//
// buy_window_open = true for awarded/gc_selected/sub_bid/mobilization
// (subject to posted_date aging — applied by the caller, not here).

export type BidLifecyclePhase =
  | 'pre_budget'
  | 'solicitation'
  | 'awarded'
  | 'gc_selected'
  | 'sub_bid'
  | 'mobilization'
  | 'subs_selected'
  | 'unknown';

export interface PhaseSignalHit {
  phase: BidLifecyclePhase;
  /** verbatim text fragment that matched — used as evidence in PR */
  text: string;
  weight: number;
}

export interface PhaseInference {
  phase: BidLifecyclePhase;
  confidence: number;     // 0.0–1.0
  signals: PhaseSignalHit[];
  buy_window_open: boolean;
}

// Phase ordering (lower index = earlier stage). Used for "take the latest
// stage when signals conflict" tie-break per the SPEC.
const PHASE_ORDER: Record<BidLifecyclePhase, number> = {
  pre_budget: 0,
  solicitation: 1,
  awarded: 2,
  gc_selected: 2,
  sub_bid: 3,
  mobilization: 4,
  subs_selected: 5,
  unknown: -1,
};

// Patterns by phase. Each pattern carries a per-match confidence weight; the
// final inference takes the max-weight winner per phase, then the latest-stage
// across phases (tie-break by weight).
interface SignalPattern {
  rx: RegExp;
  weight: number;
}

const SIGNALS: Record<Exclude<BidLifecyclePhase, 'unknown'>, SignalPattern[]> = {
  pre_budget: [
    { rx: /\b(capital\s+improvement\s+plan|five[-\s]year\s+(capital|cip)|fy\s*20\d{2}\s+cip)\b/i, weight: 0.6 },
    { rx: /\b(planned|proposed|under\s+study|feasibility\s+study)\b/i, weight: 0.4 },
  ],
  solicitation: [
    { rx: /\b(request\s+for\s+proposal|request\s+for\s+qualification|invitation\s+for\s+bids?|invitation\s+to\s+bid)\b/i, weight: 0.7 },
    { rx: /\b(bid\s+opening|pre[-\s]bid\s+conference|pre[-\s]proposal\s+conference)\b/i, weight: 0.7 },
    { rx: /\b(rfp|rfq|ifb|itb)[-\s#:]?\d/i, weight: 0.6 },
    { rx: /\b(currently\s+(?:soliciting|accepting\s+bids))\b/i, weight: 0.7 },
    { rx: /\b(open\s+for\s+(?:bid|response|proposal))\b/i, weight: 0.65 },
  ],
  awarded: [
    { rx: /\b(notice\s+of\s+award|intent\s+to\s+award|recommendation\s+to\s+award)\b/i, weight: 0.95 },
    { rx: /\b(contract\s+(?:awarded|award\s+notice))\b/i, weight: 0.9 },
    { rx: /\b(awarded\s+(?:to|on)\s+[A-Z])/i, weight: 0.85 },
    { rx: /\b(selected\s+(?:contractor|vendor|firm))\b/i, weight: 0.9 },
    { rx: /\baward\s+date[:\s]+\d/i, weight: 0.8 },
  ],
  gc_selected: [
    { rx: /\b(prime\s+contractor\s*[:\-]|general\s+contractor\s*[:\-]|gc\s*[:\-])\s*[A-Z]/i, weight: 0.95 },
    { rx: /\b(prime\s+contractor|general\s+contractor)\s+(?:is|has\s+been|named|selected)\b/i, weight: 0.9 },
    { rx: /\b(contracted\s+to|construction\s+manager\s+at\s+risk\s+(?:is|named))\b/i, weight: 0.85 },
    { rx: /\bCMAR\s*[:\-]\s*[A-Z]/i, weight: 0.85 },
  ],
  sub_bid: [
    { rx: /\b(sub(?:contractor)?\s+bid\s+(?:solicitation|invitation|request))\b/i, weight: 0.95 },
    { rx: /\b(trade\s+bid\s+(?:request|solicitation|package))\b/i, weight: 0.9 },
    { rx: /\b(sub[-\s]bid\s+invitation|invitation\s+to\s+sub(?:contractors)?)\b/i, weight: 0.95 },
    { rx: /\b(trades?\s+(?:required|requested)[:\s])/i, weight: 0.7 },
    { rx: /\b(security|fencing|surveillance|site\s+services)\s+sub(?:contractor)?s?\s+(?:requested|invited|needed)\b/i, weight: 0.95 },
    { rx: /\b(bid\s+package\s+#?\d)/i, weight: 0.65 },
  ],
  mobilization: [
    { rx: /\b(notice\s+to\s+proceed|ntp\s+issued|ntp\s+date)\b/i, weight: 0.95 },
    { rx: /\b(construction\s+start|site\s+mobilization|mobilization\s+date)\b/i, weight: 0.85 },
    { rx: /\b(pre[-\s]construction\s+conference\s+(?:complete|held|completed))\b/i, weight: 0.85 },
    { rx: /\b(ground\s*breaking|broke\s+ground|groundbreaking\s+(?:on|date))\b/i, weight: 0.85 },
    { rx: /\b(construction\s+(?:has\s+begun|underway|started))\b/i, weight: 0.8 },
  ],
  subs_selected: [
    { rx: /\b(all\s+sub(?:contractor)?s?\s+selected|subs?\s+chosen|subcontract\s+awards?\s+(?:complete|finalized))\b/i, weight: 0.9 },
    { rx: /\b(security\s+(?:vendor|sub)\s+(?:selected|chosen))\b/i, weight: 0.9 },
  ],
};

/**
 * Infer bid-lifecycle phase from text (typically opportunity detail-page HTML
 * stripped to text or a structured listing summary). Deterministic — no LLM.
 *
 * Resolution rule:
 *   1. Collect all matching signals.
 *   2. Group by phase; per-phase confidence = max(weight) of its matches.
 *   3. Winner = phase with the LATEST PHASE_ORDER (per SPEC: "if multiple
 *      signals conflict, take the LATEST-stage signal").
 *   4. Tie-break on PHASE_ORDER by max-weight signal.
 *
 * If no signals match, returns phase='solicitation', confidence=0.5 (the
 * default initial tag from the listing page, per SPEC).
 */
export function inferPhaseFromText(text: string | null | undefined): PhaseInference {
  const safe = (text ?? '').slice(0, 50_000); // cap to keep regex bounded
  const signals: PhaseSignalHit[] = [];

  for (const phase of Object.keys(SIGNALS) as Array<Exclude<BidLifecyclePhase, 'unknown'>>) {
    for (const { rx, weight } of SIGNALS[phase]) {
      const m = safe.match(rx);
      if (m) {
        signals.push({
          phase,
          text: m[0].slice(0, 200),
          weight,
        });
      }
    }
  }

  if (signals.length === 0) {
    return {
      phase: 'solicitation',
      confidence: 0.5,
      signals: [],
      buy_window_open: false,
    };
  }

  // Group by phase, take max weight per phase.
  const byPhase = new Map<BidLifecyclePhase, { weight: number; hits: PhaseSignalHit[] }>();
  for (const hit of signals) {
    const cur = byPhase.get(hit.phase) ?? { weight: 0, hits: [] };
    cur.hits.push(hit);
    cur.weight = Math.max(cur.weight, hit.weight);
    byPhase.set(hit.phase, cur);
  }

  // Winner = LATEST PHASE_ORDER, with weight tiebreak.
  let winner: { phase: BidLifecyclePhase; weight: number; hits: PhaseSignalHit[] } = {
    phase: 'solicitation',
    weight: 0.5,
    hits: [],
  };
  for (const [phase, entry] of byPhase.entries()) {
    const w = PHASE_ORDER[phase];
    const wWinner = PHASE_ORDER[winner.phase];
    if (w > wWinner || (w === wWinner && entry.weight > winner.weight)) {
      winner = { phase, weight: entry.weight, hits: entry.hits };
    }
  }

  return {
    phase: winner.phase,
    confidence: winner.weight,
    signals: winner.hits,
    buy_window_open: isBuyWindowOpen(winner.phase),
  };
}

/** Buy-window-open phases (ignoring posted_date aging — caller applies that). */
export function isBuyWindowOpen(phase: BidLifecyclePhase): boolean {
  return phase === 'awarded'
    || phase === 'gc_selected'
    || phase === 'sub_bid'
    || phase === 'mobilization';
}

/**
 * Aging rule per SPEC: buy_window_open=true rows automatically downgrade
 * to false when posted_date is older than the per-phase ceiling.
 *   - awarded / gc_selected / sub_bid: 60 days
 *   - mobilization:                    30 days
 */
export function applyBuyWindowAging(
  phase: BidLifecyclePhase,
  postedDate: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!isBuyWindowOpen(phase)) return false;
  if (!postedDate) return true; // unknown posted_date — admit, defer to verifier
  const t = new Date(postedDate).getTime();
  if (!Number.isFinite(t)) return true;
  const ageDays = (now.getTime() - t) / (1000 * 60 * 60 * 24);
  const ceiling = phase === 'mobilization' ? 30 : 60;
  return ageDays <= ceiling;
}
