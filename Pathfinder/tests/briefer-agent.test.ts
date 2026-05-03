// Unit tests for composeDailyBrief — orchestration, subject derivation,
// section toggling, markdown→html. Section fetchers are stubbed via
// dependency injection so this test stays in-memory.

import { describe, expect, it } from 'vitest';

import {
  __test__ as agentTest,
  composeDailyBrief,
} from '@/services/briefer/agent';
import { __test__ as renderTest, buildSubject } from '@/services/briefer/render';
import { DEFAULT_BRIEFING_PREFS, type BriefingPrefs } from '@/lib/types';
import type {
  ContactPendingRow,
  FollowUpRow,
  NewLeadRow,
  ReplyRow,
  SectionFetchers,
  StageChangeRow,
} from '@/services/briefer';

const NOW = new Date('2026-05-04T15:00:00.000Z');
const BASE = 'https://pathfinder.unicron.systems';

function defaultPrefs(over: Partial<BriefingPrefs> = {}): BriefingPrefs {
  return {
    user_id: 'kyle@freakngenius.com',
    ...DEFAULT_BRIEFING_PREFS,
    created_at: '2026-05-01T00:00:00.000Z',
    updated_at: '2026-05-01T00:00:00.000Z',
    ...over,
  };
}

function noopFetchers(): SectionFetchers {
  return {
    newLeads: async () => [],
    followUps: async () => [],
    stageChanges: async () => [],
    replies: async () => [],
    contactsPending: async () => [],
  };
}

describe('composeDailyBrief — quiet day', () => {
  it('returns the quiet-day subject when no leads / follow-ups', async () => {
    const out = await composeDailyBrief({
      userId: 'kyle@freakngenius.com',
      now: NOW,
      prefs: defaultPrefs(),
      fetchers: noopFetchers(),
      baseUrl: BASE,
      db: {} as never,
    });
    expect(out.subject).toBe('Pathfinder daily brief — 2026-05-04 — quiet day');
    expect(out.metrics).toEqual({
      new_leads_count: 0,
      follow_ups_count: 0,
      stage_changes_count: 0,
      replies_count: 0,
      contacts_pending_count: 0,
      llm_cost_usd: 0,
    });
    expect(out.sections_rendered).toEqual([]);
    // All five section headings render even when empty.
    expect(out.markdown).toContain('## Top new leads');
    expect(out.markdown).toContain('## Follow-ups due');
    expect(out.markdown).toContain('## Deal stage changes');
    expect(out.markdown).toContain('## Replies received');
    expect(out.markdown).toContain('## Contacts pending review');
  });

  it('includes the manage-link footer', async () => {
    const out = await composeDailyBrief({
      userId: 'kyle@freakngenius.com',
      now: NOW,
      prefs: defaultPrefs(),
      fetchers: noopFetchers(),
      baseUrl: BASE,
      db: {} as never,
    });
    expect(out.markdown).toContain(
      'Manage your daily brief at https://pathfinder.unicron.systems/pathfinder/settings/briefing.',
    );
  });
});

describe('composeDailyBrief — populated day', () => {
  it('counts rows correctly and lists rendered sections', async () => {
    const fetchers: SectionFetchers = {
      newLeads: async () =>
        [
          {
            id: 'sam.gov:p1',
            title: 'TxDOT widening',
            score: 87,
            owner_name: 'TxDOT',
            project_value: 4_200_000,
            posted_date: '2026-05-04T08:00:00Z',
          },
          {
            id: 'sam.gov:p2',
            title: 'Houston port',
            score: 72,
            owner_name: null,
            project_value: 1_500_000,
            posted_date: '2026-05-04T11:00:00Z',
          },
        ] satisfies NewLeadRow[],
      followUps: async () =>
        [
          {
            project_id: 'p1',
            project_title: 'TxDOT widening',
            to_email: 'cfo@txdot.gov',
            subject: 'RFP follow-up',
            sent_at: '2026-04-28T15:00:00.000Z',
          },
        ] satisfies FollowUpRow[],
      stageChanges: async () =>
        [
          {
            deal_id: 'd1',
            project_id: 'p1',
            project_title: 'TxDOT widening',
            from_stage: 'CONTACTED',
            to_stage: 'REPLIED',
            created_at: NOW.toISOString(),
          },
        ] satisfies StageChangeRow[],
      replies: async () => [] satisfies ReplyRow[],
      contactsPending: async () =>
        [
          {
            project_id: 'p1',
            project_title: 'TxDOT widening',
            contact_name: 'Jane Smith',
            role: 'Director of Capital Projects',
          },
        ] satisfies ContactPendingRow[],
    };
    const out = await composeDailyBrief({
      userId: 'kyle@freakngenius.com',
      now: NOW,
      prefs: defaultPrefs(),
      fetchers,
      baseUrl: BASE,
      db: {} as never,
    });
    expect(out.metrics.new_leads_count).toBe(2);
    expect(out.metrics.follow_ups_count).toBe(1);
    expect(out.metrics.stage_changes_count).toBe(1);
    expect(out.metrics.replies_count).toBe(0);
    expect(out.metrics.contacts_pending_count).toBe(1);
    expect(out.sections_rendered).toEqual([
      'new_leads',
      'follow_ups',
      'stage_changes',
      'contacts_pending',
    ]);
    expect(out.subject).toBe(
      'Pathfinder daily brief — 2026-05-04 — 2 new leads, 1 follow-up due',
    );
    // Markdown contains links + bolded destination stage.
    expect(out.markdown).toContain('CONTACTED → **REPLIED**');
    expect(out.markdown).toContain(`(${BASE}/leads/sam.gov%3Ap1)`);
    // HTML rendered with anchor + heading + list elements.
    expect(out.html).toContain('<h2');
    expect(out.html).toContain('<ul');
    expect(out.html).toContain(
      '<a href="https://pathfinder.unicron.systems/leads/sam.gov%3Ap1">',
    );
    expect(out.html).toContain('<strong>REPLIED</strong>');
  });
});

