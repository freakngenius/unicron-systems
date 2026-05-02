// tests/connectors-ui/rules-validate.test.ts
//
// Pure-unit tests for the routing-rule validator. Same code path runs
// client-side (modal) and server-side (POST handler) so this is the
// single source of truth for what shapes are accepted.

import { describe, it, expect } from 'vitest';

import { validateRoutingRule } from '@/lib/connectors/rules-validate';

describe('validateRoutingRule', () => {
  it('rejects a non-object body', () => {
    const result = validateRoutingRule(null);
    expect(result.ok).toBe(false);
    expect(result.errors).toContainEqual({ field: '_root', message: expect.stringMatching(/object/) });
  });

  it('requires a known event_type', () => {
    const result = validateRoutingRule({
      event_type: 'lead.does_not_exist',
      channel_id: '#alerts',
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.field === 'event_type')).toBe(true);
  });

  it('requires a non-empty channel_id', () => {
    const result = validateRoutingRule({
      event_type: 'lead.high_score',
      channel_id: '',
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.field === 'channel_id')).toBe(true);
  });

  it('rejects channel_id with control characters (SSRF guard)', () => {
    const result = validateRoutingRule({
      event_type: 'lead.high_score',
      channel_id: '#alerts\nX-Inject: 1',
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.field === 'channel_id')).toBe(true);
  });

  it('accepts a canonical Slack channel id', () => {
    const result = validateRoutingRule({
      event_type: 'lead.high_score',
      channel_id: '#hot-leads',
      channel_name: 'Hot Leads',
      filter_json: { branch_id: 'denver', min_score: 90 },
    });
    expect(result.ok).toBe(true);
    expect(result.value?.channel_id).toBe('#hot-leads');
    expect(result.value?.filter_json).toEqual({ branch_id: 'denver', min_score: 90 });
  });

  it('parses filter_json strings into structured jsonb (no SQL injection path)', () => {
    const result = validateRoutingRule({
      event_type: 'cost.alert',
      channel_id: '#ops',
      filter_json: '{"min_score":80}',
    });
    expect(result.ok).toBe(true);
    expect(result.value?.filter_json).toEqual({ min_score: 80 });
  });

  it('rejects filter_json that is not a JSON object', () => {
    const result = validateRoutingRule({
      event_type: 'cost.alert',
      channel_id: '#ops',
      filter_json: '"just a string"',
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.field === 'filter_json')).toBe(true);
  });

  it('rejects malformed filter_json strings', () => {
    const result = validateRoutingRule({
      event_type: 'cost.alert',
      channel_id: '#ops',
      filter_json: '{not-json}',
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.field === 'filter_json')).toBe(true);
  });

  it('accepts quiet hours within the 0-23 range', () => {
    const result = validateRoutingRule({
      event_type: 'lead.high_score',
      channel_id: '#alerts',
      quiet_hours_json: {
        weekdays_enabled: true,
        weekends_enabled: false,
        start_hour_utc: 13,
        end_hour_utc: 23,
      },
    });
    expect(result.ok).toBe(true);
    expect(result.value?.quiet_hours_json).toMatchObject({
      start_hour_utc: 13,
      end_hour_utc: 23,
    });
  });

  it('rejects quiet hours with out-of-range integers', () => {
    const result = validateRoutingRule({
      event_type: 'lead.high_score',
      channel_id: '#alerts',
      quiet_hours_json: {
        weekdays_enabled: true,
        weekends_enabled: false,
        start_hour_utc: 36,
        end_hour_utc: 9,
      },
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.field === 'start_hour_utc')).toBe(true);
  });

  it('coerces stringified quiet hours numbers from form inputs', () => {
    const result = validateRoutingRule({
      event_type: 'lead.high_score',
      channel_id: '#alerts',
      quiet_hours_json: {
        weekdays_enabled: 'true',
        start_hour_utc: '0',
        end_hour_utc: '6',
      },
    });
    expect(result.ok).toBe(true);
    expect(result.value?.quiet_hours_json).toMatchObject({
      start_hour_utc: 0,
      end_hour_utc: 6,
    });
  });

  it('treats empty quiet_hours_json as unset (no rule)', () => {
    const result = validateRoutingRule({
      event_type: 'lead.high_score',
      channel_id: '#alerts',
      quiet_hours_json: '',
    });
    expect(result.ok).toBe(true);
    expect(result.value?.quiet_hours_json).toBeNull();
  });
});
