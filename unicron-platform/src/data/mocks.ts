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

export type ProposalType = 'SOURCE DISCOVERY' | 'AGENT PROPOSAL' | 'TUNING SUGGESTION';
export type ProposalCategory = 'sources' | 'agents' | 'tuning';

export type Proposal = {
  id: string;
  type: ProposalType;
  category: ProposalCategory;
  typeColor: DotColor;
  time: string;
  headline: string;
  body: string;
  details: { k: string; v: string }[];
};

export const proposals: Proposal[] = [
  {
    id: 'p1',
    type: 'SOURCE DISCOVERY',
    category: 'sources',
    typeColor: 'cyan',
    time: '8m ago',
    headline: 'Add Travis County, TX to your watcher pool',
    body: "23% of qualified leads in the last 7 days reference projects in Travis County, TX, but you're not watching that jurisdiction directly. Adding it would surface those signals at parity with the rest of your coverage.",
    details: [
      { k: 'source', v: 'Travis County permit portal' },
      { k: 'source type', v: 'Socrata API (auto-onboardable)' },
      { k: 'estimated daily', v: '110 new permits' },
      { k: 'estimated qualified', v: '4 to 7 leads/day' },
      { k: 'confidence', v: '0.91' },
    ],
  },
  {
    id: 'p2',
    type: 'AGENT PROPOSAL',
    category: 'agents',
    typeColor: 'gold',
    time: '18m ago',
    headline: 'Add a SubcontractorIntel agent at the signal layer',
    body: 'Your Enricher resolves GC contacts well, but Outreach response rate is 31% lower for projects where the GC routes security through a single subcontractor. A SubcontractorIntel agent would surface that relationship pattern before draft.',
    details: [
      { k: 'layer', v: 'signal (Layer 3)' },
      { k: 'proposed inputs', v: 'qualified events from GeoMapper' },
      { k: 'proposed outputs', v: 'enriched events with sub-relationship' },
      { k: 'estimated impact', v: '+18% reply rate on outreach' },
      { k: 'confidence', v: '0.74' },
    ],
  },
  {
    id: 'p3',
    type: 'TUNING SUGGESTION',
    category: 'tuning',
    typeColor: 'magenta',
    time: '44m ago',
    headline: "Tighten GeoMapper's radius constraint to 20mi",
    body: '7 leads in the last week were marked "wrong-geography" by your team. Tightening GeoMapper\'s project radius from 50mi to 20mi would have prevented 6 of those.',
    details: [
      { k: 'agent', v: 'GeoMapper · Layer 3' },
      { k: 'current rule', v: 'radius 50mi from project address' },
      { k: 'proposed rule', v: 'radius 20mi from project address' },
      { k: 'shadow test result', v: '-84% wrong-geo, -3% total volume' },
      { k: 'confidence', v: '0.88' },
    ],
  },
];

export const placeholderExamples = [
  'construction sites that just got permits over $1M in Texas, so I can sell them temporary security services',
  'restaurants opening within 30 days in cities where I distribute kitchen equipment',
  'M&A announcements where the acquirer has a finance ops gap I can fill',
];

export const decompositionLines: string[] = [
  'BUYER',
  '  distributors of temporary construction-site security',
  '',
  'BUYING SIGNAL',
  '  large new commercial construction permits, value > $1M,',
  '  no permanent security on file with the GC',
  '',
  'PUBLIC DATA EXPOSING SIGNAL',
  '  ✓ municipal permit feeds (commercial new-build, $1M threshold)',
  '  ✓ federal procurement (sam.gov, NAICS 23 construction)',
  '  ✓ news (groundbreakings, project announcements)',
  '  ✓ entity formation (construction LLCs in target geos)',
  '  ✗ land transactions (low signal-to-noise for this use case)',
  '',
  'PROPOSED ARCHITECTURE',
  '  Layer 2 watchers   PermitWatcher · SAMWatcher · NewsWatcher · EntityWatcher',
  '  Layer 3 signal     Qualifier · Enricher · GeoMapper · CompetitiveIntel',
  '  Layer 4 synthesis  Ranker · OutreachDrafter · Briefer',
  '',
  'ESTIMATES',
  '  daily volume after vetting     40 to 90 leads',
];

export const decompositionConfidence = '  architecture confidence        0.83';
export const decompositionCostLine =
  '  estimated cost per lead        $0.06    [INTERNAL ONLY]';

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

