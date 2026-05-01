import { describe, expect, it } from 'vitest';
import { dotColorFor, formatRowText, formatTimestamp, type AgentLogRow } from './activity';

describe('formatTimestamp', () => {
  const NOW = new Date('2026-05-01T12:00:00Z').getTime();

  it('formats sub-minute deltas in seconds', () => {
    const ts = new Date(NOW - 12_000).toISOString();
    expect(formatTimestamp(ts, NOW)).toBe('12s ago');
  });

  it('formats minute-scale deltas in minutes', () => {
    const ts = new Date(NOW - 5 * 60_000).toISOString();
    expect(formatTimestamp(ts, NOW)).toBe('5m ago');
  });

  it('formats hour-scale deltas in hours', () => {
    const ts = new Date(NOW - 3 * 3600_000).toISOString();
    expect(formatTimestamp(ts, NOW)).toBe('3h ago');
  });

  it('formats day-scale deltas in days', () => {
    const ts = new Date(NOW - 2 * 86_400_000).toISOString();
    expect(formatTimestamp(ts, NOW)).toBe('2d ago');
  });

  it('returns em dash for invalid input', () => {
    expect(formatTimestamp('not-a-date', NOW)).toBe('—');
  });
});

describe('dotColorFor', () => {
  it('maps known agent names to expected dot colors', () => {
    expect(dotColorFor('ingestor')).toBe('cyan');
    expect(dotColorFor('ranker')).toBe('gold');
    expect(dotColorFor('verifier')).toBe('magenta');
    expect(dotColorFor('briefing')).toBe('white');
    expect(dotColorFor('pulse')).toBe('violet');
  });

  it('falls back to white for unknown agent names', () => {
    expect(dotColorFor('mystery-agent')).toBe('white');
  });
});

describe('formatRowText', () => {
  const base: AgentLogRow = {
    id: 1,
    agent_name: 'ingestor',
    event_type: 'new_event',
    event_data: {},
    latency_ms: null,
    model_used: null,
    ts: '2026-05-01T12:00:00Z',
  };

  it('returns "agent · event" when no detail is present', () => {
    expect(formatRowText(base)).toBe('ingestor · new_event');
  });

  it('appends event_data.detail when present', () => {
    const row = { ...base, event_data: { detail: 'Sacramento County permit' } };
    expect(formatRowText(row)).toBe('ingestor · new_event · Sacramento County permit');
  });

  it('falls back to event_data.message when detail is absent', () => {
    const row = { ...base, event_data: { message: 'inserted 4 rows' } };
    expect(formatRowText(row)).toBe('ingestor · new_event · inserted 4 rows');
  });

  it('falls back to event_data.summary when detail and message are absent', () => {
    const row = { ...base, event_data: { summary: 'qualified $4.2M project' } };
    expect(formatRowText(row)).toBe('ingestor · new_event · qualified $4.2M project');
  });
});
