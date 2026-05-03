import { describe, expect, it } from 'vitest';
import {
  binByWeekPerAgent,
  computeKpis,
  filterRuns,
  isoWeekStart,
  listAgentNames,
  recentFailures,
  sinceForWindow,
  type EvalRun,
} from './evalDashboardClient';

const NOW = Date.parse('2026-05-03T18:00:00.000Z');

function run(partial: Partial<EvalRun> & { id: number }): EvalRun {
  return {
    agent_name: 'ranker',
    started_at: '2026-05-03T12:00:00.000Z',
    completed_at: '2026-05-03T12:00:30.000Z',
    status: 'success',
    error_message: null,
    ...partial,
  };
}

describe('sinceForWindow', () => {
  it('returns null for "all"', () => {
    expect(sinceForWindow('all', NOW)).toBeNull();
  });

  it('returns 7d ago for "7d"', () => {
    const out = sinceForWindow('7d', NOW);
    expect(out).toBe(new Date(NOW - 7 * 24 * 60 * 60 * 1000).toISOString());
  });

  it('returns 30d ago for "30d"', () => {
    const out = sinceForWindow('30d', NOW);
    expect(out).toBe(new Date(NOW - 30 * 24 * 60 * 60 * 1000).toISOString());
  });

  it('returns the local midnight for "today"', () => {
    const out = sinceForWindow('today', NOW);
    // We don't assert the exact zone-dependent boundary; just that it parses
    // and is no later than NOW.
    expect(out).toBeTypeOf('string');
    expect(Date.parse(out!)).toBeLessThanOrEqual(NOW);
  });
});

describe('filterRuns', () => {
  const runs: EvalRun[] = [
    run({ id: 1, agent_name: 'ranker', started_at: '2026-05-03T10:00:00Z' }),
    run({ id: 2, agent_name: 'eval', started_at: '2026-04-25T10:00:00Z' }),
    run({ id: 3, agent_name: 'verifier', started_at: '2026-03-01T10:00:00Z' }),
  ];

  it('keeps everything in "all" with no agent filter', () => {
    expect(filterRuns(runs, 'all', null, NOW)).toHaveLength(3);
  });

  it('drops rows older than the 7d window', () => {
    const out = filterRuns(runs, '7d', null, NOW);
    expect(out.map((r) => r.id)).toEqual([1]);
  });

  it('keeps recent rows in 30d but drops the March one', () => {
    const out = filterRuns(runs, '30d', null, NOW);
    expect(out.map((r) => r.id).sort()).toEqual([1, 2]);
  });

  it('filters by agent name when provided', () => {
    const out = filterRuns(runs, 'all', ['eval'], NOW);
    expect(out.map((r) => r.id)).toEqual([2]);
  });
});

describe('computeKpis', () => {
  it('computes pass rate from terminal rows only', () => {
    const runs: EvalRun[] = [
      run({ id: 1, status: 'success' }),
      run({ id: 2, status: 'success' }),
      run({ id: 3, status: 'failed' }),
      run({ id: 4, status: 'running' }),
    ];
    const k = computeKpis(runs);
    expect(k.total).toBe(4);
    expect(k.passed).toBe(2);
    expect(k.failed).toBe(1);
    expect(k.passRate).toBeCloseTo(2 / 3, 5);
  });

  it('returns null pass rate when no terminal runs', () => {
    const runs: EvalRun[] = [run({ id: 1, status: 'running' })];
    expect(computeKpis(runs).passRate).toBeNull();
  });

  it('returns zeros for an empty list', () => {
    expect(computeKpis([])).toEqual({ total: 0, passed: 0, failed: 0, passRate: null });
  });
});

describe('isoWeekStart', () => {
  it('snaps a Wednesday back to the prior Monday', () => {
    // 2026-05-06 is a Wednesday; the Monday is 2026-05-04.
    expect(isoWeekStart('2026-05-06T15:00:00Z')).toBe('2026-05-04');
  });

  it('returns the Monday itself unchanged', () => {
    expect(isoWeekStart('2026-05-04T00:00:00Z')).toBe('2026-05-04');
  });

  it('snaps a Sunday back to the prior Monday', () => {
    // 2026-05-10 Sunday → 2026-05-04 Monday.
    expect(isoWeekStart('2026-05-10T23:59:00Z')).toBe('2026-05-04');
  });
});

describe('binByWeekPerAgent', () => {
  it('groups runs into weekly bins per agent and computes pass rate', () => {
    const runs: EvalRun[] = [
      run({ id: 1, agent_name: 'ranker', started_at: '2026-05-04T10:00:00Z', status: 'success' }),
      run({ id: 2, agent_name: 'ranker', started_at: '2026-05-05T10:00:00Z', status: 'failed' }),
      run({ id: 3, agent_name: 'ranker', started_at: '2026-05-12T10:00:00Z', status: 'success' }),
      run({ id: 4, agent_name: 'eval', started_at: '2026-05-04T10:00:00Z', status: 'success' }),
    ];
    const series = binByWeekPerAgent(runs);
    expect(series).toHaveLength(2);
    const ranker = series.find((s) => s.agentName === 'ranker')!;
    expect(ranker.bins).toHaveLength(2);
    expect(ranker.bins[0]).toMatchObject({ weekStart: '2026-05-04', total: 2, passed: 1, failed: 1 });
    expect(ranker.bins[0].passRate).toBeCloseTo(0.5, 5);
    expect(ranker.bins[1]).toMatchObject({ weekStart: '2026-05-11', total: 1, passed: 1, failed: 0 });
    expect(ranker.bins[1].passRate).toBeCloseTo(1, 5);
    const evalSeries = series.find((s) => s.agentName === 'eval')!;
    expect(evalSeries.bins).toHaveLength(1);
  });

  it('returns null pass rate for bins with only running runs', () => {
    const runs: EvalRun[] = [
      run({ id: 1, agent_name: 'ranker', started_at: '2026-05-04T10:00:00Z', status: 'running' }),
    ];
    const series = binByWeekPerAgent(runs);
    expect(series[0].bins[0].passRate).toBeNull();
    expect(series[0].bins[0].total).toBe(1);
  });

  it('returns an empty array for empty input', () => {
    expect(binByWeekPerAgent([])).toEqual([]);
  });
});

describe('recentFailures', () => {
  it('returns failures newest-first, capped at limit, with trimmed excerpts', () => {
    const runs: EvalRun[] = [
      run({ id: 1, status: 'failed', started_at: '2026-05-01T00:00:00Z', error_message: 'old' }),
      run({ id: 2, status: 'success' }),
      run({
        id: 3,
        status: 'failed',
        started_at: '2026-05-03T00:00:00Z',
        error_message: 'a'.repeat(200),
      }),
    ];
    const out = recentFailures(runs, 5);
    expect(out.map((r) => r.id)).toEqual([3, 1]);
    expect(out[0].errorExcerpt.length).toBe(160);
  });

  it('substitutes a placeholder when error_message is null', () => {
    const runs: EvalRun[] = [
      run({ id: 1, status: 'failed', error_message: null }),
    ];
    expect(recentFailures(runs)[0].errorExcerpt).toBe('(no error message)');
  });
});

describe('listAgentNames', () => {
  it('returns the unique sorted agent names from the dataset', () => {
    const runs: EvalRun[] = [
      run({ id: 1, agent_name: 'verifier' }),
      run({ id: 2, agent_name: 'ranker' }),
      run({ id: 3, agent_name: 'verifier' }),
      run({ id: 4, agent_name: 'eval' }),
    ];
    expect(listAgentNames(runs)).toEqual(['eval', 'ranker', 'verifier']);
  });
});
