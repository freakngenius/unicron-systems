// tests/connectors/teams-commands.test.ts — pure parser tests for the
// Teams @-mention command parser. Mirrors the Slack command parser tests
// to catch any divergence.

import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  supabase: {},
  supabaseAdmin: () => ({}),
}));

import { parseCommand, stripMention } from '@/lib/connectors/teams/commands';

describe('stripMention', () => {
  it('strips <at>...</at> tags', () => {
    expect(stripMention('<at>Pathfinder</at> leads 5', 'Pathfinder')).toBe('leads 5');
  });

  it('strips multiple at-tags and collapses whitespace', () => {
    expect(stripMention('<at>Bot</at>   leads', null)).toBe('leads');
  });

  it('strips a flattened @BotName when no tag is present', () => {
    expect(stripMention('@Pathfinder leads 5', 'Pathfinder')).toBe('leads 5');
    expect(stripMention('Pathfinder leads', 'Pathfinder')).toBe('leads');
  });

  it('returns empty for empty input', () => {
    expect(stripMention('', 'Pathfinder')).toBe('');
  });
});

describe('parseCommand', () => {
  it('returns help for empty / whitespace / null', () => {
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
    expect(parseCommand('leads')).toEqual({ kind: 'leads', limit: 5 });
  });

  it('parses leads with explicit limit', () => {
    expect(parseCommand('leads 12')).toEqual({ kind: 'leads', limit: 12 });
  });

  it('clamps leads limit to 25', () => {
    expect(parseCommand('leads 9999')).toEqual({ kind: 'leads', limit: 25 });
  });

  it('falls back to default for non-numeric / negative limits', () => {
    expect(parseCommand('leads abc')).toEqual({ kind: 'leads', limit: 5 });
    expect(parseCommand('leads -3')).toEqual({ kind: 'leads', limit: 5 });
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
    expect(parseCommand('feedback p9 down customer not on our list')).toEqual({
      kind: 'feedback',
      projectId: 'p9',
      thumb: 'down',
      reason: 'customer not on our list',
    });
  });

  it('accepts thumb synonyms', () => {
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

  it('strips a Teams <at>...</at> mention before parsing', () => {
    expect(parseCommand('<at>Pathfinder</at> leads 3', 'Pathfinder')).toEqual({
      kind: 'leads',
      limit: 3,
    });
  });

  it('strips a flattened @BotName before parsing', () => {
    expect(parseCommand('@Pathfinder rejected', 'Pathfinder').kind).toBe('rejected');
  });

  it('returns unknown for unrecognised verbs', () => {
    const out = parseCommand('detonate', null);
    expect(out.kind).toBe('unknown');
    if (out.kind === 'unknown') expect(out.raw).toContain('detonate');
  });
});
