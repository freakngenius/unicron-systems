// ---------------------------------------------------------------------------
// Internal-demo fixtures (Section B).
//
// This file is the residue of a multi-PR fixture cleanup series
// (#278/#279/#280/#281/#282/#283/#284 and the final archive PR).
// All Section A consumer-facing mock-mode fixtures have been removed —
// their clients now fail loud against real APIs instead of falling back
// to fixtures.
//
// What remains is strictly internal-demo + smoke-display fodder used by
// a small set of UI components:
//   - activityFeed              → ActivityFeed component
//   - placeholderExamples       → DefinePain onboarding form
//   - subcontractorIntelTests   → AddAgentPanel demo
//   - enricherTests / Versions  → EditNodePanel + sub-components
//   - enricherInitialInstruction→ EditNodePanel demo
//   - sourceAnalysis            → ArchitectAnalysis demo panel
//   - inngestHealthMock         → InngestHealthView fallback (per PR H)
// ---------------------------------------------------------------------------

export type DotColor = 'cyan' | 'gold' | 'magenta' | 'violet' | 'white';

export type ActivityRow = {
  color: DotColor;
  text: string;
  time: string;
  highlight?: boolean;
  action?: 'inbox';
};

export const activityFeed: ActivityRow[] = [
  { color: 'cyan', text: 'PermitWatcher · Sacramento County · new event', time: '12s ago' },
  { color: 'gold', text: 'Qualifier · qualified · $4.2M commercial new-build', time: '18s ago' },
  { color: 'gold', text: 'Enricher · resolved GC contact · Ethan Builders LLC', time: '34s ago' },
  { color: 'magenta', text: 'Briefer · brief drafted · ready for review', time: '48s ago' },
  { color: 'white', text: 'Delivery · report sent to Pathfinder · #842', time: '52s ago' },
  {
    color: 'gold',
    text: 'Architect · proposed new source · Travis County, TX',
    time: '2m ago',
    highlight: true,
    action: 'inbox',
  },
  { color: 'gold', text: 'CompetitiveIntel · incumbent identified · Allied Sec', time: '3m ago' },
  { color: 'magenta', text: 'Verifier · flagged for human review · #831', time: '5m ago' },
  { color: 'cyan', text: 'PermitWatcher · Phoenix · new event', time: '6m ago' },
  { color: 'gold', text: 'GeoMapper · resolved coordinates · #840', time: '7m ago' },
];

export const placeholderExamples = [
  'construction sites that just got permits over $1M in Texas, so I can sell them temporary security services',
  'restaurants opening within 30 days in cities where I distribute kitchen equipment',
  'M&A announcements where the acquirer has a finance ops gap I can fill',
];

export type TestStatus = 'pass' | 'fail' | 'warn';

export type TestEvent = {
  status: TestStatus;
  id: string;
  jurisdiction: string;
  in: string;
  out: string;
};

