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
    // ---- Live (currently shipped) — 10 features ----
    {
      title: 'Real-time federal contract ingestion',
      description:
        'USAspending awards flowing into the dashboard every 6 hours, scored against branch geography.',
      status: 'live',
      category: 'Source expansion',
    },
    {
      title: 'Federal opportunities monitoring',
      description:
        'SAM.gov solicitations flowing into the dashboard alongside contract awards.',
      status: 'live',
      category: 'Source expansion',
    },
    {
      title: 'Geographic project map with branch coverage',
      description:
        'Synthetic Zedcor-shape branches plotted on Google Maps with 300-mile coverage radii, project pins by score tier.',
      status: 'live',
      category: 'Customer-facing platform',
    },
    {
      title: 'Claude-generated lead rationale per project',
      description:
        'Every ranked project gets a one-paragraph rationale referencing source data and recommended outreach hook.',
      status: 'live',
      category: 'Agent capabilities',
    },
    {
      title: 'Generator-Verifier quality gates',
      description:
        'Every ranked project is reviewed by a separate Verifier agent for hallucination checks, branch attribution, and customer-reference validity before reaching reps.',
      status: 'live',
      category: 'Agent capabilities',
    },
    {
      title: 'Multi-model orchestration display',
      description:
        'Dashboard shows live model utilization across the agent fleet.',
      status: 'live',
      category: 'Customer-facing platform',
    },
    {
      title: 'Activity log streaming',
      description:
        'Real-time feed of agent actions in the operations console.',
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
        'Top opportunities per branch, sortable by score, distance, posted date.',
      status: 'live',
      category: 'Customer-facing platform',
    },
    {
      title: 'Project detail with full reasoning',
      description:
        'Click any project to see the Verifier-passed rationale, source link, recommended outreach, and warm-intro path.',
      status: 'live',
      category: 'Customer-facing platform',
    },

    // ---- Building now (in active development) — 7 features ----
    {
      title: 'Outreach Drafter agent',
      description:
        'Generates rep-ready email, LinkedIn DM, and voicemail scripts per high-priority lead, in customer voice.',
      status: 'building',
      category: 'Agent capabilities',
    },
    {
      title: 'Pulse self-tuning agent',
      description:
        'Watches rep accept/reject behavior and proposes ranking-weight adjustments for human approval.',
      status: 'building',
      category: 'Agent capabilities',
    },
    {
      title: 'Competitive Intelligence agent',
      description:
        'Tracks which security providers are winning which contracts in customer geographies.',
      status: 'building',
      category: 'Research and intelligence layer',
    },
    {
      title: 'Briefing agent with email and Slack delivery',
      description:
        'Friday weekly digest per branch and per org, delivered via Resend and Slack webhook.',
      status: 'building',
      category: 'Integrations and workflow',
    },
    {
      title: 'Customer Intelligence agent',
      description:
        'Monitors existing customers for press releases, expansion announcements, and security-related hiring signals.',
      status: 'building',
      category: 'Research and intelligence layer',
    },
    {
      title: 'Eval ground-truth tester',
      description:
        'Continuously validates the system against missed-project examples to track improvement over time.',
      status: 'building',
      category: 'Research and intelligence layer',
    },
    {
      title: 'Settings page',
      description:
        'Operator and customer-facing controls for notifications, branches, agents, and display preferences.',
      status: 'building',
      category: 'Customer-facing platform',
    },

    // ---- Planned (next 90 days) — 9 features ----
    {
      title: 'HubSpot bidirectional sync',
      description:
        'Accepted leads flow into HubSpot pipeline; closed-won status flows back for attribution.',
      status: 'planned',
      category: 'Integrations and workflow',
    },
    {
      title: 'Slack bot in customer workspaces',
      description:
        'Native bot replaces the webhook delivery, with one-tap accept/dismiss/snooze actions.',
      status: 'planned',
      category: 'Integrations and workflow',
    },
    {
      title: 'State DOT project feeds',
      description:
        'Major state transportation department announcements added as a fifth ingestion source.',
      status: 'planned',
      category: 'Source expansion',
    },
    {
      title: 'County permit portal expansion',
      description:
        'Maricopa, Dallas, Cook, Miami-Dade, LA County permit feeds.',
      status: 'planned',
      category: 'Source expansion',
    },
    {
      title: 'Press wire ingestion',
      description:
        'PR Newswire and Business Wire RSS feeds added for richer news synthesis.',
      status: 'planned',
      category: 'Source expansion',
    },
    {
      title: 'Contact enrichment via Apollo or Clay',
      description:
        'Outreach agent pulls verified contact data per project owner.',
      status: 'planned',
      category: 'Agent capabilities',
    },
    {
      title: 'LinkedIn job posting signals',
      description:
        'Security and safety hires at customer sites flagged as active-project signals.',
      status: 'planned',
      category: 'Source expansion',
    },
    {
      title: 'Mobile-responsive dashboard',
      description:
        'Branch managers and reps access the dashboard from phone and tablet.',
      status: 'planned',
      category: 'User experience',
    },
    {
      title: 'On-prem deployment for anchor customers',
      description:
        "Privacy-sensitive matching layer runs on customer's own GPUs, customer data never leaves their data center.",
      status: 'planned',
      category: 'Architecture and deployment',
    },

    // ---- Considering (evaluating) — 11 features ----
    {
      title: 'Salesforce integration',
      description:
        'Alternative CRM for customers not on HubSpot.',
      status: 'considering',
      category: 'Integrations and workflow',
    },
    {
      title: 'Voice-cloned outreach via ElevenLabs',
      description:
        "Personalized voicemail in the rep's actual voice.",
      status: 'considering',
      category: 'Agent capabilities',
    },
    {
      title: 'Procore plugin or marketplace listing',
      description:
        'Distribution into the construction software ecosystem.',
      status: 'considering',
      category: 'Construction ecosystem integrations',
    },
    {
      title: 'Mobile apps for branch managers',
      description:
        'Native iOS and Android apps with push notifications.',
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
        'Agency mode for resellers and partners.',
      status: 'considering',
      category: 'Customer-facing platform',
    },
    {
      title: 'Custom branding per customer',
      description:
        'Co-branded dashboards and outreach templates.',
      status: 'considering',
      category: 'Customer-facing platform',
    },
    {
      title: 'Per-deal revenue share pricing',
      description:
        'Alternative to per-branch retainer.',
      status: 'considering',
      category: 'Pricing model expansion',
    },
    {
      title: 'Win-themes library by industry',
      description:
        'Proven messaging archives reps can pull from.',
      status: 'considering',
      category: 'Sales enablement',
    },
    {
      title: 'Predictive close probability per lead',
      description:
        'ML model on top of the rules-based ranker.',
      status: 'considering',
      category: 'Analytics and reporting',
    },
    {
      title: 'Auto-generated quarterly business reviews',
      description:
        'QBR decks pulled from accumulated data.',
      status: 'considering',
      category: 'Analytics and reporting',
    },

    // ---- Future vision (longer horizon) — 10 features ----
    {
      title: 'AI-coached call practice for new reps',
      description:
        'Agent role-plays prospect calls before reps go live.',
      status: 'future',
      category: 'Sales enablement',
    },
    {
      title: 'Real-time research during sales calls',
      description:
        'Agent listens to the call and surfaces context inline.',
      status: 'future',
      category: 'AI and agent enhancements',
    },
    {
      title: 'Live call transcription with agent analysis',
      description:
        'Transcripts auto-summarized and added to deal records.',
      status: 'future',
      category: 'AI and agent enhancements',
    },
    {
      title: 'AI-generated full proposal drafts',
      description:
        'Proposals drafted from accepted lead context, ready for human review.',
      status: 'future',
      category: 'AI and agent enhancements',
    },
    {
      title: 'Multi-language outreach drafting',
      description:
        'Spanish, French Canadian, others for international expansion.',
      status: 'future',
      category: 'AI and agent enhancements',
    },
    {
      title: 'Cultural localization for international markets',
      description:
        'Outreach voice tuned per region beyond translation.',
      status: 'future',
      category: 'Vertical expansion',
    },
    {
      title: 'HIPAA, SOC 2, FedRAMP compliance',
      description:
        'Certifications for healthcare and federal customers.',
      status: 'future',
      category: 'Compliance and governance',
    },
    {
      title: 'Air-gapped deployment for defense customers',
      description:
        'Fully isolated runtime for sensitive verticals.',
      status: 'future',
      category: 'Architecture and deployment',
    },
    {
      title: 'Cross-customer pattern detection',
      description:
        "What works in one customer's data informs ranking and outreach for others.",
      status: 'future',
      category: 'Research and intelligence layer',
    },
    {
      title: 'Macroeconomic signal integration',
      description:
        'Fed announcements, infrastructure bills, and policy shifts feed into pipeline forecasting.',
      status: 'future',
      category: 'Research and intelligence layer',
    },
  ],
};
