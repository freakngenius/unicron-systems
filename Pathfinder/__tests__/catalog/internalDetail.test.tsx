// @vitest-environment jsdom
//
// __tests__/catalog/internalDetail.test.tsx, Stream C Detail surface.
//
// Renders the four Stream C modules wrapped in CompanyDetailProvider with
// fixture data and asserts:
//   - signals panel shows six rows with weight badges, no fabricated
//     numeric contributions.
//   - rendered text uses architecture display_labels, never raw schema
//     field keys.
//   - outreach send button is enabled when resend integration is present,
//     disabled with reason text when absent.
//   - hubspot-sync affordance renders gated affordance text when hubspot
//     integration is absent.
//   - warm-intro renders pending state when slotMode is inactive.

import * as React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import CompanyDetail from '@/components/catalog/modules/CompanyDetail';
import OutreachComposer from '@/components/catalog/modules/OutreachComposer';
import HubspotSync from '@/components/catalog/modules/HubspotSync';
import WarmIntroPanel from '@/components/catalog/modules/WarmIntroPanel';
import {
  CompanyDetailProvider,
  type CompanyDetailContextValue,
} from '@/components/catalog/CompanyDetailContext';
import type { CompanyLeadView } from '@/lib/agents/internal/companyLeadView';
import type { OrgArchitecture } from '@/lib/types/architecture';
import type { Project } from '@/lib/types';
import type { ModuleComponentProps } from '@/lib/catalog/types';

void React;
afterEach(cleanup);

const ORG = { id: 'org-internal', slug: 'internal', name: 'Unicron Internal' };

const SCHEMA: OrgArchitecture['lead_unit']['schema'] = {
  company_name: { type: 'string', display_label: 'Company', required: true },
  service_category: { type: 'enum', display_label: 'Service category' },
  sales_motion: { type: 'enum', display_label: 'Sales motion' },
  footprint: { type: 'object', display_label: 'Operating footprint' },
  hq_location: { type: 'string', display_label: 'Headquarters' },
  licensure: { type: 'object', display_label: 'Contractor licensure' },
  federal_registration: { type: 'enum', display_label: 'Federal registration' },
  association_memberships: { type: 'object', display_label: 'Trade associations' },
  company_size: { type: 'string', display_label: 'Size' },
  warm_intro: { type: 'string', display_label: 'Warm intro' },
  first_step: { type: 'string', display_label: 'Recommended first step' },
  score: { type: 'number', display_label: 'Score' },
  source: { type: 'string', display_label: 'Source' },
};

function makeArchitecture(overrides: Partial<OrgArchitecture> = {}): OrgArchitecture {
  return {
    vertical: 'construction-vertical-b2b-prospecting',
    lead_unit: { name: 'company', plural: 'companies', schema: SCHEMA },
    pipeline: { stages: [], stage_labels: {} },
    scoring: {
      weights: {
        sales_motion_strength: 0.25,
        operational_footprint: 0.2,
        federal_signal: 0.15,
        project_driven_fit: 0.15,
        recency: 0.15,
        association_presence: 0.1,
      },
      thresholds: { verified: 0.65, high_priority: 0.8 },
    },
    geography: { scope: 'states', defaults: [] },
    sources: [],
    outreach: {
      persona: 'new-business sales rep at Unicron Systems',
      tone: 'direct, peer-to-peer, operator-credible, no fluff',
      value_prop:
        'a ranked, outreach-ready pipeline of qualified construction-vertical leads delivered every morning',
    },
    vocabulary: { lead: 'company', leads: 'companies' },
    branding: { display_name: 'Unicron Internal' },
    compliance: ['public-data-only'],
    integrations: ['hubspot', 'slack', 'resend'],
    modules: {
      'company-detail': { enabled: true },
      'outreach-composer': { enabled: true },
      'hubspot-sync': { enabled: true },
      'warm-intro-panel': { enabled: true },
    },
    ...overrides,
  };
}