export const subcontractorIntelTests: TestEvent[] = [
  {
    status: 'pass',
    id: '2024-09-1834',
    jurisdiction: 'Sacramento County',
    in: "{ project: 'commercial new', value: $4.2M, gc: 'Ethan Builders' }",
    out: "{ subcontractor_relationship: { name: 'Allied Sec', confidence: 0.87 } }",
  },
  {
    status: 'pass',
    id: '2024-09-1809',
    jurisdiction: 'Phoenix',
    in: "{ project: 'commercial new', value: $1.8M, gc: 'Mountain GC' }",
    out: '{ subcontractor_relationship: null, confidence: 0.91 }',
  },
  {
    status: 'fail',
    id: '2024-09-1791',
    jurisdiction: 'Austin',
    in: "{ project: 'industrial', value: $12M, gc: 'Reliant Industrial' }",
    out: 'ERROR: input format unexpected (industrial type not handled)',
  },
  {
    status: 'pass',
    id: '2024-09-1772',
    jurisdiction: 'Sacramento County',
    in: "{ project: 'commercial reno', value: $620k, gc: 'Sacramento Renovations' }",
    out: "{ subcontractor_relationship: { name: 'CA Site Security', confidence: 0.62 } }",
  },
  {
    status: 'warn',
    id: '2024-09-1758',
    jurisdiction: 'Sacramento County',
    in: "{ project: 'commercial new', value: $2.3M, gc: 'Mid-State Builders' }",
    out: 'WARNING: low confidence (0.41) on subcontractor identification',
  },
  {
    status: 'pass',
    id: '2024-09-1741',
    jurisdiction: 'San Diego County',
    in: "{ project: 'commercial new', value: $5.7M, gc: 'Pacific Build Co' }",
    out: "{ subcontractor_relationship: { name: 'SoCal Watch', confidence: 0.79 } }",
  },
  {
    status: 'pass',
    id: '2024-09-1724',
    jurisdiction: 'Phoenix',
    in: "{ project: 'commercial new', value: $980k, gc: 'Sun Valley GC' }",
    out: '{ subcontractor_relationship: null, confidence: 0.84 }',
  },
  {
    status: 'pass',
    id: '2024-09-1709',
    jurisdiction: 'Sacramento County',
    in: "{ project: 'commercial new', value: $3.4M, gc: 'River City Build' }",
    out: "{ subcontractor_relationship: { name: 'Allied Sec', confidence: 0.88 } }",
  },
  {
    status: 'pass',
    id: '2024-09-1688',
    jurisdiction: 'Reno',
    in: "{ project: 'commercial reno', value: $720k, gc: 'High Sierra Build' }",
    out: '{ subcontractor_relationship: null, confidence: 0.92 }',
  },
  {
    status: 'pass',
    id: '2024-09-1672',
    jurisdiction: 'Sacramento County',
    in: "{ project: 'commercial new', value: $6.1M, gc: 'Capital City GC' }",
    out: "{ subcontractor_relationship: { name: 'Allied Sec', confidence: 0.81 } }",
  },
];

export const enricherTests: TestEvent[] = [
  {
    status: 'pass',
    id: '2024-09-1834',
    jurisdiction: 'Sacramento County',
    in: "{ qualified: true, project: '$4.2M commercial new', gc: 'Ethan Builders LLC' }",
    out: "{ gc_contact: 'mark@ethanbuilders.co', owner: 'Broadway Partners', timeline: 'Q1 2025', adjacent_needs: ['fencing', 'temp-power'] }",
  },
  {
    status: 'pass',
    id: '2024-09-1809',
    jurisdiction: 'Phoenix',
    in: "{ qualified: true, project: '$1.8M commercial new', gc: 'Mountain GC' }",
    out: "{ gc_contact: null, owner: 'Phoenix Capital', timeline: 'unknown', adjacent_needs: ['security'] }",
  },
  {
    status: 'warn',
    id: '2024-09-1791',
    jurisdiction: 'Austin',
    in: "{ qualified: true, project: '$12M industrial', gc: 'Reliant Industrial' }",
    out: 'WARNING: confidence 0.42, contractor_name not in source data',
  },
  {
    status: 'fail',
    id: '2024-09-1758',
    jurisdiction: 'Sacramento County',
    in: "{ qualified: true, project: '$2.3M commercial new', gc: 'Mid-State' }",
    out: 'ERROR: Sonar Pro rate limit reached, retried 3x, abandoned',
  },
  {
    status: 'pass',
    id: '2024-09-1741',
    jurisdiction: 'San Diego County',
    in: "{ qualified: true, project: '$5.7M commercial new', gc: 'Pacific Build Co' }",
    out: "{ gc_contact: 'lee@pacificbuild.co', owner: 'Coastal Holdings', timeline: 'Q2 2025', adjacent_needs: ['security', 'fencing'] }",
  },
  {
    status: 'pass',
    id: '2024-09-1724',
    jurisdiction: 'Phoenix',
    in: "{ qualified: true, project: '$980k commercial new', gc: 'Sun Valley GC' }",
    out: "{ gc_contact: 'ops@sunvalleygc.com', owner: 'Sun Valley LLC', timeline: 'Q1 2025', adjacent_needs: ['temp-power'] }",
  },
  {
    status: 'pass',
    id: '2024-09-1709',
    jurisdiction: 'Sacramento County',
    in: "{ qualified: true, project: '$3.4M commercial new', gc: 'River City Build' }",
    out: "{ gc_contact: 'pm@rivercity.build', owner: 'Riverwalk Group', timeline: 'Q1 2025', adjacent_needs: ['security'] }",
  },
  {
    status: 'pass',
    id: '2024-09-1688',
    jurisdiction: 'Reno',
    in: "{ qualified: true, project: '$720k commercial reno', gc: 'High Sierra Build' }",
    out: "{ gc_contact: 'projects@highsierra.co', owner: 'Sierra Properties', timeline: 'Q4 2024', adjacent_needs: [] }",
  },
  {
    status: 'pass',
    id: '2024-09-1672',
    jurisdiction: 'Sacramento County',
    in: "{ qualified: true, project: '$6.1M commercial new', gc: 'Capital City GC' }",
    out: "{ gc_contact: 'biz@capitalcity.gc', owner: 'Capital Holdings', timeline: 'Q2 2025', adjacent_needs: ['fencing', 'temp-power'] }",
  },
  {
    status: 'pass',
    id: '2024-09-1655',
    jurisdiction: 'Boise',
    in: "{ qualified: true, project: '$1.4M commercial new', gc: 'Treasure Valley Build' }",
    out: "{ gc_contact: 'ops@treasurevalley.gc', owner: 'TV Capital', timeline: 'Q1 2025', adjacent_needs: ['security'] }",
  },
];