// ---------------------------------------------------------------------------
// Coverage Expansion (Stream M1) fixtures.
//
// Mirrors the wire shape from `Pathfinder/services/coverage-expansion/types.ts`
// and `Pathfinder/supabase/migrations/0081_coverage_expansion.sql`. Used by
// `src/lib/coverageClient.ts` mock-mode path and the modal-tests in
// `__tests__/agents/coverage/`.
// ---------------------------------------------------------------------------

import type {
  CoverageGoal,
  CoverageGoalCandidate,
  CoverageGoalDetail,
} from '../lib/contracts/coverage';
import type { AgentDispatch } from '../lib/contracts/agentConsole';

const PITTSBURGH_GOAL_ID = '11111111-1111-4111-8111-111111111111';
const HOUSTON_GOAL_ID = '22222222-2222-4222-8222-222222222222';
const LA_GOAL_ID = '33333333-3333-4333-8333-333333333333';

export const coverageGoalsMock: CoverageGoal[] = [
  {
    id: PITTSBURGH_GOAL_ID,
    vertical_id: 'pathfinder-default',
    goal_text:
      'Expand Pittsburgh metro coverage for construction-security signal — target 50 additional qualified leads / week.',
    scope_constraints: {
      geography: ['Pittsburgh, PA', 'Allegheny County'],
      source_types: ['socrata', 'rest', 'rss'],
      max_sources: 12,
      lookback_days: 30,
      signal_keywords: ['construction', 'security', 'permit', 'commercial new'],
      target_lead_count: 50,
    },
    budget_usd: 50,
    timeout_hours: 24,
    status: 'completed',
    estimate: {
      discovered_candidates: 9,
      estimated_auto_onboardable: 3,
      estimated_human_assist: 5,
      estimated_declined: 1,
      estimated_daily_lift: 7.4,
      estimated_total_cost_usd: 32.8,
      estimated_duration_hours: { low: 1, high: 4 },
      candidates: [
        {
          candidate_url: 'https://data.alleghenycounty.us/permits',
          candidate_type: 'socrata',
          estimated_impact: 4.1,
          estimated_tier: 1,
          jurisdiction: 'Allegheny County, PA',
          notes: 'Socrata-style; valuation field present.',
        },
        {
          candidate_url: 'https://pittsburghpa.gov/dcp/permits',
          candidate_type: 'rest',
          estimated_impact: 2.0,
          estimated_tier: 1,
          jurisdiction: 'Pittsburgh, PA',
          notes: 'REST JSON with auth header, manageable.',
        },
        {
          candidate_url: 'https://upmcconstruction.example.com/rss',
          candidate_type: 'rss',
          estimated_impact: 0.6,
          estimated_tier: 2,
          jurisdiction: 'Pittsburgh, PA',
          notes: 'Free-text feed; needs parser hint.',
        },
      ],
    },
    total_cost_usd: 28.1,
    total_sources_onboarded: 2,
    total_sources_assist_queued: 5,
    total_sources_declined: 1,
    total_estimated_lift: 6.8,
    agent_session_id: 'sess-pgh-coverage-7c1',
    started_at: '2026-04-30T14:02:00.000Z',
    completed_at: '2026-04-30T15:34:00.000Z',
    created_at: '2026-04-30T13:59:12.000Z',
    updated_at: '2026-04-30T15:34:08.000Z',
    created_by_user_email: 'kyle@demystified.ai',
  },
  {
    id: HOUSTON_GOAL_ID,
    vertical_id: 'pathfinder-default',
    goal_text:
      'Houston multi-county sweep for construction-security — coverage for Harris + Fort Bend + Montgomery.',
    scope_constraints: {
      geography: ['Harris County, TX', 'Fort Bend County, TX', 'Montgomery County, TX'],
      source_types: ['socrata', 'rest'],
      max_sources: 16,
      lookback_days: 60,
      signal_keywords: ['construction', 'security', 'commercial', 'industrial'],
      target_lead_count: 90,
    },
    budget_usd: 75,
    timeout_hours: 24,
    status: 'running',
    estimate: {
      discovered_candidates: 14,
      estimated_auto_onboardable: 5,
      estimated_human_assist: 7,
      estimated_declined: 2,
      estimated_daily_lift: 11.2,
      estimated_total_cost_usd: 58.0,
      estimated_duration_hours: { low: 2, high: 6 },
      candidates: [],
    },
    total_cost_usd: 18.4,
    total_sources_onboarded: 1,
    total_sources_assist_queued: 2,
    total_sources_declined: 0,
    total_estimated_lift: 4.0,
    agent_session_id: 'sess-hou-coverage-8d2',
    started_at: '2026-05-01T17:21:00.000Z',
    completed_at: null,
    created_at: '2026-05-01T17:18:44.000Z',
    updated_at: '2026-05-02T09:11:08.000Z',
    created_by_user_email: 'kyle@demystified.ai',
  },
  {
    id: LA_GOAL_ID,
    vertical_id: 'pathfinder-default',
    goal_text: 'Los Angeles county pilot — initial Tier 1 coverage only.',
    scope_constraints: {
      geography: ['Los Angeles County, CA'],
      source_types: ['socrata'],
      max_sources: 6,
      lookback_days: 14,
      signal_keywords: ['commercial new', 'permit'],
      target_lead_count: 25,
    },
    budget_usd: 25,
    timeout_hours: 12,
    status: 'estimating',
    estimate: null,
    total_cost_usd: 0,
    total_sources_onboarded: 0,
    total_sources_assist_queued: 0,
    total_sources_declined: 0,
    total_estimated_lift: 0,
    agent_session_id: null,
    started_at: null,
    completed_at: null,
    created_at: '2026-05-02T16:00:00.000Z',
    updated_at: '2026-05-02T16:00:00.000Z',
    created_by_user_email: 'kyle@demystified.ai',
  },
];

