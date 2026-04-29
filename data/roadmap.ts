export type RoadmapStatus =
  | 'live'
  | 'building'
  | 'planned'
  | 'considering'
  | 'future';

export const ROADMAP_CATEGORIES = [
  'Source expansion',
  'Agent capabilities',
  'Integrations and workflow',
  'Analytics and reporting',
  'Customer-facing platform',
  'AI and agent enhancements',
  'Vertical expansion',
  'Architecture and deployment',
  'User experience',
  'Sales enablement',
  'Compliance and governance',
  'Pricing model expansion',
  'Internal tooling',
  'Research and intelligence layer',
  'Construction ecosystem integrations',
] as const;

export type RoadmapCategory = (typeof ROADMAP_CATEGORIES)[number];

export interface RoadmapFeature {
  title: string;
  description: string;
  status: RoadmapStatus;
  category: RoadmapCategory;
}

export interface RoadmapData {
  lastUpdated: string;
  features: RoadmapFeature[];
}

export const STATUS_LABELS: Record<RoadmapStatus, string> = {
  live: 'Live',
  building: 'Building now',
  planned: 'Planned',
  considering: 'Considering',
  future: 'Future vision',
};

export const STATUS_ORDER: RoadmapStatus[] = [
  'live',
  'building',
  'planned',
  'considering',
  'future',
];

