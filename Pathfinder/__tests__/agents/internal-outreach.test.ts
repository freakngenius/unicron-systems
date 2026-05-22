// __tests__/agents/internal-outreach.test.ts
//
// Stage 9 — Internal outreach drafter + HubSpot writer.
//
// Asserts pure helpers (buildHubspotNote/Fields, fallback drafts,
// em-dash stripping). The live Sonnet path is covered indirectly via
// the fallback branch when ANTHROPIC_API_KEY is absent.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildHubspotNote,
  buildHubspotFields,
  fallbackEmail,
  fallbackLinkedin,
  stripEmDashes,
  draftInternalOutreach,
} from '@/lib/agents/internal/outreachDrafter';
import { postInternalHubspotNote } from '@/lib/agents/internal/hubspotNote';
import type { OrgArchitecture } from '@/lib/types/architecture';
import type { Project } from '@/lib/types';

const arch = {
  vertical: 'construction-vertical-b2b-prospecting',
  lead_unit: { name: 'company', plural: 'companies', schema: {} },
  pipeline: { stages: [], stage_labels: {} },
  scoring: { weights: {}, thresholds: { verified: 0.65, high_priority: 0.8 } },
  geography: { scope: 'states', defaults: [] },
  sources: [],
  outreach: {
    persona: 'new-business sales rep at Unicron Systems',
    tone: 'direct, peer-to-peer, operator-credible',
    value_prop: 'a ranked outreach-ready pipeline of construction-vertical leads',
  },
  vocabulary: {},
  branding: { display_name: 'Unicron Internal' },
  compliance: [],
  integrations: ['hubspot', 'slack', 'resend'],
} as unknown as OrgArchitecture;

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: 'p1',
    source: 'sam-gov',
    source_id: 'p1',
    title: 'Acme Site Services',
    summary: '',
    lat: null,
    lon: null,
    project_value: null,
    project_stage: null,
    posted_date: null,
    raw_payload: {
      internal_enrichment: {
        service_category: 'temp-fence',
        sales_motion: 'hiring-bd',
        website: 'https://acme.example',
        linkedin: 'https://linkedin.com/company/acme',
      },
      internal_geo: { hq_state: 'TX', operating_states: ['TX', 'OK'] },
      internal_adjacency: {
        customer_overlap: [{ customer_name: 'Zedcor', basis: 'state=TX' }],
        crm_contact_match: [{ name: 'Jane Doe' }],
      },
    },
    rationale: 'Active hiring pulse with 3 BD roles open.',
    rationale_streamed_at: null,
    score: 82,
    nearest_branch_id: null,
    distance_miles: null,
    outreach_hook: 'Open a 20-min intro with the VP of Sales',
    warm_for_customer_id: null,
    ingested_at: new Date().toISOString(),
    ranked_at: new Date().toISOString(),
    organization_id: '2ff1197b-36f8-4210-aa11-65cf025ad83b',
    verified: true,
    ...overrides,
  } as unknown as Project;
}

describe('Internal outreach drafter (Stage 9)', () => {
  it('buildHubspotNote includes warm-intro evidence', () => {
    const note = buildHubspotNote(project());
    expect(note).toContain('Acme Site Services');
    expect(note).toContain('82/100');
    expect(note).toContain('temp-fence');
    expect(note).toContain('HQ TX');
    expect(note).toContain('Customer overlap: Zedcor');
    expect(note).toContain('Warm CRM contact: Jane Doe');
    expect(note).not.toContain('—');
  });

  it('buildHubspotFields flattens enrichment + geo onto the field bag', () => {
    const fields = buildHubspotFields(project());
    expect(fields.company_name).toBe('Acme Site Services');
    expect(fields.service_category).toBe('temp-fence');
    expect(fields.hq_state).toBe('TX');
    expect(fields.operating_states).toEqual(['TX', 'OK']);
    expect(fields.website).toBe('https://acme.example');
    expect(fields.linkedin_url).toBe('https://linkedin.com/company/acme');
    expect(fields.pathfinder_project_id).toBe('p1');
  });

  it('fallbackEmail and fallbackLinkedin produce em-dash-free copy', () => {
    const email = fallbackEmail(project(), arch);
    expect(email.subject).not.toContain('—');
    expect(email.body).not.toContain('—');
    expect(email.body).toContain('Unicron');

    const linkedin = fallbackLinkedin(project(), arch);
    expect(linkedin).not.toContain('—');
    expect(linkedin.length).toBeLessThanOrEqual(280);
  });

  it('stripEmDashes replaces em-dash and en-dash with spaces', () => {
    expect(stripEmDashes('hello — world – foo')).toBe('hello world foo');
  });
});

describe('Internal outreach drafter — full bundle (no API key path)', () => {
  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });

  it('draftInternalOutreach degrades to fallbacks when ANTHROPIC_API_KEY is absent', async () => {
    const draft = await draftInternalOutreach(project(), arch);
    expect(draft.project_id).toBe('p1');
    expect(draft.email_reason).toBe('no_api_key');
    expect(draft.linkedin_reason).toBe('no_api_key');
    expect(draft.email.subject).toBeTruthy();
    expect(draft.email.body).toBeTruthy();
    expect(draft.linkedin.message).toBeTruthy();
    expect(draft.hubspot.fields.company_name).toBe('Acme Site Services');
  });
});

describe('Internal HubSpot writer (Stage 9)', () => {
  beforeEach(() => {
    delete process.env.INTERNAL_HUBSPOT_API_KEY;
  });

  it('returns skipped:no_api_key when INTERNAL_HUBSPOT_API_KEY is absent', async () => {
    const r = await postInternalHubspotNote({
      company_name: 'Acme',
      note_body: 'test',
      fields: {},
    });
    expect(r.status).toBe('skipped:no_api_key');
  });
});