const PITTSBURGH_CANDIDATES: CoverageGoalCandidate[] = [
  {
    id: 'cand-pgh-1',
    goal_id: PITTSBURGH_GOAL_ID,
    candidate_url: 'https://data.alleghenycounty.us/permits',
    candidate_type: 'socrata',
    estimated_impact: 4.1,
    estimated_tier: 1,
    status: 'onboarded',
    source_onboarder_session_id: 'sess-onboard-9a1',
    data_source_id: 'src-allegheny-permits',
    result_payload: { adapter_kind: 'socrata', schema_fields: 22 },
    dispatched_at: '2026-04-30T14:04:00.000Z',
    resolved_at: '2026-04-30T14:08:00.000Z',
    created_at: '2026-04-30T14:02:14.000Z',
  },
  {
    id: 'cand-pgh-2',
    goal_id: PITTSBURGH_GOAL_ID,
    candidate_url: 'https://pittsburghpa.gov/dcp/permits',
    candidate_type: 'rest',
    estimated_impact: 2.0,
    estimated_tier: 1,
    status: 'onboarded',
    source_onboarder_session_id: 'sess-onboard-9a2',
    data_source_id: 'src-pgh-dcp',
    result_payload: { adapter_kind: 'rest', schema_fields: 17 },
    dispatched_at: '2026-04-30T14:09:00.000Z',
    resolved_at: '2026-04-30T14:14:00.000Z',
    created_at: '2026-04-30T14:02:14.000Z',
  },
  {
    id: 'cand-pgh-3',
    goal_id: PITTSBURGH_GOAL_ID,
    candidate_url: 'https://upmcconstruction.example.com/rss',
    candidate_type: 'rss',
    estimated_impact: 0.6,
    estimated_tier: 2,
    status: 'assist_queued',
    source_onboarder_session_id: 'sess-onboard-9a3',
    data_source_id: null,
    result_payload: { ticket_id: 'ticket-pgh-rss-1', reason: 'free-text rss; parser hint required' },
    dispatched_at: '2026-04-30T14:15:00.000Z',
    resolved_at: null,
    created_at: '2026-04-30T14:02:14.000Z',
  },
];

export function buildCoverageGoalDetailMock(id: string): CoverageGoalDetail {
  const goal = coverageGoalsMock.find((g) => g.id === id) ?? coverageGoalsMock[0];
  if (id === PITTSBURGH_GOAL_ID) return { goal, candidates: PITTSBURGH_CANDIDATES };
  return { goal, candidates: [] };
}

