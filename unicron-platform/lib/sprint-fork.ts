// lib/sprint-fork.ts — Sprint 5 Stream D
// Multi-fork sprint contract: slime mold pruning made operational.
//
// Usage:
//   const result = await runMultiFork(config, candidates);
//
// ScoringAgent is the canonical interface — Stream B (llm-council.ts) implements it
// via createLLMCouncilScorer(). Import it from here.

import { createClient } from '@supabase/supabase-js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

// ---------------------------------------------------------------------------
// Public types — exported for Stream B and any custom scorer
// ---------------------------------------------------------------------------

export interface ForkCandidate {
  fork_id: string;
  diff_summary: string;
  self_evaluation: string;
  score?: number;
}

export interface ForkScore {
  fork_id: string;
  score: number; // 0–100
  rationale: string;
  rank: number;
}

export type ScoringAgent = {
  score: (candidates: ForkCandidate[]) => Promise<ForkScore[]>;
};

export interface ForkConfig {
  sprint_id: string;
  judge: 'llm-council' | 'hard-metric' | 'custom';
  judge_criteria?: string[];                      // for llm-council
  metric_fn?: (c: ForkCandidate) => number;       // for hard-metric
  custom_scorer?: ScoringAgent;                   // for custom
  n_forks?: number;                               // default 3
  k_winners?: number;                             // default 1
  archive_path?: string;                          // default: vault/Memory/sprint_forks/{sprint_id}/
}