export const sourceAnalysis = {
  sourceType: 'Socrata-style JSON API · structured · auto-onboardable',
  watcher: {
    name: 'SacramentoCountyPermitWatcher',
    layer: 'Watchers (Layer 2)',
    adapter: 'Socrata REST adapter',
    pollCadence: 'every 60 minutes',
  },
  schemaMapping: [
    { status: '✓', text: 'permit_id → event.source_id' },
    { status: '✓', text: 'filing_date → event.timestamp' },
    { status: '✓', text: 'valuation → event.project_value' },
    { status: '✓', text: 'description → event.raw_text' },
    { status: '⚠', text: 'contractor_name → not present, will resolve via Enricher' },
  ] as const,
  sampleFetch: [
    'permit_id: 2024-09-1834 · $4,200,000 · 1248 Broadway · 2024-09-22',
    'permit_id: 2024-09-1809 · $1,850,000 · 880 J Street · 2024-09-22',
    'permit_id: 2024-09-1791 · $12,400,000 · 4400 Folsom Blvd · 2024-09-21',
    'permit_id: 2024-09-1772 · $620,000 · 1199 R Street · 2024-09-21',
    'permit_id: 2024-09-1758 · $2,300,000 · 700 H Street · 2024-09-21',
  ],
  confidence: '0.94',
};

export type EditVersion = {
  id: string;
  label: string;
  current?: boolean;
  when: string;
  byline: string;
  message: string;
  diffMinus: string;
  diffPlus: string;
};

export const enricherVersions: EditVersion[] = [
  {
    id: 'v7',
    label: 'v7 · current',
    current: true,
    when: 'today, 14:22',
    byline: 'modified by Kyle',
    message: '"tightened Sonar depth to 3 hops"',
    diffMinus: 'Use Perplexity Sonar Pro with max search depth of 5 hops.',
    diffPlus: 'Use Perplexity Sonar Pro with max search depth of 3 hops.',
  },
  {
    id: 'v6',
    label: 'v6',
    when: 'yesterday, 09:11',
    byline: 'modified by Architect',
    message: 'auto-tuned for cost',
    diffMinus: 'Use Perplexity Sonar Reasoning for all enrichment paths.',
    diffPlus: 'Use Perplexity Sonar Pro for primary, fallback to Sonar.',
  },
  {
    id: 'v5',
    label: 'v5',
    when: '3 days ago',
    byline: 'modified by Kyle',
    message: '"added security keyword detection"',
    diffMinus: 'Output: enriched event with gc_contact, owner, timeline.',
    diffPlus: 'Output: enriched event with gc_contact, owner, timeline, adjacent_needs.',
  },
  {
    id: 'v4',
    label: 'v4',
    when: '1 week ago',
    byline: 'modified by Kyle',
    message: '"initial deployment"',
    diffMinus: '',
    diffPlus: 'Receive a qualified construction event from Qualifier. Resolve contacts, owner, timeline.',
  },
];