/** Used by the modal's "tab to a prior run" path and the history grid. */
export const coverageDispatchesMock: AgentDispatch[] = [
  {
    id: 'disp-coverage-pgh',
    agent_name: 'coverage-expansion',
    customer_org_id: 'pathfinder-default',
    dispatched_by_user_id: null,
    input_payload: {
      goal_text: coverageGoalsMock[0].goal_text,
      scope_constraints: coverageGoalsMock[0].scope_constraints,
      budget_usd: 50,
      summary: 'Pittsburgh, PA · 50 leads · construction-security',
    },
    status: 'verified',
    result_payload: {
      goal_id: PITTSBURGH_GOAL_ID,
      summary:
        '2 Tier 1 sources onboarded · 1 Tier 2 queued · est. +6.8 leads/day',
      total_sources_onboarded: 2,
      total_sources_assist_queued: 1,
      total_sources_declined: 0,
      total_estimated_lift: 6.8,
    },
    rejection_reason: null,
    verified_by_user_id: 'mock-operator',
    verified_at: '2026-04-30T15:36:00.000Z',
    cost_usd: 28.1,
    duration_ms: 5_580_000,
    agent_run_id: null,
    parent_dispatch_id: null,
    created_at: '2026-04-30T13:59:12.000Z',
    updated_at: '2026-04-30T15:36:00.000Z',
  },
  {
    id: 'disp-coverage-hou',
    agent_name: 'coverage-expansion',
    customer_org_id: 'pathfinder-default',
    dispatched_by_user_id: null,
    input_payload: {
      goal_text: coverageGoalsMock[1].goal_text,
      scope_constraints: coverageGoalsMock[1].scope_constraints,
      budget_usd: 75,
      summary: 'Houston metro · 90 leads · construction-security',
    },
    status: 'running',
    result_payload: null,
    rejection_reason: null,
    verified_by_user_id: null,
    verified_at: null,
    cost_usd: 18.4,
    duration_ms: null,
    agent_run_id: null,
    parent_dispatch_id: null,
    created_at: '2026-05-01T17:18:44.000Z',
    updated_at: '2026-05-02T09:11:08.000Z',
  },
];

/**
 * Streamed candidate-discovery events the mock-mode modal walks through to
 * simulate the live execution panel filling up. Event types match
 * `unicron.agent_dispatch_events` so the UI looks identical to real-mode.
 */
export const coverageMockLiveEvents: ReadonlyArray<{
  delayMs: number;
  event_type: 'reasoning' | 'tool_call' | 'tool_result' | 'partial_output' | 'decision';
  payload: Record<string, unknown>;
}> = [
  { delayMs: 250, event_type: 'reasoning', payload: { text: 'Decomposing goal → metro + signal keywords + lookback.' } },
  { delayMs: 350, event_type: 'tool_call', payload: { tool: 'discover-candidates', args: { metro: 'Pittsburgh, PA' } } },
  { delayMs: 600, event_type: 'tool_result', payload: { discovered_candidates: 9 } },
  { delayMs: 250, event_type: 'reasoning', payload: { text: 'Tier-1 auto-onboardable: 3. Tier-2 needs human assist: 5. Decline: 1.' } },
  { delayMs: 350, event_type: 'partial_output', payload: { candidate: { url: 'https://data.alleghenycounty.us/permits', tier: 1 } } },
  { delayMs: 350, event_type: 'partial_output', payload: { candidate: { url: 'https://pittsburghpa.gov/dcp/permits', tier: 1 } } },
  { delayMs: 350, event_type: 'partial_output', payload: { candidate: { url: 'https://upmcconstruction.example.com/rss', tier: 2 } } },
  { delayMs: 250, event_type: 'decision', payload: { text: 'Estimate ready. Awaiting operator review.' } },
];

// ---------------------------------------------------------------------------
// Source Onboarder (Stream M2) fixtures.
//
// Mirrors the wire shape from `Pathfinder/app/api/sources/onboard/route.ts` +
// `Pathfinder/app/api/architect/inbox/route.ts`. Used by `inboxClient.ts`
// mock-mode and the SourceOnboarderModal mock-runtime.
// ---------------------------------------------------------------------------

import type { InboxTicket } from '../lib/contracts/inbox';
import type { OnboardSyncResponse } from '../lib/contracts/sourceOnboarder';

export const sourceOnboarderDispatchesMock: AgentDispatch[] = [
  {
    id: 'disp-onboard-allegheny',
    agent_name: 'source-onboarder',
    customer_org_id: 'pathfinder-default',
    dispatched_by_user_id: null,
    input_payload: {
      url: 'https://data.alleghenycounty.us/permits',
      hint: 'socrata',
      jurisdiction: 'Allegheny County, PA',
      summary: 'Allegheny County · socrata · Tier 1 onboarded',
    },
    status: 'verified',
    result_payload: {
      status: 'live',
      source_id: 'src-allegheny-permits',
      adapter_kind: 'socrata',
      schema: { permit_id: 'string', filing_date: 'date', valuation: 'number', description: 'string' },
      summary: 'Tier 1 onboarded · adapter socrata · 22 schema fields',
    },
    rejection_reason: null,
    verified_by_user_id: 'mock-operator',
    verified_at: '2026-04-30T14:08:00.000Z',
    cost_usd: 1.42,
    duration_ms: 89_000,
    agent_run_id: null,
    parent_dispatch_id: null,
    created_at: '2026-04-30T14:04:00.000Z',
    updated_at: '2026-04-30T14:08:00.000Z',
  },
  {
    id: 'disp-onboard-upmc-rss',
    agent_name: 'source-onboarder',
    customer_org_id: 'pathfinder-default',
    dispatched_by_user_id: null,
    input_payload: {
      url: 'https://upmcconstruction.example.com/rss',
      hint: 'rss',
      jurisdiction: 'Pittsburgh, PA',
      summary: 'UPMC Construction · rss · Tier 2 escalated',
    },
    status: 'awaiting_review',
    result_payload: {
      status: 'human-assist',
      ticket_id: 'ticket-pgh-rss-1',
      reason: 'Free-text RSS feed; parser hint required to map item.description into structured fields.',
    },
    rejection_reason: null,
    verified_by_user_id: null,
    verified_at: null,
    cost_usd: 0.84,
    duration_ms: 64_000,
    agent_run_id: null,
    parent_dispatch_id: null,
    created_at: '2026-04-30T14:15:00.000Z',
    updated_at: '2026-04-30T14:16:04.000Z',
  },
];

