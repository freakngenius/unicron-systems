// tests/onboarding-connectors/quick-pick-rules.test.ts
//
// Pure unit tests for the quick-pick rule catalog. Confirms the
// per-connector defaults match the spec § 7.3 description and that
// `hasQuickPickRules` correctly reports HubSpot as opt-out.

import { describe, it, expect } from 'vitest';

import {
  getQuickPickRules,
  hasQuickPickRules,
} from '@/lib/connectors/onboarding-rules';

describe('getQuickPickRules', () => {
  it('returns three rules for Slack with score-gated verified-leads default-checked', () => {
    const rules = getQuickPickRules('slack');
    expect(rules.length).toBe(3);
    const verified = rules.find((r) => r.event_type === 'lead.verified');
    expect(verified).toBeDefined();
    expect(verified?.default_checked).toBe(true);
    expect(verified?.filter).toMatchObject({ score_gte: 90 });
    expect(verified?.channel_placeholder).toContain('#');
  });

  it('returns three rules for Teams with team-id placeholders (not Slack-style #channels)', () => {
    const rules = getQuickPickRules('teams');
    expect(rules.length).toBe(3);
    for (const r of rules) {
      expect(r.channel_placeholder).not.toMatch(/^#/);
      expect(r.channel_placeholder).toMatch(/thread\.tacv2|@thread/);
    }
    // Same event types as Slack — parity per spec § 4.2
    const slackEvents = getQuickPickRules('slack')
      .map((r) => r.event_type)
      .sort();
    const teamsEvents = rules.map((r) => r.event_type).sort();
    expect(teamsEvents).toEqual(slackEvents);
  });

  it('returns no rules for HubSpot — sync is automatic', () => {
    expect(getQuickPickRules('hubspot')).toEqual([]);
  });

  it('every rule id is unique within its connector type', () => {
    for (const type of ['slack', 'teams'] as const) {
      const ids = getQuickPickRules(type).map((r) => r.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('every rule has an event_type that matches the dispatcher catalog shape', () => {
    // Loose validation — event_type must be `<area>.<event>` shape.
    for (const type of ['slack', 'teams'] as const) {
      for (const r of getQuickPickRules(type)) {
        expect(r.event_type).toMatch(/^[a-z_]+\.[a-z_]+$/);
      }
    }
  });
});

describe('hasQuickPickRules', () => {
  it('returns true for Slack and Teams, false for HubSpot', () => {
    expect(hasQuickPickRules('slack')).toBe(true);
    expect(hasQuickPickRules('teams')).toBe(true);
    expect(hasQuickPickRules('hubspot')).toBe(false);
  });
});
