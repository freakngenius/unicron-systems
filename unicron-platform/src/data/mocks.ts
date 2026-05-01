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