export const inboxTicketsMock: InboxTicket[] = [
  {
    id: 'ticket-pgh-rss-1',
    category: 'source-discovery',
    candidate_url: 'https://upmcconstruction.example.com/rss',
    session_id: 'sess-onboard-9a3',
    source_id: null,
    reason: 'Free-text RSS feed; parser hint required to map item.description into structured fields.',
    hint: 'rss',
    jurisdiction: 'Pittsburgh, PA',
    status: 'open',
    resolved_at: null,
    resolved_by_user_email: null,
    resolution_note: null,
    created_at: '2026-04-30T14:15:00.000Z',
    payload: {
      sample_rss_title: 'New construction notice — Forbes Avenue medical office expansion',
    },
  },
  {
    id: 'ticket-austin-auth',
    category: 'source-discovery',
    candidate_url: 'https://services.austintexas.gov/permits.json',
    session_id: 'sess-onboard-9a4',
    source_id: null,
    reason: 'Endpoint returns 401 — likely needs Austin Open Data token. Operator: please supply api_key_env.',
    hint: 'rest',
    jurisdiction: 'Austin, TX',
    status: 'open',
    resolved_at: null,
    resolved_by_user_email: null,
    resolution_note: null,
    created_at: '2026-05-01T18:21:00.000Z',
    payload: {
      probe_response_status: 401,
    },
  },
];

export const sourceOnboarderMockOnboardResult: OnboardSyncResponse = {
  ok: true,
  status: 'live',
  source_id: 'src-mock-allegheny-permits',
  adapter_kind: 'socrata',
  schema: {
    permit_id: 'string',
    filing_date: 'timestamp',
    valuation: 'number',
    description: 'string',
    contractor_name: 'string',
  },
  first_event_at: '2026-05-02T17:42:11.000Z',
  session_id: 'sess-mock-onboard',
  cost_usd: 1.42,
  duration_ms: 87_000,
};

export const sourceOnboarderMockTier2Result: OnboardSyncResponse = {
  ok: true,
  status: 'human-assist',
  ticket_id: 'ticket-pgh-rss-1',
  reason: 'Free-text RSS feed; parser hint required.',
  session_id: 'sess-mock-onboard-rss',
  cost_usd: 0.84,
  duration_ms: 64_000,
};

// ---------------------------------------------------------------------------
// Architect Modal (Stream M4) fixtures.
//
// Three sub-modes — Decomposition, Tuning, Discovery. Mirrors the wire shape
// from `Pathfinder/app/api/architect/{decompose,tune,discover}/route.ts` via
// the contract types in `src/lib/contracts/architect.ts`.
// ---------------------------------------------------------------------------

import type {
  ArchitectProposalRow,
  DecompositionApiResponse,
  DiscoveryApiResponse,
  TuningApiResponse,
} from '../lib/contracts/architect';