export interface ForkResult {
  sprint_id: string;
  winner_id: string;
  all_candidates: ForkCandidate[];
  scores: ForkScore[];
  archived_loser_paths: string[];
  reinforcement_logged: boolean;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Build a ScoringAgent from config.judge.
 *
 * llm-council: dynamically imports ./agents/llm-council (Stream B); falls back
 * to ordinal scoring if that module is not yet merged.
 */
async function buildScoringAgent(config: ForkConfig): Promise<ScoringAgent> {
  switch (config.judge) {
    case 'llm-council': {
      // Dynamic import so Stream B can be merged independently.
      // TypeScript sees the result as `unknown` — we assert after checking.
      type LLMCouncilModule = {
        createLLMCouncilScorer: (criteria: string[]) => ScoringAgent;
      };

      // Stream B (llm-council.ts) is a separate merge stream — the module may not
      // exist yet. We import by path string at runtime so TypeScript cannot
      // resolve it statically; the .catch(() => null) is the graceful fallback.
      const mod = await import('./agents/llm-council.js').catch(() => null) as LLMCouncilModule | null;

      if (mod?.createLLMCouncilScorer) {
        return mod.createLLMCouncilScorer(config.judge_criteria ?? []);
      }

      // Graceful fallback: ordinal scorer (rank by position in array)
      console.warn(
        '[sprint-fork] llm-council module not found — falling back to ordinal scoring'
      );
      return {
        score: async (candidates) =>
          candidates.map((c, i) => ({
            fork_id: c.fork_id,
            score: Math.round(100 - (i / Math.max(candidates.length - 1, 1)) * 100),
            rationale: 'Ordinal fallback: llm-council module not available',
            rank: i + 1,
          })),
      };
    }

    case 'hard-metric': {
      if (!config.metric_fn) {
        throw new Error('[sprint-fork] judge: hard-metric requires metric_fn');
      }
      const metricFn = config.metric_fn;
      return {
        score: async (candidates) => {
          const scored = candidates
            .map((c) => ({ fork_id: c.fork_id, raw: metricFn(c) }))
            .sort((a, b) => b.raw - a.raw);

          return scored.map((s, i) => ({
            fork_id: s.fork_id,
            score: Math.max(0, Math.min(100, Math.round(s.raw))),
            rationale: `Hard metric value: ${s.raw}`,
            rank: i + 1,
          }));
        },
      };
    }

    case 'custom': {
      if (!config.custom_scorer) {
        throw new Error('[sprint-fork] judge: custom requires custom_scorer');
      }
      return config.custom_scorer;
    }
  }
}

/**
 * Archive a losing candidate's summary to the archive path as markdown.
 * Returns the file path written.
 */
async function archiveLoser(
  archiveRoot: string,
  candidate: ForkCandidate,
  forkScore: ForkScore
): Promise<string> {
  const dir = path.join(archiveRoot, candidate.fork_id);
  await fs.mkdir(dir, { recursive: true });

  const filePath = path.join(dir, 'summary.md');
  const content = [
    `---`,
    `fork_id: ${candidate.fork_id}`,
    `score: ${forkScore.score}`,
    `rank: ${forkScore.rank}`,
    `archived_at: ${new Date().toISOString()}`,
    `---`,
    ``,
    `# Fork ${candidate.fork_id} — Archived (loser)`,
    ``,
    `## Diff Summary`,
    ``,
    candidate.diff_summary,
    ``,
    `## Self-Evaluation`,
    ``,
    candidate.self_evaluation,
    ``,
    `## Judge Score`,
    ``,
    `**Score:** ${forkScore.score}/100`,
    `**Rationale:** ${forkScore.rationale}`,
  ].join('\n');

  await fs.writeFile(filePath, content, 'utf-8');
  return filePath;
}

/**
 * Log the winning candidate's diff_summary as a PATTERN signal in nervous_system.ledger.
 */
async function logReinforcementSignal(
  sprint_id: string,
  winner: ForkCandidate,
  winnerScore: ForkScore
): Promise<boolean> {
  try {
    const supabase = createClient(
      process.env.VITE_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { error } = await supabase.schema('nervous_system').from('ledger').insert({
      signal_type: 'PATTERN',
      source: 'sprint-fork',
      content: winner.diff_summary,
      metadata: {
        sprint_id,
        fork_id: winner.fork_id,
        score: winnerScore.score,
        rationale: winnerScore.rationale,
        self_evaluation: winner.self_evaluation,
      },
    });

    if (error) {
      console.error('[sprint-fork] reinforcement signal write failed:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[sprint-fork] reinforcement signal write threw:', err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Run the multi-fork sprint contract.
 *
 * Callers pre-build each ForkCandidate in its own git worktree, then pass the
 * array here. runMultiFork scores them, keeps top K winners, archives losers,
 * and reinforcement-logs the winner pattern.
 *
 * @param config     - Fork configuration including judge, k_winners, archive path
 * @param candidates - Pre-built candidates (each ran in its own worktree)
 */
export async function runMultiFork(
  config: ForkConfig,
  candidates: ForkCandidate[]
): Promise<ForkResult> {
  const nForks = config.n_forks ?? 3;
  const kWinners = config.k_winners ?? 1;
  const archiveRoot =
    config.archive_path ?? `vault/Memory/sprint_forks/${config.sprint_id}`;

  // Validate candidate count
  if (candidates.length !== nForks) {
    console.warn(
      `[sprint-fork] Expected ${nForks} candidates but received ${candidates.length}. Continuing.`
    );
  }

  if (candidates.length === 0) {
    throw new Error('[sprint-fork] No candidates provided — cannot score.');
  }

  // Score
  const scorer = await buildScoringAgent(config);
  const rawScores = await scorer.score(candidates);

  // Assign ranks if scorer didn't set them (sort by score desc, then re-rank)
  const scores: ForkScore[] = [...rawScores]
    .sort((a, b) => b.score - a.score)
    .map((s, i) => ({ ...s, rank: i + 1 }));

  // Identify winners and losers
  const winnerIds = new Set(scores.slice(0, kWinners).map((s) => s.fork_id));
  const winnerScore = scores.find((s) => s.rank === 1)!;
  const winner = candidates.find((c) => c.fork_id === winnerScore.fork_id)!;

  // Archive losers
  const loserCandidates = candidates.filter((c) => !winnerIds.has(c.fork_id));
  const archivedPaths: string[] = [];

  for (const loser of loserCandidates) {
    const loserScore = scores.find((s) => s.fork_id === loser.fork_id);
    if (!loserScore) continue;
    try {
      const filePath = await archiveLoser(archiveRoot, loser, loserScore);
      archivedPaths.push(filePath);
    } catch (err) {
      console.error(`[sprint-fork] Failed to archive loser ${loser.fork_id}:`, err);
    }
  }

  // Reinforcement signal
  const reinforcement_logged = await logReinforcementSignal(
    config.sprint_id,
    winner,
    winnerScore
  );

  return {
    sprint_id: config.sprint_id,
    winner_id: winner.fork_id,
    all_candidates: candidates,
    scores,
    archived_loser_paths: archivedPaths,
    reinforcement_logged,
  };
}
