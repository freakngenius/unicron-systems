// __tests__/agents/funder-outreach.test.ts
// Funder onboarding Stage 8 — outreach drafter tests (deterministic parts only).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  draftFunderOutreach,
  buildSlackLine,
  buildHubspotFields,
} from '@/lib/agents/funder/outreachDrafter';
import { dispatchFunderOutreach } from '@/lib/agents/funder/outreachChannels';
import { resolveArchitecture } from '@/lib/config/resolveArchitecture';
import funderFixture from '../fixtures/funder-architecture.json';
import type { Project } from '@/lib/types';

const { _comment: _x, ...funderInput } = funderFixture as unknown as Record<string, unknown>;
const FUNDER_ARCH = resolveArchitecture(funderInput);

function makeP(overrides: Partial<Project> = {}): Project {
  return {
    id: 'p1',
    source: 'custom-propublica-nonprofit-explorer',
    source_id: 'p1',
    title: 'Alignment Research Inc',
    summary: 'AI safety nonprofit.',
    lat: null,
    lon: null,
    project_value: null,
    project_stage: null,
    posted_date: null,
    raw_payload: {
      funder_inferred_thesis: 'ai-safety',
      funder_geo_hub: 'sf-bay',
      founder_affiliation: 'OpenAI alignment team',
    },
    rationale: 'Strong AI safety fit; founders have alignment experience.',
    rationale_streamed_at: null,
    score: 88,
    nearest_branch_id: null,
    distance_miles: null,
    outreach_hook: 'Email this week.',
    warm_for_customer_id: null,
    ingested_at: new Date().toISOString(),
    ranked_at: null,
    organization_id: 'funder-uuid',
    ...overrides,
  };
}

describe('Funder outreach drafter — deterministic channels', () => {
  it('Slack line includes org name, score, thesis, hub, founder', () => {
    const line = buildSlackLine(makeP());
    expect(line).toContain('Alignment Research Inc');
    expect(line).toContain('88/100');
    expect(line).toContain('ai-safety');
    expect(line).toContain('sf-bay');
    expect(line).toContain('OpenAI alignment team');
  });

  it('Slack line surfaces compliance_flag with warning', () => {
    const p = makeP({
      raw_payload: { funder_inferred_thesis: 'biosecurity', funder_compliance_flag: 'biosecurity-review' },
    });
    const line = buildSlackLine(p);
    expect(line).toContain('biosecurity-review');
    expect(line).toContain('⚠️');
  });

  it('HubSpot fields map Funder context onto pre-filled record', () => {
    const fields = buildHubspotFields(makeP());
    expect(fields.organization_name).toBe('Alignment Research Inc');
    expect(fields.thesis_area).toBe('ai-safety');
    expect(fields.score).toBe(88);
    expect(fields.first_step).toBe('Email this week.');
    expect(fields.pathfinder_project_id).toBe('p1');
  });
});

describe('Funder outreach drafter — biosecurity skip', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('skips email draft when compliance_flag is biosecurity-review', async () => {
    const p = makeP({
      raw_payload: {
        funder_inferred_thesis: 'biosecurity',
        funder_compliance_flag: 'biosecurity-review',
        founder_affiliation: 'Broad Institute',
      },
    });
    const draft = await draftFunderOutreach(p, FUNDER_ARCH);
    expect(draft.email.skipped_reason).toBeTruthy();
    expect(draft.email.body).toBe('');
    expect(draft.email_reason).toBe('biosecurity_skip');
    // Slack + HubSpot fields still emit.
    expect(draft.slack.line).toContain('Alignment Research Inc');
    expect(draft.hubspot.fields.compliance_flag).toBe('biosecurity-review');
  });

  it('uses fallback email body when ANTHROPIC_API_KEY is unset', async () => {
    const orig = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      const draft = await draftFunderOutreach(makeP(), FUNDER_ARCH);
      expect(draft.email.subject).toContain('Funder');
      expect(draft.email.subject).toContain('Alignment Research Inc');
      expect(draft.email_reason).toBe('no_api_key');
    } finally {
      if (orig !== undefined) process.env.ANTHROPIC_API_KEY = orig;
    }
  });
});

describe('Funder outreach channel dispatch — env-gated', () => {
  const baseDraft = {
    project_id: 'p1',
    email: { subject: 's', body: 'b', skipped_reason: null },
    slack: { line: 'x' },
    hubspot: { fields: buildHubspotFields(makeP()) },
    email_latency_ms: 0,
  };

  it('email returns no_credentials when RESEND_API_KEY unset', async () => {
    const orig = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;
    try {
      const result = await dispatchFunderOutreach(baseDraft as any, { emailTo: 'a@b' });
      expect(result.email.ok).toBe(false);
      expect(result.email.reason).toBe('no_credentials');
    } finally {
      if (orig !== undefined) process.env.RESEND_API_KEY = orig;
    }
  });

  it('slack returns no_credentials when FUNDER_SLACK_WEBHOOK_URL unset', async () => {
    delete process.env.FUNDER_SLACK_WEBHOOK_URL;
    const result = await dispatchFunderOutreach(baseDraft as any);
    expect(result.slack.ok).toBe(false);
    expect(result.slack.reason).toBe('no_credentials');
  });

  it('hubspot returns no_credentials when FUNDER_HUBSPOT_API_KEY unset', async () => {
    delete process.env.FUNDER_HUBSPOT_API_KEY;
    const result = await dispatchFunderOutreach(baseDraft as any);
    expect(result.hubspot.ok).toBe(false);
    expect(result.hubspot.reason).toBe('no_credentials');
  });

  it('biosecurity-skip draft causes email channel to report biosecurity_skip', async () => {
    delete process.env.RESEND_API_KEY;
    const skipDraft = {
      ...baseDraft,
      email: { subject: '', body: '', skipped_reason: 'biosecurity-review compliance flag' },
    };
    const result = await dispatchFunderOutreach(skipDraft as any, { emailTo: 'a@b' });
    expect(result.email.reason).toBe('biosecurity_skip');
  });
});
