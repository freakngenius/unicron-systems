// tests/connectors/slack-commands.test.ts — pure parser tests for
// /pathfinder slash-command text. No network, no DB.

import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  supabase: {},
  supabaseAdmin: () => ({}),
}));

import { parseCommand } from '@/lib/connectors/slack/commands';

describe('parseCommand', () => {
  it('returns help for empty / whitespace input', () => {
    expect(parseCommand('').kind).toBe('help');
    expect(parseCommand('   ').kind).toBe('help');
    expect(parseCommand(null).kind).toBe('help');
  });

  it('returns help for explicit "help" / "?" verbs', () => {
    expect(parseCommand('help').kind).toBe('help');
    expect(parseCommand('?').kind).toBe('help');
    expect(parseCommand('Help').kind).toBe('help');
  });

  it('parses leads with default limit', () => {
    const out = parseCommand('leads');
    expect(out).toEqual({ kind: 'leads', limit: 5 });
  });

  it('parses leads with explicit limit', () => {
    const out = parseCommand('leads 12');
    expect(out).toEqual({ kind: 'leads', limit: 12 });
  });

  it('clamps the leads limit to MAX_LEADS_LIMIT (25)', () => {
    expect(parseCommand('leads 9999')).toEqual({ kind: 'leads', limit: 25 });
  });

  it('falls back to default limit on invalid number', () => {
    expect(parseCommand('leads abc')).toEqual({ kind: 'leads', limit: 5 });
    expect(parseCommand('leads -3')).toEqual({ kind: 'leads', limit: 5 });
    expect(parseCommand('leads 0')).toEqual({ kind: 'leads', limit: 5 });
  });

  it('parses rejected', () => {
    expect(parseCommand('rejected').kind).toBe('rejected');
    expect(parseCommand('Rejected').kind).toBe('rejected');
  });

  it('parses feedback up with no reason', () => {
    expect(parseCommand('feedback p123 up')).toEqual({
      kind: 'feedback',
      projectId: 'p123',
      thumb: 'up',
      reason: null,
    });
  });

  it('parses feedback down with multi-word reason', () => {
    expect(parseCommand('feedback p9 down rep already owns this account')).toEqual({
      kind: 'feedback',
      projectId: 'p9',
      thumb: 'down',
      reason: 'rep already owns this account',
    });
  });

  it('accepts +1 / -1 / thumbsup / thumbsdown synonyms', () => {
    expect((parseCommand('feedback p1 +1') as { thumb: string }).thumb).toBe('up');
    expect((parseCommand('feedback p1 -1') as { thumb: string }).thumb).toBe('down');
    expect((parseCommand('feedback p1 thumbsup') as { thumb: string }).thumb).toBe('up');
    expect((parseCommand('feedback p1 ThumbsDown') as { thumb: string }).thumb).toBe('down');
  });

  it('returns unknown for malformed feedback', () => {
    expect(parseCommand('feedback').kind).toBe('unknown');
    expect(parseCommand('feedback p1').kind).toBe('unknown');
    expect(parseCommand('feedback p1 maybe').kind).toBe('unknown');
  });

  it('returns unknown for unrecognised verbs', () => {
    const out = parseCommand('explode the universe');
    expect(out.kind).toBe('unknown');
    if (out.kind === 'unknown') expect(out.raw).toContain('explode');
  });

  it('strips a leading /pathfinder prefix when Slack passes it through', () => {
    expect(parseCommand('/pathfinder leads 3')).toEqual({ kind: 'leads', limit: 3 });
    expect(parseCommand('pathfinder rejected').kind).toBe('rejected');
  });
});
