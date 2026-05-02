// tests/connectors/teams-adaptive-cards.test.ts — Adaptive Card shape
// assertions. Pure, no network. Mirrors the Slack formatter tests.

import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  supabase: {},
  supabaseAdmin: () => ({}),
}));

import {
  formatFeedbackPrompt,
  formatHelp,
  formatLead,
  formatPlainText,
  formatRejection,
  TEAMS_ACTION_IDS,
  toAttachment,
} from '@/lib/connectors/teams/adaptive-cards';

describe('formatLead', () => {
  it('builds an Adaptive Card 1.5 with the lead title, fact set, rationale, and 5 actions', () => {
    const card = formatLead({
      id: 'p_42',
      title: 'New strip mall security install',
      score: 92,
      rationale: 'Recent permit + matches branch service area',
      projectValue: 245_000,
      source: 'permits.gov',
      branchName: 'Calgary',
      dashboardUrl: 'https://example.com/p/42',
    });
    expect(card.type).toBe('AdaptiveCard');
    expect(card.version).toBe('1.5');
    // body: title + factset + rationale
    expect(card.body).toHaveLength(3);
    expect((card.body[0] as unknown as { text: string }).text).toContain('strip mall');
    expect((card.body[1] as unknown as { type: string }).type).toBe('FactSet');
    // 5 actions: View / Outreach / Dismiss / Up / Down
    expect(card.actions).toHaveLength(5);
    const actionIds = (card.actions ?? []).map((a) => (a.data as { actionId?: string } | undefined)?.actionId).filter(Boolean);
    expect(actionIds).toEqual(
      expect.arrayContaining([
        TEAMS_ACTION_IDS.sendOutreach,
        TEAMS_ACTION_IDS.dismiss,
        TEAMS_ACTION_IDS.feedbackUp,
        TEAMS_ACTION_IDS.feedbackDown,
      ]),
    );
  });

  it('truncates very long titles and rationales', () => {
    const card = formatLead({
      id: 'p1',
      title: 'A'.repeat(500),
      score: 80,
      rationale: 'B'.repeat(2000),
      projectValue: null,
      dashboardUrl: 'https://example.com',
    });
    const titleText = (card.body[0] as unknown as { text: string }).text;
    const rationaleText = (card.body[2] as unknown as { text: string }).text;
    expect(titleText.length).toBeLessThanOrEqual(150);
    expect(rationaleText.length).toBeLessThanOrEqual(500);
  });

  it('falls back to em-dash for missing value fields', () => {
    const card = formatLead({
      id: 'p1',
      title: 't',
      score: null,
      rationale: null,
      projectValue: null,
      dashboardUrl: 'https://example.com',
    });
    const facts = (card.body[1] as unknown as { facts: { title: string; value: string }[] }).facts;
    expect(facts.find((f) => f.title === 'Score')?.value).toBe('—');
    expect(facts.find((f) => f.title === 'Value')?.value).toBe('—');
  });
});

describe('formatRejection', () => {
  it('builds a 2-block info card', () => {
    const card = formatRejection({ id: 'p1', title: 'X', reason: 'Out of region' });
    expect(card.body).toHaveLength(2);
    expect((card.body[0] as unknown as { text: string }).text).toContain('Rejected');
  });

  it('uses "No reason recorded." when reason is empty', () => {
    const card = formatRejection({ id: 'p1', title: 'X', reason: null });
    expect((card.body[1] as unknown as { text: string }).text).toContain('No reason');
  });
});

describe('formatFeedbackPrompt', () => {
  it('emits two thumb actions tied to the project id', () => {
    const card = formatFeedbackPrompt({ id: 'p1', title: 'A lead' });
    expect(card.actions).toHaveLength(2);
    const projectIds = (card.actions ?? [])
      .map((a) => (a.data as { projectId?: string } | undefined)?.projectId)
      .filter(Boolean);
    expect(projectIds.every((p) => p === 'p1')).toBe(true);
  });
});

describe('formatHelp', () => {
  it('contains all four supported commands', () => {
    const card = formatHelp();
    const text = (card.body[1] as unknown as { text: string }).text;
    expect(text).toContain('leads');
    expect(text).toContain('rejected');
    expect(text).toContain('feedback');
    expect(text).toContain('help');
  });
});

describe('formatPlainText', () => {
  it('wraps a string in a single TextBlock', () => {
    const card = formatPlainText('hi');
    expect(card.body).toHaveLength(1);
    expect((card.body[0] as unknown as { text: string }).text).toBe('hi');
  });
});

describe('toAttachment', () => {
  it('wraps a card in the Bot Framework adaptive contentType', () => {
    const att = toAttachment(formatPlainText('x'));
    expect(att.contentType).toBe('application/vnd.microsoft.card.adaptive');
    expect(att.content.type).toBe('AdaptiveCard');
  });

  it('throws when the card exceeds 28KB', () => {
    const giant = formatPlainText('Z'.repeat(40_000));
    expect(() => toAttachment(giant)).toThrow(/exceeds/);
  });
});