export const architectDecompositionMock: DecompositionApiResponse = {
  proposal_id: 'prop-decomp-pittsburgh',
  session_id: 'sess-decomp-pittsburgh',
  architecture: {
    buyer: 'distributors of temporary construction-site security',
    buying_signal:
      'large new commercial construction permits, value > $1M, no permanent security on file with the GC',
    data_sources_proposed: [
      { type: 'permits', jurisdictions: ['Pittsburgh, PA', 'Allegheny County, PA'], expected_daily_volume: 110 },
      { type: 'sam_gov', jurisdictions: ['US national'], expected_daily_volume: 38 },
      { type: 'news', jurisdictions: ['Pittsburgh metro'], expected_daily_volume: 12 },
      { type: 'entity_formation', jurisdictions: ['PA'], expected_daily_volume: 6 },
    ],
    data_sources_rejected: [{ type: 'land_txn', reason: 'low signal-to-noise for this use case' }],
    layer_2_watchers: [
      { source_type: 'permits', instruction: 'Poll Allegheny County socrata feed; normalize new filings.' },
      { source_type: 'sam_gov', instruction: 'Watch NAICS 23 construction RFPs.' },
      { source_type: 'news', instruction: 'Pittsburgh-metro construction announcements.' },
    ],
    layer_3_agents: [
      { role: 'Qualifier', instruction: 'Filter to value > $1M commercial new-build.' },
      { role: 'Enricher', instruction: 'Resolve GC contact + project owner via Sonar Pro.' },
      { role: 'GeoMapper', instruction: 'Resolve address to lat/lon; filter within 25mi radius.' },
      { role: 'CompetitiveIntel', instruction: 'Identify incumbent security vendor on similar projects.' },
    ],
    layer_4_agents: [
      { role: 'Ranker', instruction: 'Score by value × no-incumbent × geography.' },
      { role: 'OutreachDrafter', instruction: 'Draft personalized outreach citing project + GC.' },
      { role: 'Briefer', instruction: 'Friday weekly brief.' },
    ],
    estimates: {
      daily_qualified_volume: 7,
      cost_per_lead_usd: 0.06,
      architecture_confidence: 'high',
    },
    open_questions: [
      'Should the GeoMapper radius default to 25mi or 50mi for this vertical?',
      'Adjacent-need detection — extend Enricher or split into AdjacencyMapper?',
    ],
  },
  reasoning: [
    'Buyer is upstream of construction; their signal is large new builds without permanent security.',
    'Permit feeds are the highest-signal public data source. Adding Allegheny + Pittsburgh covers ~95% of metro volume.',
    'sam.gov is supplementary for federal/military projects.',
    'News + entity-formation are corroborative, not primary.',
    'Recommend GeoMapper radius 25mi to keep Qualifier signal density high.',
  ],
  cost_usd: 0.42,
  duration_ms: 18_400,
  status: 'completed',
};

export const architectTuningMock: TuningApiResponse = {
  session_id: 'sess-tune-zedcor-2026-05',
  proposals: [
    {
      id: 'prop-tune-1',
      session_id: 'sess-tune-zedcor-2026-05',
      vertical_id: 'pathfinder-default',
      type: 'tuning_suggestion',
      status: 'pending',
      headline: 'Tighten GeoMapper radius from 50mi to 20mi',
      body:
        '7 wrong-geography reject markers in the last 7 days. Shadow test on 412 prior leads predicts -84% wrong-geo with -3% total volume.',
      details: {
        agent_role: 'GeoMapper',
        cluster_key: 'wrong-geo',
        cluster_count: 7,
        current_instruction: 'Filter projects within 50mi radius of branch.',
        proposed_instruction: 'Filter projects within 20mi radius of branch.',
        shadow_test: {
          sample_size: 412,
          wins: 24,
          losses: 1,
          side_effects: 12,
          win_rate: 0.96,
          side_effect_rate: 0.029,
          method: 'model_introspective_estimate',
        },
        confidence: 0.88,
        estimated_impact: '-84% wrong-geo, -3% total volume',
      },
      confidence: 0.88,
      resolved_at: null,
      resolved_by_user_email: null,
      resolution_notes: null,
      source_input_summary: null,
      created_at: '2026-05-02T15:11:00.000Z',
    } as ArchitectProposalRow,
    {
      id: 'prop-tune-2',
      session_id: 'sess-tune-zedcor-2026-05',
      vertical_id: 'pathfinder-default',
      type: 'tuning_suggestion',
      status: 'pending',
      headline: 'Add subcontractor-relationship feature to Ranker scoring',
      body:
        'Outreach reply rate is 31% lower for projects where the GC routes security through a single subcontractor. Adding that feature to the Ranker would deprioritize them in the queue.',
      details: {
        agent_role: 'Ranker',
        cluster_key: 'sub-route-low-reply',
        cluster_count: 14,
        current_instruction: 'Score by value × no-incumbent × geography.',
        proposed_instruction:
          'Score by value × no-incumbent × geography × (1 - sub-route-probability).',
        shadow_test: {
          sample_size: 318,
          wins: 22,
          losses: 4,
          side_effects: 6,
          win_rate: 0.85,
          side_effect_rate: 0.019,
          method: 'model_introspective_estimate',
        },
        confidence: 0.74,
        estimated_impact: '+18% reply rate on outreach',
      },
      confidence: 0.74,
      resolved_at: null,
      resolved_by_user_email: null,
      resolution_notes: null,
      source_input_summary: null,
      created_at: '2026-05-02T15:11:00.000Z',
    } as ArchitectProposalRow,
  ],
  rejected: [
    {
      cluster_key: 'late-stage-bid',
      reason: 'Below shadow-test win threshold (0.62 < 0.70).',
    },
  ],
  summary: '2 tuning proposals (1 high-confidence GeoMapper change, 1 medium-confidence Ranker change), 1 rejected.',
  cost_usd: 0.18,
  duration_ms: 9_200,
  status: 'completed',
};

