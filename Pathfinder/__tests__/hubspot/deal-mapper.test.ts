// __tests__/hubspot/deal-mapper.test.ts — pure-function unit tests for
// the Project → HubSpot deal payload translation. No network. No
// Supabase. Asserts the spec's hard rules:
//
//   • pathfinder_lead_id custom property is present on every payload
//     (acceptance criterion in the spec)
//   • dealname is truncated to <=255 chars (HubSpot limit)
//   • closedate heuristic favors first_action_date + 90d when attested,
//     falls back to posted_date + 90d, ultimately defaults to today + 90d
//   • amount preference order: lead_action.attested_pipeline_value →
//     project.project_value → omitted (HubSpot stores no amount)
//   • Pathfinder-attribution custom properties surface when their source
//     is non-null (branch.code → pathfinder_branch_code; project.score →
//     pathfinder_score)
//   • Note body includes the rationale, outreach_hook, and a dashboard
//     deep link

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  closedateForMs,
  dealnameFor,
  noteBodyFor,
  projectToDealProperties,
} from '@/lib/hubspot/deal-mapper';
import type { Branch, Customer, LeadAction, Project } from '@/lib/types';

const ENV_KEYS = [
  'HUBSPOT_DEAL_PIPELINE_ID',
  'HUBSPOT_STAGE_ACCEPTED_ID',
  'NEXT_PUBLIC_BASE_URL',
];
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
  process.env.HUBSPOT_DEAL_PIPELINE_ID = 'pipeline_default';
  process.env.HUBSPOT_STAGE_ACCEPTED_ID = 'stage_accepted_xyz';
  process.env.NEXT_PUBLIC_BASE_URL = 'https://app.example.test';
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k]!;
  }
});

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'proj_001',
    source: 'usaspending',
    source_id: 'src_001',
    title: 'Hines VA Hospital perimeter security upgrade',
    summary: 'Federal contract for perimeter sensor upgrade.',
    lat: 29.76,
    lon: -95.37,
    project_value: 2_400_000,
    project_stage: 'awarded',
    posted_date: '2026-04-01',
    raw_payload: null,
    rationale: 'Strong fit: federal customer, in Houston coverage, high-value perimeter scope.',
    rationale_streamed_at: '2026-04-15T12:00:00.000Z',
    score: 87,
    nearest_branch_id: 'br_houston',
    distance_miles: 12.4,
    outreach_hook: 'Reference our Lyondell relationship as the warm-intro path.',
    warm_for_customer_id: 'cust_lyondell',
    ingested_at: '2026-04-14T00:00:00.000Z',
    ranked_at: '2026-04-14T01:00:00.000Z',
    verified: true,
    verifier_notes: null,
    verifier_pass_count: 4,
    ...overrides,
  };
}

function makeLeadAction(overrides: Partial<LeadAction> = {}): LeadAction {
  return {
    id: 42,
    project_id: 'proj_001',
    actor_email: 'rep@zedcor.example',
    status: 'accepted',
    attested_pipeline_value: null,
    first_action_date: null,
    note: null,
    hubspot_deal_id: null,
    hubspot_pipeline_id: null,
    hubspot_stage_id: null,
    hubspot_pushed_at: null,
    hubspot_last_event_at: null,
    hubspot_last_event_id: null,
    closed_won_amount: null,
    closed_won_at: null,
    closed_lost_reason: null,
    created_at: '2026-04-20T10:00:00.000Z',
    updated_at: '2026-04-20T10:00:00.000Z',
    ...overrides,
  };
}