export const roadmapData: RoadmapData = {
  lastUpdated: '2026-04-28',
  features: [
    // ---- Live (already shipped) — 10 features ----
    {
      title: 'Real-time federal contract ingestion',
      description:
        'USAspending awards flow into the dashboard on a 6-hour cron, scored against branch geography.',
      status: 'live',
      category: 'Source expansion',
    },
    {
      title: 'Federal opportunities monitoring',
      description:
        'SAM.gov solicitations flow into the dashboard alongside contract awards.',
      status: 'live',
      category: 'Source expansion',
    },
    {
      title: 'Geographic project map with branch coverage',
      description:
        'Branches plotted with 300-mile coverage radii; project pins color-coded by score tier.',
      status: 'live',
      category: 'Customer-facing platform',
    },
    {
      title: 'Claude-generated lead rationale',
      description:
        'Every ranked project receives a one-paragraph rationale referencing source data and an outreach hook.',
      status: 'live',
      category: 'Agent capabilities',
    },
    {
      title: 'Generator-Verifier quality gates',
      description:
        'A separate Verifier agent checks every ranked project for hallucination, branch-attribution accuracy, and customer-reference validity before reaching reps.',
      status: 'live',
      category: 'Agent capabilities',
    },
    {
      title: 'Multi-model orchestration display',
      description:
        'Live model utilization across the agent fleet visible in the operations console.',
      status: 'live',
      category: 'Customer-facing platform',
    },
    {
      title: 'Activity log streaming',
      description:
        "Real-time feed of agent actions in the dashboard's operations console.",
      status: 'live',
      category: 'Customer-facing platform',
    },
    {
      title: 'Cross-pollination warm-intro paths',
      description:
        "System surfaces opportunities where existing customers are adjacent to new projects in other branches' territories.",
      status: 'live',
      category: 'Agent capabilities',
    },
    {
      title: 'Per-branch ranked project lists',
      description:
        'Top opportunities per branch, sortable by score, distance, and posted date.',
      status: 'live',
      category: 'Customer-facing platform',
    },
    {
      title: 'Project detail with full reasoning',
      description:
        'Every project surfaces full Verifier-passed rationale, source link, recommended outreach, and warm-intro path.',
      status: 'live',
      category: 'Customer-facing platform',
    },

    // ---- Building Now (P0) — 10 features ----
    {
      title: 'Intelligence Chat',
      description:
        'Embedded Perplexity-powered chat panel that knows what you are looking at. Ask anything about a project, refine outreach until it is meeting-booking tight, pull cross-record context, take action without leaving the dashboard.',
      status: 'building',
      category: 'AI and agent enhancements',
    },
    {
      title: 'Outreach Drafter with meeting-booking rules',
      description:
        'Tight 3-channel drafts (60-90 word email, under 200 char LinkedIn, 25-second voicemail) tuned to book a 20-minute call before competitors are evaluated. No fluff, no buzzwords, no hallucinated references.',
      status: 'building',
      category: 'Agent capabilities',
    },
    {
      title: 'HubSpot bidirectional sync',
      description:
        'Accepted leads push into HubSpot pipeline with attribution metadata. Stage transitions flow back for closed-won attribution math.',
      status: 'building',
      category: 'Integrations and workflow',
    },
    {
      title: 'Slack bot in customer workspaces',
      description:
        'Native bot replaces the webhook-only digest. Reps tap accept, dismiss, or snooze on each lead. Acceptance opens a modal capturing rep-attested pipeline value.',
      status: 'building',
      category: 'Integrations and workflow',
    },
    {
      title: 'Settings page',
      description:
        'Operator and customer-facing controls for notifications, branches, agents, sources, scoring thresholds, and display preferences.',
      status: 'building',
      category: 'Customer-facing platform',
    },
    {
      title: 'State DOT and county permit feed expansion',
      description:
        'Adding TX, FL, CA DOT project announcements plus Maricopa, Cook, Miami-Dade, LA County permit feeds for fuller geographic coverage.',
      status: 'building',
      category: 'Source expansion',
    },
    {
      title: 'LinkedIn job posting signals',
      description:
        'Security and safety hires within customer geography flagged as active-project signals; correlated with existing project records by location.',
      status: 'building',
      category: 'Source expansion',
    },
    {
      title: 'Mobile-responsive dashboard',
      description:
        'Branch managers and reps access the dashboard from phone and tablet without losing functionality.',
      status: 'building',
      category: 'User experience',
    },
    {
      title: 'Pulse self-tuning agent',
      description:
        'Watches rep accept and reject patterns. Detects systematic mismatches between Ranker scores and rep behavior. Proposes ranking-weight adjustments for human approval.',
      status: 'building',
      category: 'Agent capabilities',
    },
    {
      title: 'Briefing agent with email and Slack delivery',
      description:
        'Friday weekly digest per branch and per org. Email via Resend, Slack via webhook. Operator-grade, scannable in under 5 minutes.',
      status: 'building',
      category: 'Integrations and workflow',
    },

    // ---- Planned (P1, next 90 days) — 10 features ----
    {
      title: 'Contact enrichment via Apollo or Clay',
      description:
        'Outreach drafts populated with verified email, LinkedIn URL, and phone for the right contact at every project.',
      status: 'planned',
      category: 'Agent capabilities',
    },
    {
      title: 'Press wire ingestion',
      description:
        'PR Newswire and Business Wire RSS feeds for richer news synthesis alongside federal data.',
      status: 'planned',
      category: 'Source expansion',
    },
    {
      title: 'Customer Intelligence agent',
      description:
        'Monitors existing customers for press releases, expansion announcements, and security or safety hiring as leading indicators of upcoming RFPs.',
      status: 'planned',
      category: 'Research and intelligence layer',
    },
    {
      title: 'Competitive Intelligence agent',
      description:
        'Tracks which security providers are winning which contracts in customer geographies. Surfaces share-shift trends.',
      status: 'planned',
      category: 'Research and intelligence layer',
    },
    {
      title: 'Eval ground-truth tester',
      description:
        'Continuously validates the system against missed-project examples. Reports days-before-RFP catch rate and improvement trends.',
      status: 'planned',
      category: 'Research and intelligence layer',
    },
    {
      title: 'Predictive close probability per lead',
      description:
        'ML model layered on the rules-based ranker. Trained on accept and reject plus closed-won outcomes once enough data accumulates.',
      status: 'planned',
      category: 'Analytics and reporting',
    },
    {
      title: 'Win and loss analysis on Pathfinder leads',
      description:
        'Attribution dashboard showing closed-won and closed-lost outcomes from Pathfinder leads versus cold prospecting.',
      status: 'planned',
      category: 'Analytics and reporting',
    },
    {
      title: 'Cohort analysis on accept rates',
      description:
        'Time-series view of accept rate by week and score tier. Surfaces in the Friday brief.',
      status: 'planned',
      category: 'Analytics and reporting',
    },
    {
      title: 'Branch performance leaderboard',
      description:
        'Branches ranked daily on accept rate, pipeline added, hours saved, and closed-won. Drives friendly competition.',
      status: 'planned',
      category: 'Analytics and reporting',
    },
    {
      title: 'Time-to-close trend reporting',
      description:
        'The lagging metric that proves Pathfinder works. Average time from surface to closed-won, segmented by score tier.',
      status: 'planned',
      category: 'Analytics and reporting',
    },

    // ---- Considering (P2, 6-month horizon) — 14 features ----
    {
      title: 'Voice-cloned outreach via ElevenLabs',
      description:
        "Personalized voicemail rendered in each rep's actual voice. The agent drafts the script; the rep approves and sends.",
      status: 'considering',
      category: 'Agent capabilities',
    },
    {
      title: 'AI-coached call practice',
      description:
        'Voice agent role-plays prospect conversations with new reps and scores their performance against rubric.',
      status: 'considering',
      category: 'Sales enablement',
    },
    {
      title: 'AI-generated proposal drafts',
      description:
        'When a lead reaches proposal stage, an agent drafts the full proposal from accepted lead context and prior winning proposals.',
      status: 'considering',
      category: 'AI and agent enhancements',
    },
    {
      title: 'Reference customer matching',
      description:
        'For each new lead, surface 1-2 existing customers with similar attributes that can serve as references.',
      status: 'considering',
      category: 'Sales enablement',
    },
    {
      title: 'Stakeholder mapping per project',
      description:
        'Map all known stakeholders per project: project owner, GC, prime contractor, AHJ, security committee. Reps see the full org chart.',
      status: 'considering',
      category: 'Sales enablement',
    },
    {
      title: 'Battle cards per opportunity',
      description:
        'Auto-generated quick-reference card per accepted lead with competitive landscape, value-prop framing, and common objections.',
      status: 'considering',
      category: 'Sales enablement',
    },
    {
      title: 'Salesforce integration',
      description:
        'Alternative CRM connector for customers not on HubSpot.',
      status: 'considering',
      category: 'Integrations and workflow',
    },
    {
      title: 'Mobile apps for branch managers',
      description:
        'Native iOS and Android apps with push notifications for high-priority leads.',
      status: 'considering',
      category: 'User experience',
    },
    {
      title: 'SSO via Google, Microsoft, Okta',
      description:
        'Enterprise identity for customer rollouts.',
      status: 'considering',
      category: 'Compliance and governance',
    },
    {
      title: 'White-label and multi-tenant',
      description:
        'Agency mode with full per-tenant isolation. Resellers and partners deploy under their own brand.',
      status: 'considering',
      category: 'Customer-facing platform',
    },
    {
      title: 'Custom branding per customer',
      description:
        'Co-branded dashboards and outreach templates with customer logo and accent color.',
      status: 'considering',
      category: 'Customer-facing platform',
    },
    {
      title: 'Per-deal revenue share pricing',
      description:
        'Alternative to per-branch retainer. Aligns price with delivered outcomes via attribution tracking.',
      status: 'considering',
      category: 'Pricing model expansion',
    },
    {
      title: 'Win-themes library by industry',
      description:
        'Curated archive of proven messaging per vertical, filterable by lead context.',
      status: 'considering',
      category: 'Sales enablement',
    },
    {
      title: 'Auto-generated quarterly business reviews',
      description:
        'QBR decks pulled from accumulated metrics, ready for partner-level meetings.',
      status: 'considering',
      category: 'Analytics and reporting',
    },

    // ---- Future Vision (P3, 12+ month horizon) — 16 features ----
    {
      title: 'Real-time research during sales calls',
      description:
        'Agent listens to live calls (with consent) and surfaces project history, prior interactions, and competitor signals inline.',
      status: 'future',
      category: 'AI and agent enhancements',
    },
    {
      title: 'Live call transcription with agent analysis',
      description:
        'Transcripts auto-summarized and added to deal records; key points extracted for pipeline updates.',
      status: 'future',
      category: 'AI and agent enhancements',
    },
    {
      title: 'Multi-language outreach drafting',
      description:
        'Spanish, French Canadian, and Mexican Spanish for international expansion.',
      status: 'future',
      category: 'AI and agent enhancements',
    },
    {
      title: 'Cultural localization for international markets',
      description:
        'Tonal and cultural tuning per region beyond translation. Per-locale voice guides.',
      status: 'future',
      category: 'Vertical expansion',
    },
    {
      title: 'HIPAA, SOC 2, FedRAMP compliance',
      description:
        'Certifications required for healthcare and federal customers at scale.',
      status: 'future',
      category: 'Compliance and governance',
    },
    {
      title: 'Air-gapped deployment',
      description:
        'Fully isolated runtime for defense and intelligence customers. Public-data ingestion replaced with on-prem mirrors.',
      status: 'future',
      category: 'Architecture and deployment',
    },
    {
      title: 'Cross-customer pattern detection',
      description:
        'Anonymized patterns from one customer inform ranking and outreach for others. Customer data never crosses tenant boundaries; only patterns do.',
      status: 'future',
      category: 'Research and intelligence layer',
    },
    {
      title: 'Macroeconomic signal integration',
      description:
        'Federal Reserve announcements, infrastructure bills, and policy shifts feed into pipeline forecasting and contextualize weekly metrics.',
      status: 'future',
      category: 'Research and intelligence layer',
    },
    {
      title: 'Procore plugin',
      description:
        'Marketplace listing in the Procore App ecosystem. Construction software native distribution channel.',
      status: 'future',
      category: 'Construction ecosystem integrations',
    },
    {
      title: 'Computer vision on uploaded site photos',
      description:
        'Multi-modal models extract security-relevant features (existing camera coverage, perimeter assessment, vehicle barriers) from rep-uploaded photos.',
      status: 'future',
      category: 'AI and agent enhancements',
    },
    {
      title: 'Voice commands for hands-free navigation',
      description:
        'Power-user feature. Voice triggers map to chat actions for hands-free operation.',
      status: 'future',
      category: 'User experience',
    },
    {
      title: 'Drag-and-drop dashboard layout builder',
      description:
        'Power users customize their dashboard widgets and layout per role.',
      status: 'future',
      category: 'User experience',
    },
    {
      title: 'Customer health scoring (internal ops)',
      description:
        "Internal-only dashboard tracking each Pathfinder customer's accept-rate trend, expansion trajectory, NPS, and support load.",
      status: 'future',
      category: 'Internal tooling',
    },
    {
      title: 'Internal pipeline forecasting',
      description:
        "Forecast our own MRR growth from the Adjacent Discovery agent's outputs and signed-pilot pipeline.",
      status: 'future',
      category: 'Internal tooling',
    },
    {
      title: 'Self-serve setup wizard for new verticals',
      description:
        'Onboard new vertical customers without engineering work via a 5-step configuration wizard.',
      status: 'future',
      category: 'Internal tooling',
    },
    {
      title: 'Industry trend reports',
      description:
        'Auto-generated weekly synthesis of construction security industry signals, published to a public insights blog.',
      status: 'future',
      category: 'Research and intelligence layer',
    },
  ],
};