export const architectDiscoveryMock: DiscoveryApiResponse = {
  session_id: 'sess-discover-pittsburgh-metro',
  proposals: [
    {
      id: 'prop-disc-1',
      session_id: 'sess-discover-pittsburgh-metro',
      vertical_id: 'pathfinder-default',
      type: 'source_discovery',
      status: 'pending',
      headline: 'Allegheny County permit portal',
      body: 'Socrata-style API; auto-onboardable.',
      details: {
        candidate_jurisdiction: 'Allegheny County, PA',
        source_type: 'permits',
        source_url: 'https://data.alleghenycounty.us/permits',
        source_name: 'Allegheny County permits',
        tier: 'tier_1',
        reference_count: 42,
        reference_rate: 0.32,
        lift_per_day: 4.1,
        confidence: 0.94,
        reasoning:
          'High overlap with Pittsburgh metro construction signal; valuation field present in feed.',
      },
      confidence: 0.94,
      resolved_at: null,
      resolved_by_user_email: null,
      resolution_notes: null,
      source_input_summary: null,
      created_at: '2026-05-02T15:11:00.000Z',
    } as ArchitectProposalRow,
    {
      id: 'prop-disc-2',
      session_id: 'sess-discover-pittsburgh-metro',
      vertical_id: 'pathfinder-default',
      type: 'source_discovery',
      status: 'pending',
      headline: 'Pittsburgh DCP permits',
      body: 'REST JSON; manageable adapter.',
      details: {
        candidate_jurisdiction: 'Pittsburgh, PA',
        source_type: 'permits',
        source_url: 'https://pittsburghpa.gov/dcp/permits',
        source_name: 'Pittsburgh DCP permits',
        tier: 'tier_1',
        reference_count: 28,
        reference_rate: 0.21,
        lift_per_day: 2.0,
        confidence: 0.86,
        reasoning: 'Covers city-only filings; complements the county feed.',
      },
      confidence: 0.86,
      resolved_at: null,
      resolved_by_user_email: null,
      resolution_notes: null,
      source_input_summary: null,
      created_at: '2026-05-02T15:11:00.000Z',
    } as ArchitectProposalRow,
    {
      id: 'prop-disc-3',
      session_id: 'sess-discover-pittsburgh-metro',
      vertical_id: 'pathfinder-default',
      type: 'source_discovery',
      status: 'pending',
      headline: 'UPMC construction RSS',
      body: 'Free-text RSS; needs parser hint (Tier 2).',
      details: {
        candidate_jurisdiction: 'Pittsburgh, PA',
        source_type: 'news',
        source_url: 'https://upmcconstruction.example.com/rss',
        source_name: 'UPMC construction RSS',
        tier: 'tier_2',
        reference_count: 6,
        reference_rate: 0.18,
        lift_per_day: 0.6,
        confidence: 0.62,
        reasoning: 'Hospital-system construction feed; high-value when parsed correctly.',
      },
      confidence: 0.62,
      resolved_at: null,
      resolved_by_user_email: null,
      resolution_notes: null,
      source_input_summary: null,
      created_at: '2026-05-02T15:11:00.000Z',
    } as ArchitectProposalRow,
  ],
  rejected: [
    { candidate: 'pittsburghchamber.com/news', reason: 'Below reference_rate 0.15 threshold.' },
  ],
  summary: '3 candidates: 2 Tier 1 (auto-onboardable), 1 Tier 2 (operator review).',
  cost_usd: 0.31,
  duration_ms: 12_800,
  status: 'completed',
};

// ---------------------------------------------------------------------------
// Cross-Pollination Engine (Stream M5) fixtures.
//
// Mirrors Pathfinder/supabase/migrations/0101_zedcor_cross_pollination.sql.
// Used by `crossPollinationClient.ts` mock-mode + the M5 modal.
// ---------------------------------------------------------------------------

import type { CrossPollinationMatch } from '../lib/contracts/crossPollination';

