// __tests__/slack/messages.test.ts — pure-function unit tests for the
// Pathfinder Slack Block Kit builders. No network. No Supabase. Asserts
// the spec's hard rules:
//
//   • Per-lead message has 4 action buttons with the action_ids the
//     dispatcher in lib/slack/actions.ts pattern-matches on.
//   • mentionHere prepends a `<!here>` section; DMs do not.
//   • Accept modal has the 3 inputs (pipeline value, first-action date,
//     optional note) with stable block_ids and the modal callback_id.
//   • Post-action update removes the actions block and adds a context line.
//   • Accept thread reply includes pipeline value, first-action date,
//     note (when supplied), and HubSpot deep-link (when supplied).
//   • Digest message has no buttons (deep-links only).

import { describe, expect, it } from 'vitest';

import {
  ACCEPT_MODAL_BLOCK_IDS,
  ACCEPT_MODAL_CALLBACK_ID,
  ACTION_IDS,
  buildAcceptModal,
  buildAcceptThreadReply,
  buildDigestMessage,
  buildLeadMessage,
  buildPostActionUpdate,
  type LeadMessageInput,
  type SlackBlock,
} from '@/lib/slack/messages';
import type { Project } from '@/lib/types';

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'proj_001',
    source: 'usaspending',
    source_id: 'src_001',
    title: 'Hines VA Hospital perimeter security upgrade',
    summary: null,
    lat: null,
    lon: null,
    project_value: 2_400_000,
    project_stage: 'awarded',
    posted_date: '2026-04-01',
    raw_payload: null,
    rationale: 'Federal contract; security perimeter scope; 50 mi to Houston branch.',
    rationale_streamed_at: null,
    score: 92,
    nearest_branch_id: 'br_houston',
    distance_miles: 50,
    outreach_hook: null,
    warm_for_customer_id: null,
    ingested_at: '2026-04-28T00:00:00Z',
    ranked_at: '2026-04-28T00:01:00Z',
    verified: true,
    verifier_notes: null,
    verifier_pass_count: 4,
    slack_alert_sent_at: null,
    ...overrides,
  };
}

function leadInput(overrides: Partial<LeadMessageInput> = {}): LeadMessageInput {
  return {
    project: makeProject(),
    branchName: 'Houston',
    mentionHere: false,
    slackMessagesId: 42,
    dashboardUrl: 'https://www.unicron.systems/pathfinder/projects/proj_001',
    ...overrides,
  };
}

function findBlock<T extends SlackBlock>(
  blocks: SlackBlock[],
  predicate: (b: SlackBlock) => boolean,
): T | undefined {
  return blocks.find(predicate) as T | undefined;
}

describe('buildLeadMessage', () => {
  it('emits 4 action buttons with the action_ids dispatch matches on', () => {
    const m = buildLeadMessage(leadInput());
    const actions = findBlock(m.blocks, (b) => b.type === 'actions');
    expect(actions).toBeDefined();
    const ids = ((actions!.elements as unknown as Array<{ action_id: string }>) ?? []).map(
      (e) => e.action_id,
    );
    expect(ids).toEqual([
      ACTION_IDS.accept,
      ACTION_IDS.dismiss,
      ACTION_IDS.snooze24h,
      ACTION_IDS.snooze7d,
    ]);
  });

  it('encodes project_id + slack_messages.id in every action button value', () => {
    const m = buildLeadMessage(leadInput({ slackMessagesId: 99 }));
    const actions = findBlock(m.blocks, (b) => b.type === 'actions');
    const elements = actions!.elements as unknown as Array<{ value: string }>;
    for (const e of elements) {
      const parsed = JSON.parse(e.value);
      expect(parsed).toEqual({ pid: 'proj_001', smid: 99 });
    }
  });

  it('prepends a <!here> section when mentionHere=true', () => {
    const m = buildLeadMessage(leadInput({ mentionHere: true }));
    const first = m.blocks[0];
    expect(first.type).toBe('section');
    expect(((first as { text?: { text?: string } }).text as { text?: string }).text).toContain('<!here>');
  });

  it('omits <!here> for DMs (mentionHere=false)', () => {
    const m = buildLeadMessage(leadInput({ mentionHere: false }));
    const hasMention = m.blocks.some(
      (b) =>
        b.type === 'section' &&
        ((b as { text?: { text?: string } }).text?.text ?? '').includes('<!here>'),
    );
    expect(hasMention).toBe(false);
  });

  it('renders a header containing the project title', () => {
    const m = buildLeadMessage(leadInput());
    const header = findBlock(m.blocks, (b) => b.type === 'header');
    expect(header).toBeDefined();
    expect(((header as { text?: { text?: string } }).text as { text?: string }).text).toContain(
      'Hines VA Hospital',
    );
  });

  it('plain-text fallback includes the title and the score', () => {
    const m = buildLeadMessage(leadInput());
    expect(m.text).toContain('Hines VA Hospital');
    expect(m.text).toContain('score 92');
  });
});