export const enricherInitialInstruction = `Receive a qualified construction event from Qualifier.
Resolve the General Contractor's primary contact, the
project owner, the project timeline, and any
adjacent-need indicators (security, fencing, temp
power). Use Perplexity Sonar Pro for web grounding.
Output an enriched event ready for routing to GeoMapper
and AdjacencyMapper.`;

import type { InngestHealthPayload } from '../lib/contracts/inngestHealth';

/**
 * Static fixture used by InngestHealthView in mock-mode (the default,
 * when `/api/inngest/health` returns `configured: false` or fails).
 *
 * Built as a function so timestamps are fresh on every call.
 */
export function inngestHealthMock(): InngestHealthPayload {
  const now = new Date();
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
  const ahead = (ms: number) => new Date(now.getTime() + ms).toISOString();
  return {
    generated_at: now.toISOString(),
    functions: [
      {
        id: 'metacron/sync-hubspot-hourly',
        name: 'Sync HubSpot (hourly)',
        cron: '0 * * * *',
        cron_cadence: 'hourly',
      },
      {
        id: 'metacron/daily-digest',
        name: 'Daily digest',
        cron: '0 13 * * *',
        cron_cadence: 'daily',
      },
      {
        id: 'metacron/architect-proposal-evaluator',
        name: 'Architect proposal evaluator',
        cron: null,
        cron_cadence: null,
      },
      {
        id: 'metacron/connector-audit-rollup',
        name: 'Connector audit rollup',
        cron: '*/15 * * * *',
        cron_cadence: 'custom',
      },
    ],
    recent_runs: [
      // hubspot — healthy, last success 12 min ago
      { run_id: 'r1', function_id: 'metacron/sync-hubspot-hourly', status: 'completed', started_at: ago(12 * 60 * 1000), ended_at: ago(11 * 60 * 1000) },
      { run_id: 'r2', function_id: 'metacron/sync-hubspot-hourly', status: 'completed', started_at: ago(72 * 60 * 1000), ended_at: ago(71 * 60 * 1000) },
      { run_id: 'r3', function_id: 'metacron/sync-hubspot-hourly', status: 'completed', started_at: ago(132 * 60 * 1000), ended_at: ago(131 * 60 * 1000) },
      // daily digest — healthy
      { run_id: 'r4', function_id: 'metacron/daily-digest', status: 'completed', started_at: ago(20 * 60 * 60 * 1000), ended_at: ago(20 * 60 * 60 * 1000 - 60_000) },
      // architect evaluator — failing 3/4 in last 24h (red)
      { run_id: 'r5', function_id: 'metacron/architect-proposal-evaluator', status: 'failed', started_at: ago(2 * 60 * 60 * 1000), ended_at: ago(2 * 60 * 60 * 1000) },
      { run_id: 'r6', function_id: 'metacron/architect-proposal-evaluator', status: 'failed', started_at: ago(5 * 60 * 60 * 1000), ended_at: ago(5 * 60 * 60 * 1000) },
      { run_id: 'r7', function_id: 'metacron/architect-proposal-evaluator', status: 'failed', started_at: ago(9 * 60 * 60 * 1000), ended_at: ago(9 * 60 * 60 * 1000) },
      { run_id: 'r8', function_id: 'metacron/architect-proposal-evaluator', status: 'completed', started_at: ago(13 * 60 * 60 * 1000), ended_at: ago(13 * 60 * 60 * 1000) },
      // connector-audit-rollup — healthy
      { run_id: 'r9', function_id: 'metacron/connector-audit-rollup', status: 'completed', started_at: ago(8 * 60 * 1000), ended_at: ago(7 * 60 * 1000) },
      { run_id: 'r10', function_id: 'metacron/connector-audit-rollup', status: 'completed', started_at: ago(23 * 60 * 1000), ended_at: ago(22 * 60 * 1000) },
    ],
    schedules: [
      { function_id: 'metacron/sync-hubspot-hourly', next_run_at: ahead(48 * 60 * 1000) },
      { function_id: 'metacron/daily-digest', next_run_at: ahead(4 * 60 * 60 * 1000) },
      { function_id: 'metacron/connector-audit-rollup', next_run_at: ahead(7 * 60 * 1000) },
    ],
  };
}

