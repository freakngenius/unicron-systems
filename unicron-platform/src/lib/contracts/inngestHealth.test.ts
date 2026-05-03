import { describe, it, expect } from 'vitest';
import {
  deriveInngestRollup,
  type InngestHealthPayload,
} from './inngestHealth';

const NOW = new Date('2026-05-03T12:00:00.000Z');
const HOUR = 60 * 60 * 1000;

function iso(offsetMs: number): string {
  return new Date(NOW.getTime() + offsetMs).toISOString();
}

function payload(over: Partial<InngestHealthPayload>): InngestHealthPayload {
  return {
    generated_at: NOW.toISOString(),
    functions: [],
    recent_runs: [],
    schedules: [],
    ...over,
  };
}

describe('deriveInngestRollup', () => {
  it('returns empty rollup when payload is empty', () => {
    const r = deriveInngestRollup(payload({}), NOW);
    expect(r.totals.functions).toBe(0);
    expect(r.byFunction).toEqual([]);
    expect(r.configured).toBe(false);
  });

  it('marks function red when 24h failure rate exceeds 50%', () => {
    const r = deriveInngestRollup(
      payload({
        functions: [
          { id: 'fn-a', name: 'A', cron: null, cron_cadence: null },
        ],
        recent_runs: [
          { run_id: '1', function_id: 'fn-a', status: 'failed', started_at: iso(-1 * HOUR), ended_at: iso(-1 * HOUR) },
          { run_id: '2', function_id: 'fn-a', status: 'failed', started_at: iso(-2 * HOUR), ended_at: iso(-2 * HOUR) },
          { run_id: '3', function_id: 'fn-a', status: 'completed', started_at: iso(-3 * HOUR), ended_at: iso(-3 * HOUR) },
        ],
      }),
      NOW,
    );
    expect(r.byFunction[0].tone).toBe('red');
    expect(r.byFunction[0].failure_rate_24h).toBeCloseTo(2 / 3, 3);
    expect(r.byFunction[0].total_runs_24h).toBe(3);
    expect(r.totals.failed_24h).toBe(2);
  });

  it('marks hourly cron yellow when last success >24h ago', () => {
    const r = deriveInngestRollup(
      payload({
        functions: [
          { id: 'fn-h', name: 'Hourly', cron: '0 * * * *', cron_cadence: 'hourly' },
        ],
        recent_runs: [
          {
            run_id: '1',
            function_id: 'fn-h',
            status: 'completed',
            started_at: iso(-25 * HOUR),
            ended_at: iso(-25 * HOUR),
          },
        ],
      }),
      NOW,
    );
    expect(r.byFunction[0].tone).toBe('yellow');
    expect(r.byFunction[0].last_success_at).not.toBeNull();
  });

  it('marks healthy hourly cron green when last success is recent', () => {
    const r = deriveInngestRollup(
      payload({
        functions: [
          { id: 'fn-h', name: 'Hourly', cron: '0 * * * *', cron_cadence: 'hourly' },
        ],
        recent_runs: [
          {
            run_id: '1',
            function_id: 'fn-h',
            status: 'completed',
            started_at: iso(-30 * 60 * 1000), // 30 minutes ago
            ended_at: iso(-30 * 60 * 1000),
          },
        ],
      }),
      NOW,
    );
    expect(r.byFunction[0].tone).toBe('green');
  });

  it('marks unknown when no runs and no successes recorded', () => {
    const r = deriveInngestRollup(
      payload({
        functions: [
          { id: 'fn-x', name: 'X', cron: null, cron_cadence: null },
        ],
      }),
      NOW,
    );
    expect(r.byFunction[0].tone).toBe('unknown');
  });

  it('attaches next_run_at from schedules', () => {
    const r = deriveInngestRollup(
      payload({
        functions: [
          { id: 'fn-h', name: 'Hourly', cron: '0 * * * *', cron_cadence: 'hourly' },
        ],
        schedules: [{ function_id: 'fn-h', next_run_at: iso(15 * 60 * 1000) }],
        recent_runs: [
          {
            run_id: '1',
            function_id: 'fn-h',
            status: 'completed',
            started_at: iso(-30 * 60 * 1000),
            ended_at: iso(-30 * 60 * 1000),
          },
        ],
      }),
      NOW,
    );
    expect(r.byFunction[0].next_run_at).toBe(iso(15 * 60 * 1000));
  });

  it('only counts runs in the last 24h for the rate, but tracks all-time last_failure_at', () => {
    const r = deriveInngestRollup(
      payload({
        functions: [
          { id: 'fn-a', name: 'A', cron: null, cron_cadence: null },
        ],
        recent_runs: [
          { run_id: 'old', function_id: 'fn-a', status: 'failed', started_at: iso(-72 * HOUR), ended_at: iso(-72 * HOUR) },
          { run_id: 'recent-ok', function_id: 'fn-a', status: 'completed', started_at: iso(-1 * HOUR), ended_at: iso(-1 * HOUR) },
        ],
      }),
      NOW,
    );
    expect(r.byFunction[0].total_runs_24h).toBe(1);
    expect(r.byFunction[0].failure_rate_24h).toBe(0);
    expect(r.byFunction[0].last_failure_at).toBe(iso(-72 * HOUR));
    expect(r.byFunction[0].tone).toBe('green');
  });
});