export const crossPollinationMatchesMock: CrossPollinationMatch[] = [
  {
    id: 'xpoll-1',
    lead_id: 'lead-pgh-3401',
    customer_org_id: 'zedcor',
    customer_canonical: 'Brasfield & Gorrie',
    match_layer: 'exact',
    match_confidence: 0.97,
    primary_branch_id: 'branch-pit-007',
    primary_branch_name: 'Pittsburgh',
    branch_count: 14,
    active_site_count: 22,
    most_recent_site_date: '2026-04-28',
    national_account: true,
    matched_at: '2026-05-02T13:00:00.000Z',
    matched_field: 'prime_contractor',
    matched_value_raw: 'Brasfield & Gorrie LLC',
  },
  {
    id: 'xpoll-2',
    lead_id: 'lead-pgh-3401',
    customer_org_id: 'zedcor',
    customer_canonical: 'Big-D Construction',
    match_layer: 'fuzzy',
    match_confidence: 0.84,
    primary_branch_id: 'branch-hou-002',
    primary_branch_name: 'Houston',
    branch_count: 8,
    active_site_count: 6,
    most_recent_site_date: '2026-04-22',
    national_account: false,
    matched_at: '2026-05-02T13:00:00.000Z',
    matched_field: 'project_owner',
    matched_value_raw: 'BigD Construction',
  },
  {
    id: 'xpoll-3',
    lead_id: 'lead-pgh-3401',
    customer_org_id: 'zedcor',
    customer_canonical: 'Robins & Morton',
    match_layer: 'parent_company',
    match_confidence: 0.78,
    primary_branch_id: 'branch-nsh-006',
    primary_branch_name: 'Nashville',
    branch_count: 5,
    active_site_count: 3,
    most_recent_site_date: '2026-04-12',
    national_account: false,
    matched_at: '2026-05-02T13:00:00.000Z',
    matched_field: 'parent_company',
    matched_value_raw: 'Robins Morton Construction',
  },
  {
    id: 'xpoll-4',
    lead_id: 'lead-hou-2207',
    customer_org_id: 'zedcor',
    customer_canonical: 'JE Dunn Construction',
    match_layer: 'exact',
    match_confidence: 0.93,
    primary_branch_id: 'branch-hou-002',
    primary_branch_name: 'Houston',
    branch_count: 11,
    active_site_count: 18,
    most_recent_site_date: '2026-05-01',
    national_account: true,
    matched_at: '2026-05-02T13:00:00.000Z',
    matched_field: 'prime_contractor',
    matched_value_raw: 'JE Dunn Construction Group',
  },
  {
    id: 'xpoll-5',
    lead_id: 'lead-hou-2207',
    customer_org_id: 'zedcor',
    customer_canonical: 'Manhattan Construction',
    match_layer: 'fuzzy',
    match_confidence: 0.65,
    primary_branch_id: 'branch-hou-002',
    primary_branch_name: 'Houston',
    branch_count: 4,
    active_site_count: 2,
    most_recent_site_date: '2026-04-08',
    national_account: false,
    matched_at: '2026-05-02T13:00:00.000Z',
    matched_field: 'key_sub',
    matched_value_raw: 'Manhattan Construction Co',
  },
];

export const sourceOnboarderMockLiveEvents: ReadonlyArray<{
  delayMs: number;
  event_type: 'reasoning' | 'tool_call' | 'tool_result' | 'partial_output' | 'decision';
  payload: Record<string, unknown>;
}> = [
  { delayMs: 200, event_type: 'reasoning', payload: { text: 'Fetching robots.txt and probing endpoint shape.' } },
  { delayMs: 350, event_type: 'tool_call', payload: { tool: 'classify-source', args: { url: 'https://data.alleghenycounty.us/permits' } } },
  { delayMs: 500, event_type: 'tool_result', payload: { adapter_kind: 'socrata', confidence: 0.94 } },
  { delayMs: 250, event_type: 'reasoning', payload: { text: 'Identified Socrata-style API; inferring schema mapping.' } },
  { delayMs: 350, event_type: 'tool_call', payload: { tool: 'infer-schema', args: { adapter: 'socrata' } } },
  { delayMs: 600, event_type: 'tool_result', payload: { schema_fields: 22 } },
  { delayMs: 300, event_type: 'partial_output', payload: { adapter_preview: 'export const allegheny = socrata({ host: ..., resource: ... })' } },
  { delayMs: 250, event_type: 'tool_call', payload: { tool: 'run-test-fetch', args: {} } },
  { delayMs: 600, event_type: 'tool_result', payload: { test_event_count: 5 } },
  { delayMs: 250, event_type: 'decision', payload: { text: 'Tier 1 onboard succeeded. Awaiting operator commit.' } },
];