// ---------------------------------------------------------------------------
// Section A residue — restored 2026-05-11 as part of revert(PR #280).
//
// PR #280 stripped customersClient mock fallbacks but the "real" replacement
// queries reference columns that don't exist on pathfinder.* tables
// (organization_id never landed per Phase 2A SPEC; projects.created_at
// missing entirely; data_sources.enabled missing). Customer Detail errored
// on every load. PR #286 then deleted these exports as cleanup.
// Restoring just the two exports customersClient.ts needs to compile until
// Phase 2A schema completion ships and getOrgHealth can be rewritten
// against real columns.
// ---------------------------------------------------------------------------

import type {
  CustomerOrg as CustomerOrgRestored,
  OrgHealthRollup as OrgHealthRollupRestored,
} from '../lib/contracts/customers';

export const customersMock: CustomerOrgRestored[] = [
  {
    id: 'zedcor',
    slug: 'zedcor',
    display_name: 'Zedcor Security Solutions',
    status: 'active',
    onboarded_at: '2026-04-01T00:00:00.000Z',
    primary_contact_email: 'ops@zedcor.example.com',
    architecture: null,
  },
];

const ZEDCOR_LEAD_VOLUME_30D_RESTORED = [
  18, 22, 16, 24, 27, 19, 14, 21, 25, 30, 23, 18, 16, 28, 31, 26, 22, 19, 24,
  29, 33, 27, 21, 18, 26, 32, 35, 28, 24, 30,
];

const ZEDCOR_ERROR_VOLUME_30D_RESTORED = [
  1, 0, 2, 1, 0, 0, 1, 0, 1, 2, 0, 0, 1, 0, 0, 1, 1, 0, 0, 2, 1, 0, 0, 1, 0, 0,
  1, 0, 1, 1,
];

export const customerHealthMock: OrgHealthRollupRestored = {
  org_id: 'zedcor',
  lead_volume_30d: ZEDCOR_LEAD_VOLUME_30D_RESTORED,
  lead_volume_7d_total: ZEDCOR_LEAD_VOLUME_30D_RESTORED.slice(-7).reduce(
    (a, b) => a + b,
    0,
  ),
  lead_volume_30d_total: ZEDCOR_LEAD_VOLUME_30D_RESTORED.reduce((a, b) => a + b, 0),
  high_score_rate_7d: 0.34,
  outreach_delivery_rate_7d: 0.86,
  error_volume_30d: ZEDCOR_ERROR_VOLUME_30D_RESTORED,
  error_total_7d: ZEDCOR_ERROR_VOLUME_30D_RESTORED.slice(-7).reduce(
    (a, b) => a + b,
    0,
  ),
  error_rate_7d: 0.018,
  recent_errors: [
    {
      agent_name: 'Enricher',
      message: 'Sonar Pro rate limit reached, retried 3x, abandoned',
      created_at: '2026-05-02T14:11:00.000Z',
    },
    {
      agent_name: 'OutreachDrafter',
      message: 'HubSpot push failed: 429 — retry queued',
      created_at: '2026-05-01T22:08:00.000Z',
    },
    {
      agent_name: 'GeoMapper',
      message: 'Address geocode failed for project #1834',
      created_at: '2026-05-01T11:42:00.000Z',
    },
  ],
  active_sources: [
    {
      id: 'src-1',
      type: 'permits',
      label: 'Allegheny County permits',
      jurisdiction: 'Allegheny County, PA',
    },
    {
      id: 'src-2',
      type: 'permits',
      label: 'Pittsburgh DCP permits',
      jurisdiction: 'Pittsburgh, PA',
    },
    {
      id: 'src-3',
      type: 'sam_gov',
      label: 'SAM.gov NAICS 23',
      jurisdiction: 'US national',
    },
    {
      id: 'src-4',
      type: 'news',
      label: 'Pittsburgh metro construction news',
      jurisdiction: 'Pittsburgh metro',
    },
  ],
};