describe('composeDailyBrief — section toggles', () => {
  it('skips disabled sections entirely', async () => {
    const out = await composeDailyBrief({
      userId: 'kyle@freakngenius.com',
      now: NOW,
      prefs: defaultPrefs({
        sections: {
          new_leads: true,
          follow_ups: false,
          stage_changes: false,
          replies: false,
          contacts_pending: false,
        },
      }),
      fetchers: {
        newLeads: async () =>
          [
            {
              id: 'p1',
              title: 'X',
              score: 50,
              owner_name: null,
              project_value: null,
              posted_date: null,
            },
          ] satisfies NewLeadRow[],
        followUps: async () => {
          throw new Error('should not be called');
        },
        stageChanges: async () => {
          throw new Error('should not be called');
        },
        replies: async () => {
          throw new Error('should not be called');
        },
        contactsPending: async () => {
          throw new Error('should not be called');
        },
      },
      baseUrl: BASE,
      db: {} as never,
    });
    expect(out.markdown).toContain('## Top new leads');
    expect(out.markdown).not.toContain('## Follow-ups due');
    expect(out.markdown).not.toContain('## Deal stage changes');
    expect(out.markdown).not.toContain('## Replies received');
    expect(out.markdown).not.toContain('## Contacts pending review');
    expect(out.metrics.follow_ups_count).toBe(0);
    expect(out.metrics.contacts_pending_count).toBe(0);
  });
});

describe('mergeSections helper', () => {
  it('treats missing keys as opt-in', () => {
    expect(agentTest.mergeSections({})).toEqual({
      new_leads: true,
      follow_ups: true,
      stage_changes: true,
      replies: true,
      contacts_pending: true,
    });
  });

  it('respects explicit false', () => {
    expect(agentTest.mergeSections({ replies: false })).toMatchObject({
      replies: false,
      new_leads: true,
    });
  });
});

describe('buildSubject', () => {
  it('quiet-day fallback', () => {
    expect(buildSubject({ date: '2026-05-04', newLeadsCount: 0, followUpsCount: 0 })).toBe(
      'Pathfinder daily brief — 2026-05-04 — quiet day',
    );
  });
  it('singular vs plural', () => {
    expect(
      buildSubject({ date: '2026-05-04', newLeadsCount: 1, followUpsCount: 1 }),
    ).toBe('Pathfinder daily brief — 2026-05-04 — 1 new lead, 1 follow-up due');
    expect(
      buildSubject({ date: '2026-05-04', newLeadsCount: 3, followUpsCount: 0 }),
    ).toBe('Pathfinder daily brief — 2026-05-04 — 3 new leads');
    expect(
      buildSubject({ date: '2026-05-04', newLeadsCount: 0, followUpsCount: 4 }),
    ).toBe('Pathfinder daily brief — 2026-05-04 — 4 follow-ups due');
  });
});

describe('markdownToHtml — render edge cases', () => {
  it('escapes angle brackets and ampersands inside text', () => {
    expect(renderTest.escapeHtml('<script>&"\'')).toBe(
      '&lt;script&gt;&amp;&quot;&#39;',
    );
  });
  it('renders inline bold + italic + link', () => {
    const html = renderTest.inlineMarkdownToHtml(
      'See **[the project](https://x.com/p/1)** for _details_.',
    );
    expect(html).toContain('<a href="https://x.com/p/1">');
    expect(html).toContain('<strong>');
    expect(html).toContain('<em>details</em>');
  });
});
