// __tests__/architect/tuning-tools.test.ts — Phase 2 Stream D Gate D2.
// Spec: SPEC - Architect Agent.md §4.

import { describe, expect, it } from 'vitest';
import {
  analyzeRejectionPatternsTool,
  draftPromptRevisionTool,
  runShadowTestTool,
} from '@/services/architect/tools/tuning';

async function call(tool: { handler: (i: Record<string, unknown>) => unknown | Promise<unknown> }, input: Record<string, unknown>) {
  return await tool.handler(input);
}

const negFeedback = (n: number, reason: string, agents: string[]) =>
  Array.from({ length: n }, (_, i) => ({
    kind: 'lead_action.dismiss',
    polarity: 'negative',
    project_id: `p${i}`,
    reason,
    ts: '2026-04-26T10:00:00Z',
    pipeline_trace: agents,
    source_table: 'lead_actions',
    source_id: i,
  }));

describe('analyzeRejectionPatterns', () => {
  it('clusters by normalized reason and intersects pipeline_trace', async () => {
    const feedback = negFeedback(4, 'wrong geography — outside coverage', ['geo-mapper', 'ranker']);
    const out = (await call(analyzeRejectionPatternsTool, { feedback })) as {
      cluster_count: number;
      clusters: { count: number; responsible_agents: string[] }[];
    };
    expect(out.cluster_count).toBe(1);
    expect(out.clusters[0].count).toBe(4);
    expect(out.clusters[0].responsible_agents).toEqual(['geo-mapper', 'ranker']);
  });

  it('drops clusters below the 3-min size gate', async () => {
    const feedback = negFeedback(2, 'too small', ['ranker']);
    const out = (await call(analyzeRejectionPatternsTool, { feedback })) as {
      cluster_count: number;
      dropped_below_threshold: number;
    };
    expect(out.cluster_count).toBe(0);
    expect(out.dropped_below_threshold).toBe(1);
  });

  it('ignores positive-polarity feedback', async () => {
    const positives = negFeedback(5, 'great signal', ['qualifier']).map((f) => ({
      ...f,
      polarity: 'positive',
    }));
    const out = (await call(analyzeRejectionPatternsTool, { feedback: positives })) as {
      cluster_count: number;
      total_negative: number;
    };
    expect(out.cluster_count).toBe(0);
    expect(out.total_negative).toBe(0);
  });

  it('ignores neutral-polarity feedback (snooze, light_edit)', async () => {
    const neutrals = negFeedback(5, 'eh', ['ranker']).map((f) => ({
      ...f,
      polarity: 'neutral',
    }));
    const out = (await call(analyzeRejectionPatternsTool, { feedback: neutrals })) as {
      total_negative: number;
    };
    expect(out.total_negative).toBe(0);
  });

  it('respects custom min_cluster_size', async () => {
    const feedback = negFeedback(2, 'wrong-geo', ['geo-mapper']);
    const out = (await call(analyzeRejectionPatternsTool, {
      feedback,
      min_cluster_size: 2,
    })) as { cluster_count: number };
    expect(out.cluster_count).toBe(1);
  });

  it('handles mixed clusters and ranks by count desc', async () => {
    const feedback = [
      ...negFeedback(5, 'wrong geography — Florida vs Texas', ['geo-mapper']),
      ...negFeedback(3, 'too small project', ['ranker']),
    ];
    const out = (await call(analyzeRejectionPatternsTool, { feedback })) as {
      clusters: { count: number }[];
    };
    expect(out.clusters[0].count).toBeGreaterThanOrEqual(out.clusters[1].count);
  });
});

describe('draftPromptRevision', () => {
  it('rejects too-short proposal', async () => {
    const out = (await call(draftPromptRevisionTool, {
      role: 'qualifier',
      current_instruction: 'old',
      proposed_instruction: 'short',
      rationale: 'because',
    })) as { ok: boolean };
    expect(out.ok).toBe(false);
  });

  it('rejects unchanged proposal', async () => {
    const same = 'a'.repeat(40);
    const out = (await call(draftPromptRevisionTool, {
      role: 'qualifier',
      current_instruction: same,
      proposed_instruction: same,
      rationale: 'because',
    })) as { ok: boolean; error?: string };
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/no change/);
  });

  it('accepts a substantive revision', async () => {
    const out = (await call(draftPromptRevisionTool, {
      role: 'qualifier',
      current_instruction: 'Score the project for relevance.',
      proposed_instruction:
        'Score the project for relevance, demoting any project tagged as renewal or already-customer.',
      rationale: 'cluster: renewal-not-new x 4',
    })) as { ok: boolean };
    expect(out.ok).toBe(true);
  });
});

describe('runShadowTest', () => {
  it('flags meets_propose_bar=true when win_rate>0.5 and side_effect_rate<0.1', async () => {
    const out = (await call(runShadowTestTool, {
      role: 'qualifier',
      cluster_key: 'wrong-geo',
      sample_size: 10,
      estimated_wins: 8,
      estimated_losses: 2,
      estimated_side_effects: 0,
      reasoning: 'the new prompt explicitly checks coverage radius',
    })) as { meets_propose_bar: boolean; win_rate: number };
    expect(out.win_rate).toBe(0.8);
    expect(out.meets_propose_bar).toBe(true);
  });

  it('flags meets_propose_bar=false when too many side effects', async () => {
    const out = (await call(runShadowTestTool, {
      role: 'qualifier',
      cluster_key: 'wrong-geo',
      sample_size: 10,
      estimated_wins: 8,
      estimated_losses: 2,
      estimated_side_effects: 3,
      reasoning: '',
    })) as { meets_propose_bar: boolean; side_effect_rate: number };
    expect(out.side_effect_rate).toBeGreaterThanOrEqual(0.1);
    expect(out.meets_propose_bar).toBe(false);
  });

  it('flags meets_propose_bar=false when win_rate too low', async () => {
    const out = (await call(runShadowTestTool, {
      role: 'qualifier',
      cluster_key: 'wrong-geo',
      sample_size: 10,
      estimated_wins: 4,
      estimated_losses: 6,
      estimated_side_effects: 0,
      reasoning: '',
    })) as { meets_propose_bar: boolean };
    expect(out.meets_propose_bar).toBe(false);
  });
});