describe('buildAcceptModal', () => {
  it('uses the canonical callback_id and 3 input blocks', () => {
    const v = buildAcceptModal({
      projectId: 'proj_001',
      projectTitle: 'Hines VA Hospital',
      slackMessagesId: 42,
      channelId: 'C123',
      messageTs: '1714250000.000100',
      defaultFirstActionDate: '2026-04-28',
    });
    expect(v.callback_id).toBe(ACCEPT_MODAL_CALLBACK_ID);
    const blockIds = v.blocks.map((b) => (b as { block_id?: string }).block_id).filter(Boolean);
    expect(blockIds).toEqual([
      ACCEPT_MODAL_BLOCK_IDS.pipelineValue,
      ACCEPT_MODAL_BLOCK_IDS.firstActionDate,
      ACCEPT_MODAL_BLOCK_IDS.note,
    ]);
  });

  it('round-trips channel_id + ts in private_metadata so submit can update the message', () => {
    const v = buildAcceptModal({
      projectId: 'proj_001',
      projectTitle: 'X',
      slackMessagesId: 7,
      channelId: 'C999',
      messageTs: '1714250000.000100',
      defaultFirstActionDate: '2026-05-01',
    });
    const meta = JSON.parse(v.private_metadata);
    expect(meta).toEqual({
      pid: 'proj_001',
      smid: 7,
      cid: 'C999',
      ts: '1714250000.000100',
    });
  });

  it('marks the note input as optional', () => {
    const v = buildAcceptModal({
      projectId: 'p',
      projectTitle: 't',
      slackMessagesId: 1,
      channelId: 'C',
      messageTs: '0',
      defaultFirstActionDate: '2026-04-28',
    });
    const note = v.blocks.find((b) => (b as { block_id?: string }).block_id === ACCEPT_MODAL_BLOCK_IDS.note);
    expect((note as { optional?: boolean }).optional).toBe(true);
  });
});