function makeBranch(overrides: Partial<Branch> = {}): Branch {
  return {
    id: 'br_houston',
    name: 'Houston',
    code: 'HOU',
    lat: 29.76,
    lon: -95.37,
    coverage_radius_miles: 250,
    opened_date: null,
    region: 'south',
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeCustomer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: 'cust_lyondell',
    name: 'Lyondell',
    lat: 29.76,
    lon: -95.37,
    served_by_branch_id: 'br_houston',
    customer_since: '2024-01-01',
    monthly_value: 12_000,
    created_at: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('dealnameFor', () => {
  it('appends branch code when present', () => {
    const name = dealnameFor(makeProject(), makeBranch());
    expect(name).toBe('Hines VA Hospital perimeter security upgrade · HOU');
  });

  it('falls back to title alone when branch is missing', () => {
    const name = dealnameFor(makeProject(), null);
    expect(name).toBe('Hines VA Hospital perimeter security upgrade');
  });

  it('truncates at 255 chars (HubSpot limit) and preserves a trailing branch code suffix', () => {
    const longTitle = 'A'.repeat(400);
    const name = dealnameFor(makeProject({ title: longTitle }), makeBranch());
    expect(name.length).toBeLessThanOrEqual(255);
    // Branch suffix must survive the truncation so attribution stays attached.
    expect(name.endsWith(' · HOU')).toBe(true);
  });
});

describe('closedateForMs', () => {
  it('prefers first_action_date + 90d when attested', () => {
    const ms = closedateForMs(makeProject(), makeLeadAction({ first_action_date: '2026-05-01' }));
    // 2026-05-01 + 90d = 2026-07-30
    expect(new Date(ms).toISOString().slice(0, 10)).toBe('2026-07-30');
  });

  it('falls back to posted_date + 90d when no attestation', () => {
    const ms = closedateForMs(makeProject({ posted_date: '2026-04-01' }), makeLeadAction());
    expect(new Date(ms).toISOString().slice(0, 10)).toBe('2026-06-30');
  });

  it('defaults to today + 90d when nothing else is available', () => {
    const ms = closedateForMs(
      makeProject({ posted_date: null }),
      makeLeadAction(),
    );
    const expected = Date.now() + 90 * 24 * 60 * 60 * 1000;
    // Allow 5s of slack between Date.now() calls.
    expect(Math.abs(ms - expected)).toBeLessThan(5_000);
  });
});

describe('projectToDealProperties', () => {
  it('always includes pathfinder_lead_id (the spec hard-rule)', () => {
    const props = projectToDealProperties({
      project: makeProject(),
      leadAction: makeLeadAction({ id: 999 }),
      branch: null,
      customer: null,
    });
    expect(props.pathfinder_lead_id).toBe('999');
  });

  it('uses pipeline + accepted-stage env vars', () => {
    const props = projectToDealProperties({
      project: makeProject(),
      leadAction: makeLeadAction(),
      branch: null,
      customer: null,
    });
    expect(props.pipeline).toBe('pipeline_default');
    expect(props.dealstage).toBe('stage_accepted_xyz');
  });

  it('prefers attested_pipeline_value over project_value for amount', () => {
    const props = projectToDealProperties({
      project: makeProject({ project_value: 1_000 }),
      leadAction: makeLeadAction({ attested_pipeline_value: 5_000 }),
      branch: null,
      customer: null,
    });
    expect(props.amount).toBe('5000');
  });

  it('falls back to project_value when no attestation', () => {
    const props = projectToDealProperties({
      project: makeProject({ project_value: 2_400_000 }),
      leadAction: makeLeadAction(),
      branch: null,
      customer: null,
    });
    expect(props.amount).toBe('2400000');
  });

  it('omits amount entirely when neither source has a value', () => {
    const props = projectToDealProperties({
      project: makeProject({ project_value: null }),
      leadAction: makeLeadAction(),
      branch: null,
      customer: null,
    });
    expect(props.amount).toBeUndefined();
  });

  it('surfaces pathfinder_branch_code and pathfinder_score when present', () => {
    const props = projectToDealProperties({
      project: makeProject({ score: 87 }),
      leadAction: makeLeadAction(),
      branch: makeBranch({ code: 'HOU' }),
      customer: null,
    });
    expect(props.pathfinder_branch_code).toBe('HOU');
    expect(props.pathfinder_score).toBe('87');
  });

  it('omits attribution custom properties when their source is null', () => {
    const props = projectToDealProperties({
      project: makeProject({ score: null }),
      leadAction: makeLeadAction(),
      branch: null,
      customer: null,
    });
    expect(props.pathfinder_branch_code).toBeUndefined();
    expect(props.pathfinder_score).toBeUndefined();
  });
});

describe('noteBodyFor', () => {
  it('includes the rationale, outreach_hook, and dashboard deep link', () => {
    const body = noteBodyFor(makeProject(), makeLeadAction(), makeCustomer());
    expect(body).toContain('Strong fit: federal customer');
    expect(body).toContain('Reference our Lyondell relationship');
    // Dashboard deep link uses NEXT_PUBLIC_BASE_URL + /?project=<id>.
    expect(body).toContain('https://app.example.test');
    expect(body).toContain('proj_001');
  });

  it('mentions the warm-intro customer when one is provided', () => {
    const body = noteBodyFor(makeProject(), makeLeadAction(), makeCustomer({ name: 'Lyondell' }));
    expect(body).toContain('Lyondell');
  });

  it('produces a body with no em-dashes or en-dashes (Pathfinder voice rule)', () => {
    const body = noteBodyFor(makeProject(), makeLeadAction(), null);
    expect(body).not.toMatch(/[—–]/);
  });
});