function makeLead(overrides: Partial<CompanyLeadView> = {}): CompanyLeadView {
  return {
    id: 'thalle-construction',
    company_name: 'Thalle Construction Co Inc',
    score: 55,
    verified: false,
    service_category: 'General contractor',
    sales_motion: 'Active outbound',
    footprint: 'HQ NY · ops NY / NJ / PA',
    hq_location: 'White Plains, NY',
    employee_count: 750,
    federal_registration: 'SAM + awardee',
    associations: ['ABC', 'AGC'],
    source: 'sam-gov',
    posted_date: '2026-05-22T00:00:00Z',
    warm_intro: null,
    first_step: 'send the day-1 pitch comparing Pathfinder to manual prospecting',
    rationale:
      'Active outbound posture, multi-state ops across the Tri-State, federal awardee — fits the construction-vertical B2B service profile we prioritize.',
    brief: null,
    citations: [],
    website: 'https://thalle.com',
    linkedin: null,
    contacts: [],
    ...overrides,
  };
}

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'thalle-construction',
    source: 'sam-gov',
    source_id: 'thalle-1',
    title: 'Thalle Construction Co Inc',
    summary: null,
    lat: null,
    lon: null,
    project_value: null,
    project_stage: null,
    posted_date: '2026-05-22T00:00:00Z',
    raw_payload: {
      internal_geo: {
        hq_state: 'NY',
        hq_city: 'White Plains',
        operating_states: ['NY', 'NJ', 'PA'],
      },
      internal_sales_motion_signal: 'BD director on LinkedIn',
      internal_inferred_service_category: 'general-contractor',
    },
    rationale: null,
    rationale_streamed_at: null,
    score: 55,
    nearest_branch_id: null,
    distance_miles: null,
    outreach_hook: null,
    warm_for_customer_id: null,
    ingested_at: '2026-05-20T00:00:00Z',
    ranked_at: null,
    ...overrides,
  } as Project;
}

function makeContext(overrides: Partial<CompanyDetailContextValue> = {}): CompanyDetailContextValue {
  return {
    org: ORG,
    architecture: makeArchitecture(),
    lead: makeLead(),
    project: makeProject(),
    slotMode: {
      'detail.body': 'active',
      'detail.outreach': 'active',
      'detail.relationships': 'inactive',
    },
    slotReason: {
      'detail.body': 'all gates met',
      'detail.outreach': 'all gates met',
      'detail.relationships': 'soft gate unmet: data_signal/adjacency_graph',
    },
    ...overrides,
  };
}

const STUB_MODULE_PROPS = (ctxValue: CompanyDetailContextValue): ModuleComponentProps => ({
  org: ctxValue.org,
  architecture: ctxValue.architecture,
  config: undefined,
  affordances: [],
});

function renderWithContext(
  ctxValue: CompanyDetailContextValue,
  Component: React.ComponentType<ModuleComponentProps>,
  propsOverride?: Partial<ModuleComponentProps>,
) {
  const props = { ...STUB_MODULE_PROPS(ctxValue), ...(propsOverride ?? {}) };
  return render(
    <CompanyDetailProvider value={ctxValue}>
      <Component {...props} />
    </CompanyDetailProvider>,
  );
}

describe('<CompanyDetail /> (slot detail.body)', () => {
  it('renders the company name and the real total score in the header', () => {
    const ctx = makeContext();
    renderWithContext(ctx, CompanyDetail);
    expect(screen.getByText('Thalle Construction Co Inc')).toBeInTheDocument();
    expect(screen.getByText(/Score\s*55/)).toBeInTheDocument();
  });

  it('renders six signal rows in weight-descending order with weight badges', () => {
    const ctx = makeContext();
    const { container } = renderWithContext(ctx, CompanyDetail);
    const panel = container.querySelector('[data-signals-panel]');
    expect(panel).not.toBeNull();
    const rows = panel!.querySelectorAll('[data-signal-id]');
    expect(rows).toHaveLength(6);
    const ids = Array.from(rows).map((r) => r.getAttribute('data-signal-id'));
    expect(ids).toEqual([
      'sales_motion_strength',
      'operational_footprint',
      'federal_signal',
      'project_driven_fit',
      'recency',
      'association_presence',
    ]);
    const weights = Array.from(panel!.querySelectorAll('[data-signal-weight]')).map(
      (n) => n.textContent,
    );
    expect(weights).toEqual(['25%', '20%', '15%', '15%', '15%', '10%']);
  });

  it('never displays a fabricated numeric contribution (no points, no calibration text)', () => {
    const ctx = makeContext();
    renderWithContext(ctx, CompanyDetail);
    // Forbidden patterns. Numeric contributions or calibration language
    // would constitute the SPEC's PR BLOCKER trigger.
    const forbidden = [/contribution[s]?\b/i, /calibrat/i, /\d+\s*pts?\b/i, /\d+\s*points\b/i];
    const body = document.body.textContent ?? '';
    for (const pattern of forbidden) {
      expect(body).not.toMatch(pattern);
    }
  });

  it('renders display_labels, not raw schema field keys', () => {
    const ctx = makeContext();
    renderWithContext(ctx, CompanyDetail);
    expect(screen.getByText('Service category')).toBeInTheDocument();
    expect(screen.getByText('Headquarters')).toBeInTheDocument();
    expect(screen.getByText('Federal registration')).toBeInTheDocument();
    // The raw field keys must not leak into rendered text.
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/\bservice_category\b/);
    expect(text).not.toMatch(/\bhq_location\b/);
    expect(text).not.toMatch(/\bfederal_registration\b/);
  });
});