describe('buildPostActionUpdate', () => {
  it('removes the actions block and the <!here> mention', () => {
    const original = leadInput({ mentionHere: true });
    const u = buildPostActionUpdate({
      original,
      outcome: { action: 'accept', actorDisplay: 'Kyle', attestedValue: 250_000, firstActionDate: '2026-05-02' },
    });
    expect(u.blocks.some((b) => b.type === 'actions')).toBe(false);
    expect(
      u.blocks.some(
        (b) =>
          b.type === 'section' &&
          ((b as { text?: { text?: string } }).text?.text ?? '').includes('<!here>'),
      ),
    ).toBe(false);
  });

  it('appends an outcome context line with the actor + pipeline value', () => {
    const original = leadInput();
    const u = buildPostActionUpdate({
      original,
      outcome: { action: 'accept', actorDisplay: 'Kyle Doenz', attestedValue: 1_500_000, firstActionDate: '2026-05-02' },
    });
    const lastContext = [...u.blocks].reverse().find((b) => b.type === 'context');
    const text = ((lastContext as { elements?: Array<{ text?: string }> }).elements?.[0]?.text ?? '') as string;
    // The very last context is the dashboard link; the outcome line precedes it.
    const outcomeContext = u.blocks.filter((b) => b.type === 'context').slice(-2)[0];
    const outcomeText = ((outcomeContext as { elements?: Array<{ text?: string }> }).elements?.[0]?.text ?? '') as string;
    expect(outcomeText).toContain('Accepted');
    expect(outcomeText).toContain('Kyle Doenz');
    expect(outcomeText).toContain('$1.5M');
    expect(outcomeText).toContain('2026-05-02');
    // The dashboard link still exists at the end.
    expect(text).toContain('View in Pathfinder');
  });

  it('renders a snooze 7d outcome line', () => {
    const u = buildPostActionUpdate({
      original: leadInput(),
      outcome: { action: 'snooze_7d', actorDisplay: 'Keenan' },
    });
    const outcomeContext = u.blocks.filter((b) => b.type === 'context').slice(-2)[0];
    const outcomeText = ((outcomeContext as { elements?: Array<{ text?: string }> }).elements?.[0]?.text ?? '') as string;
    expect(outcomeText).toContain('Snoozed 7d');
    expect(outcomeText).toContain('Keenan');
  });
});

describe('buildAcceptThreadReply', () => {
  it('includes pipeline value, first-action date, note, and HubSpot deep-link when present', () => {
    const r = buildAcceptThreadReply({
      actorDisplay: 'Kyle',
      attestedValue: 750_000,
      firstActionDate: '2026-05-15',
      note: 'Met with VP at conference; ready to move.',
      hubspotDealUrl: 'https://app.hubspot.com/contacts/000/deal/12345',
    });
    expect(r.text).toContain('Kyle');
    expect(r.text).toContain('$750k');
    expect(r.text).toContain('2026-05-15');
    expect(r.text).toContain('Met with VP');
    expect(r.text).toContain('HubSpot');
  });

  it('omits optional sections when the data is null', () => {
    const r = buildAcceptThreadReply({
      actorDisplay: 'Kyle',
      attestedValue: null,
      firstActionDate: null,
      note: null,
      hubspotDealUrl: null,
    });
    expect(r.text).not.toContain('Pipeline value');
    expect(r.text).not.toContain('HubSpot');
  });
});

describe('buildDigestMessage', () => {
  it('contains no action buttons (digest is read-only)', () => {
    const m = buildDigestMessage({
      branchName: 'Houston',
      date: '25 Apr 2026',
      statusStrip: 'LAST RUN · 12m ago | 247 SURFACED | 47 ACCEPTED',
      opportunities: [
        {
          id: 'p1',
          title: 'VA Hospital perimeter',
          source: 'USAspending',
          value: '$2.4M',
          distance: '50 mi',
          score: 92,
          rationale: 'Strong fit; pre-RFP.',
          highPriority: true,
        },
      ],
      dashboardUrl: 'https://example.test/',
    });
    const actions = m.blocks.find((b) => b.type === 'actions');
    // The digest has a single CTA "Open operations console" — that's a link button,
    // not a per-lead button, so the dispatcher won't catch it.
    const elements = ((actions as { elements?: Array<{ action_id?: string }> }).elements ?? []) as Array<{ action_id?: string }>;
    for (const e of elements) {
      expect(e.action_id).toBeUndefined();
    }
  });

  it('renders an empty-state line when there are no opportunities', () => {
    const m = buildDigestMessage({
      branchName: 'Houston',
      date: '25 Apr 2026',
      statusStrip: '',
      opportunities: [],
      dashboardUrl: 'https://example.test/',
    });
    const empty = m.blocks.find(
      (b) =>
        b.type === 'section' &&
        ((b as { text?: { text?: string } }).text?.text ?? '').includes('No high-priority'),
    );
    expect(empty).toBeDefined();
  });
});
