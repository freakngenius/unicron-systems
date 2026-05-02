// tests/connectors/slack-formatters.test.ts — Block Kit shape assertions
// for the connector-framework Slack formatters. Pure, no network.

import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  supabase: {},
  supabaseAdmin: () => ({}),
}));

import {
  CONNECTOR_ACTION_IDS,
  formatFeedbackPrompt,
  formatHelp,
  formatLead,
  formatPlainText,
  formatRejection,
} from '@/lib/connectors/slack/formatters';

describe('formatLead', () => {
  const baseInput = {
    id: 'p1',
    title: 'Acme Phase 2 — multifamily',
    score: 92,
    rationale: 'Verified RFP window, geo match, prior award pattern.',
    projectValue: 4_250_000,
    source: 'gov.acme.example',
    branchName: 'Edmonton',
    dashboardUrl: 'https://example.com/projects/p1',
  };

  it('emits header / context / section / actions / divider blocks', () => {
    const msg = formatLead(baseInput);
    const types = msg.blocks.map(b => b.type);
    expect(types).toEqual(['header', 'context', 'section', 'actions', 'divider']);
  });

  it('includes a plain-text fallback containing the title and score', () => {
    const msg = formatLead(baseInput);
    expect(msg.text).toContain('Acme Phase 2');
    expect(msg.text).toMatch(/score 92/);
  });

  it('emits exactly three action buttons with the dispatcher-known action_ids', () => {
    const msg = formatLead(baseInput);
    const actionsBlock = msg.blocks.find(b => b.type === 'actions') as {
      type: 'actions';
      block_id: string;
      elements: Array<{ action_id: string; type: string; value?: string }>;
    };
    expect(actionsBlock.block_id).toBe('lead_actions:p1');
    expect(actionsBlock.elements).toHaveLength(3);
    const ids = actionsBlock.elements.map(e => e.action_id);
    expect(ids).toEqual([
      CONNECTOR_ACTION_IDS.viewLead,
      CONNECTOR_ACTION_IDS.sendOutreach,
      CONNECTOR_ACTION_IDS.dismiss,
    ]);
    // Each button carries the lead id in its value field.
    for (const e of actionsBlock.elements) {
      expect(e.value).toBe('lead:p1');
    }
  });

  it('truncates very long titles to 150 characters', () => {
    const long = 'A'.repeat(400);
    const msg = formatLead({ ...baseInput, title: long });
    const header = msg.blocks[0] as unknown as { text: { text: string } };
    expect(header.text.text.length).toBeLessThanOrEqual(160); // 150 + emoji prefix
  });

  it('handles null score / value / rationale gracefully', () => {
    const msg = formatLead({
      ...baseInput,
      score: null,
      projectValue: null,
      rationale: null,
    });
    expect(msg.text).toContain('score —');
    const section = msg.blocks[2] as unknown as { text: { text: string } };
    expect(section.text.text).toMatch(/No rationale yet/);
  });
});

describe('formatRejection', () => {
  it('emits a section + divider with the rejection reason', () => {
    const msg = formatRejection({ id: 'r1', title: 'Tiny project', reason: 'Below score threshold' });
    expect(msg.blocks.map(b => b.type)).toEqual(['section', 'divider']);
    const section = msg.blocks[0] as unknown as { text: { text: string } };
    expect(section.text.text).toContain('Tiny project');
    expect(section.text.text).toContain('Below score threshold');
  });

  it('falls back to a default reason when null', () => {
    const msg = formatRejection({ id: 'r2', title: 'X', reason: null });
    const section = msg.blocks[0] as unknown as { text: { text: string } };
    expect(section.text.text).toContain('No reason recorded');
  });
});

describe('formatFeedbackPrompt', () => {
  it('mentions the lead title and prompts for thumbs', () => {
    const msg = formatFeedbackPrompt({ id: 'p9', title: 'Boost project' });
    expect(msg.text).toContain('Boost project');
    const section = msg.blocks[0] as unknown as { text: { text: string } };
    expect(section.text.text).toMatch(/:\+1:/);
    expect(section.text.text).toMatch(/:-1:/);
  });
});

describe('formatHelp', () => {
  it('lists the four slash-command verbs', () => {
    const msg = formatHelp();
    const txt = (msg.blocks[0] as unknown as { text: { text: string } }).text.text;
    expect(txt).toMatch(/\/pathfinder leads/);
    expect(txt).toMatch(/\/pathfinder rejected/);
    expect(txt).toMatch(/\/pathfinder feedback/);
    expect(txt).toMatch(/\/pathfinder help/);
  });
});

describe('formatPlainText', () => {
  it('wraps a string in a single section block', () => {
    const msg = formatPlainText('hello');
    expect(msg.text).toBe('hello');
    expect(msg.blocks).toHaveLength(1);
    expect(msg.blocks[0].type).toBe('section');
  });
});