describe('<OutreachComposer /> (slot detail.outreach)', () => {
  it('renders the three drafts with copy buttons', () => {
    const ctx = makeContext();
    const { container } = renderWithContext(ctx, OutreachComposer);
    const drafts = container.querySelectorAll('[data-outreach-draft]');
    expect(drafts).toHaveLength(3);
    const channels = Array.from(drafts).map((d) => d.getAttribute('data-outreach-draft'));
    expect(channels).toEqual(['email', 'linkedin', 'hubspot_note']);
    const copies = container.querySelectorAll('[data-outreach-copy-button]');
    expect(copies).toHaveLength(3);
  });

  it('enables the send button when resend integration is present', () => {
    const ctx = makeContext();
    const { container } = renderWithContext(ctx, OutreachComposer);
    const btn = container.querySelector('[data-outreach-send-button]');
    expect(btn).not.toBeNull();
    expect(btn?.getAttribute('data-outreach-send-state')).toBe('enabled');
    expect((btn as HTMLButtonElement).disabled).toBe(false);
    expect(container.querySelector('[data-outreach-send-gate-reason]')).toBeNull();
  });

  it('disables the send button with a reason when resend integration is absent', () => {
    const ctx = makeContext({
      architecture: makeArchitecture({ integrations: ['hubspot', 'slack'] }),
    });
    const { container } = renderWithContext(ctx, OutreachComposer);
    const btn = container.querySelector('[data-outreach-send-button]');
    expect(btn?.getAttribute('data-outreach-send-state')).toBe('gated');
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    const reason = container.querySelector('[data-outreach-send-gate-reason]');
    expect(reason).not.toBeNull();
    expect(reason!.textContent).toMatch(/Resend/);
  });

  it('renders the soft-gate subtitle when slotMode is inactive', () => {
    const ctx = makeContext({
      slotMode: {
        'detail.body': 'active',
        'detail.outreach': 'inactive',
        'detail.relationships': 'inactive',
      },
      slotReason: {
        'detail.outreach': 'soft gate unmet: data_signal/outreach_drafts',
      },
    });
    renderWithContext(ctx, OutreachComposer);
    expect(screen.getByText(/Composing from org config/i)).toBeInTheDocument();
  });
});

describe('<HubspotSync /> (action-affordance)', () => {
  it('renders an enabled Push button when hubspot integration is present', () => {
    const ctx = makeContext();
    const { container } = renderWithContext(ctx, HubspotSync);
    expect(container.querySelector('[data-hubspot-sync-state="idle"]')).not.toBeNull();
    expect(screen.getByRole('button', { name: /Push to HubSpot/i })).not.toBeNull();
  });

  it('renders the gated affordance when hubspot integration is absent', () => {
    const ctx = makeContext({
      architecture: makeArchitecture({ integrations: ['slack', 'resend'] }),
    });
    const { container } = renderWithContext(ctx, HubspotSync);
    const gated = container.querySelector('[data-hubspot-sync-state="gated"]');
    expect(gated).not.toBeNull();
    expect(gated!.textContent).toMatch(/HubSpot not connected/);
  });
});

describe('<WarmIntroPanel /> (slot detail.relationships)', () => {
  it('renders the pending state when adjacency_graph soft-gate is unmet', () => {
    const ctx = makeContext();
    const { container } = renderWithContext(ctx, WarmIntroPanel);
    const panel = container.querySelector('[data-warm-intro-state="pending"]');
    expect(panel).not.toBeNull();
    expect(within(panel as HTMLElement).getByText(/No warm intros surfaced yet/i)).toBeInTheDocument();
  });

  it('renders the active match list when adjacency_graph data is present', () => {
    const ctx = makeContext({
      slotMode: {
        'detail.body': 'active',
        'detail.outreach': 'active',
        'detail.relationships': 'active',
      },
      project: makeProject({
        raw_payload: {
          internal_adjacency: [
            {
              related_company_id: 'abc-co',
              related_company_name: 'ABC Construction Co',
              relationship: 'shared-association',
              why: 'Both members of AGC',
            },
            {
              related_company_id: 'xyz-co',
              related_company_name: 'XYZ Builders LLC',
              relationship: 'common-region',
              why: 'Both operate in NY/NJ',
            },
          ],
        },
      }),
    });
    const { container } = renderWithContext(ctx, WarmIntroPanel);
    const panel = container.querySelector('[data-warm-intro-state="active"]');
    expect(panel).not.toBeNull();
    const matches = container.querySelectorAll('[data-warm-intro-match]');
    expect(matches).toHaveLength(2);
    expect(screen.getByText('ABC Construction Co')).toBeInTheDocument();
    expect(screen.getByText('XYZ Builders LLC')).toBeInTheDocument();
  });
});
