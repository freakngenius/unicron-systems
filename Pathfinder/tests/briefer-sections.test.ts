// Unit tests for the briefer section render helpers + small pure
// utilities. Query helpers are exercised by briefer-agent.test.ts via
// dependency-injected fetchers.

import { describe, expect, it } from 'vitest';

import {
  __test__,
  renderContactsPending,
  renderFollowUps,
  renderNewLeads,
  renderReplies,
  renderStageChanges,
  type ContactPendingRow,
  type FollowUpRow,
  type NewLeadRow,
  type ReplyRow,
  type StageChangeRow,
} from '@/services/briefer/sections';

const { isoMinusHours, leadUrl, formatUsd, formatScore, daysAgo } = __test__;

const BASE = 'https://pathfinder.unicron.systems';
const NOW = new Date('2026-05-04T15:00:00.000Z');

describe('briefer/sections — small helpers', () => {
  it('isoMinusHours subtracts the right amount', () => {
    expect(isoMinusHours(NOW, 24)).toBe('2026-05-03T15:00:00.000Z');
    expect(isoMinusHours(NOW, 72)).toBe('2026-05-01T15:00:00.000Z');
  });

  it('leadUrl builds a path with the project id encoded', () => {
    expect(leadUrl(BASE, 'sam.gov:abc/123')).toBe(
      'https://pathfinder.unicron.systems/leads/sam.gov%3Aabc%2F123',
    );
  });

  it('leadUrl strips trailing slashes from the base', () => {
    expect(leadUrl('https://x.com/', 'p1')).toBe('https://x.com/leads/p1');
    expect(leadUrl('https://x.com///', 'p1')).toBe('https://x.com/leads/p1');
  });

  it('formatUsd handles M / K / small / null', () => {
    expect(formatUsd(4_200_000)).toBe('$4.2M');
    expect(formatUsd(450_000)).toBe('$450K');
    expect(formatUsd(750)).toBe('$750');
    expect(formatUsd(null)).toBe('—');
    expect(formatUsd(Number.NaN)).toBe('—');
  });

  it('formatScore rounds and handles null', () => {
    expect(formatScore(8.6)).toBe('9');
    expect(formatScore(50)).toBe('50');
    expect(formatScore(null)).toBe('—');
  });

  it('daysAgo handles invalid input by returning 0', () => {
    expect(daysAgo(NOW, 'not a date')).toBe(0);
    expect(daysAgo(NOW, '2026-05-01T15:00:00.000Z')).toBe(3);
    expect(daysAgo(NOW, '2026-05-04T15:00:00.000Z')).toBe(0);
    // Future dates clamp to 0 (ts > now ⇒ negative ⇒ Math.max(0,..)).
    expect(daysAgo(NOW, '2026-06-01T15:00:00.000Z')).toBe(0);
  });
});

describe('briefer/sections — renderNewLeads', () => {
  it('renders an empty-state when no rows', () => {
    expect(renderNewLeads([], BASE)).toBe(
      '## Top new leads (last 24 h)\n\n_No new leads scored in the last 24 hours._',
    );
  });

  it('renders a list with score, value, owner, and link', () => {
    const rows: NewLeadRow[] = [
      {
        id: 'sam.gov:p1',
        title: 'Texas DOT I-45 widening',
        score: 87,
        owner_name: 'Texas Department of Transportation',
        project_value: 4_200_000,
        posted_date: '2026-05-04T08:00:00Z',
      },
      {
        id: 'sam.gov:p2',
        title: 'Houston port gate rehab',
        score: 72,
        owner_name: null,
        project_value: null,
        posted_date: '2026-05-04T11:00:00Z',
      },
    ];
    const out = renderNewLeads(rows, BASE);
    expect(out).toContain('## Top new leads (last 24 h)');
    expect(out).toContain('**[Texas DOT I-45 widening]');
    expect(out).toContain('score 87 · $4.2M · Texas Department of Transportation');
    expect(out).toContain('Houston port gate rehab');
    expect(out).toContain('score 72 · —');
    expect(out).not.toContain('· null');
    expect(out).toContain(`(${BASE}/leads/sam.gov%3Ap1)`);
  });
});

describe('briefer/sections — renderFollowUps', () => {
  it('renders an empty-state when no rows', () => {
    expect(renderFollowUps([], BASE, NOW)).toBe(
      '## Follow-ups due\n\n_No outreach awaiting follow-up._',
    );
  });

  it('renders age-in-days using the now arg', () => {
    const rows: FollowUpRow[] = [
      {
        project_id: 'p1',
        project_title: 'Big project',
        to_email: 'cfo@city.tx',
        subject: 'RFP follow-up',
        sent_at: '2026-04-28T15:00:00.000Z',
      },
    ];
    const out = renderFollowUps(rows, BASE, NOW);
    expect(out).toContain('sent 6d ago to cfo@city.tx');
    expect(out).toContain(`[Big project](${BASE}/leads/p1)`);
  });
});

describe('briefer/sections — renderStageChanges', () => {
  it('renders empty-state', () => {
    expect(renderStageChanges([], BASE)).toBe(
      '## Deal stage changes (last 24 h)\n\n_No deals advanced in the last 24 hours._',
    );
  });

  it('renders from → to with bolded destination', () => {
    const rows: StageChangeRow[] = [
      {
        deal_id: 'd1',
        project_id: 'p1',
        project_title: 'Houston gate',
        from_stage: 'CONTACTED',
        to_stage: 'REPLIED',
        created_at: NOW.toISOString(),
      },
    ];
    const out = renderStageChanges(rows, BASE);
    expect(out).toContain('CONTACTED → **REPLIED**');
    expect(out).toContain(`[Houston gate](${BASE}/leads/p1)`);
  });

  it('handles null from/to with em-dash', () => {
    const rows: StageChangeRow[] = [
      {
        deal_id: 'd1',
        project_id: 'p1',
        project_title: 't',
        from_stage: null,
        to_stage: null,
        created_at: NOW.toISOString(),
      },
    ];
    expect(renderStageChanges(rows, BASE)).toContain('— → **—**');
  });
});

describe('briefer/sections — renderReplies', () => {
  it('empty-state', () => {
    expect(renderReplies([], BASE)).toBe(
      '## Replies received (last 24 h)\n\n_No replies in the last 24 hours._',
    );
  });

  it('lists each reply with the recipient', () => {
    const rows: ReplyRow[] = [
      {
        project_id: 'p1',
        project_title: 'Houston gate',
        to_email: 'cfo@city.tx',
        reply_received_at: NOW.toISOString(),
      },
    ];
    expect(renderReplies(rows, BASE)).toContain('reply from cfo@city.tx');
  });
});

describe('briefer/sections — renderContactsPending', () => {
  it('empty-state', () => {
    expect(renderContactsPending([], BASE)).toBe(
      '## Contacts pending review\n\n_No contacts awaiting review._',
    );
  });

  it('renders contact name + role', () => {
    const rows: ContactPendingRow[] = [
      {
        project_id: 'p1',
        project_title: 'Houston gate',
        contact_name: 'Jane Smith',
        role: 'Director of Capital Projects',
      },
      {
        project_id: 'p2',
        project_title: 'Other project',
        contact_name: 'John Doe',
        role: null,
      },
    ];
    const out = renderContactsPending(rows, BASE);
    expect(out).toContain('Jane Smith (Director of Capital Projects)');
    expect(out).toContain('John Doe');
    expect(out).not.toContain('John Doe (');
  });
});
