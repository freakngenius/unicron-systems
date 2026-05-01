import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type DataSourceType =
  | 'permits'
  | 'sam_gov'
  | 'news'
  | 'entity_formation'
  | 'land_txn'
  | 'rfp';

export type DataSource = {
  id: string;
  type: DataSourceType;
  label: string;
  jurisdiction?: string;
  pollFrequencyMs: number;
  enabled: boolean;
  /** Watcher role in the agent layer 2 that this feed pulses through. */
  watcherRole: string;
  /** 0..1 weight of this feed's share of total intake. */
  weight: number;
};

export type AgentLayer = 2 | 3 | 4;

export type AgentDef = {
  id: string;
  layer: AgentLayer;
  /** Role label such as "PermitWatcher", "Qualifier", "Ranker". */
  role: string;
  instruction: string;
  inputFrom?: string[];
  outputTo?: string[];
  dwellMs: number;
  /** 0..1 — chance of passing on to the next layer when activated. */
  passRate: number;
  enabled: boolean;
};

export type SystemConfig = {
  status: 'unconfigured' | 'configured' | 'live';
  buyerPain?: string;
  dataSources: DataSource[];
  agents: AgentDef[];
};

const emptyConfig: SystemConfig = {
  status: 'unconfigured',
  dataSources: [],
  agents: [],
};

/**
 * Default architecture deployed when the user approves the Architect's proposal.
 * Mirrors the construction-security narrative used in DefinePain placeholders
 * and the ArchitectThinking decomposition output.
 */
function buildDefaultArchitecture(buyerPain: string): SystemConfig {
  const dataSources: DataSource[] = [
    {
      id: 'src-permits',
      type: 'permits',
      label: 'Municipal permit feeds',
      jurisdiction: 'multi',
      pollFrequencyMs: 60 * 60 * 1000,
      enabled: true,
      watcherRole: 'PermitWatcher',
      weight: 0.62,
    },
    {
      id: 'src-sam',
      type: 'sam_gov',
      label: 'SAM.gov procurement',
      pollFrequencyMs: 6 * 60 * 60 * 1000,
      enabled: true,
      watcherRole: 'ProcurementWatcher',
      weight: 0.16,
    },
    {
      id: 'src-news',
      type: 'news',
      label: 'News + trade press',
      pollFrequencyMs: 30 * 60 * 1000,
      enabled: true,
      watcherRole: 'NewsWatcher',
      weight: 0.14,
    },
    {
      id: 'src-entity',
      type: 'entity_formation',
      label: 'Entity formation',
      pollFrequencyMs: 24 * 60 * 60 * 1000,
      enabled: true,
      watcherRole: 'EntityWatcher',
      weight: 0.08,
    },
  ];

  const agents: AgentDef[] = [
    // Layer 2 — Watchers
    {
      id: 'a-permit',
      layer: 2,
      role: 'PermitWatcher',
      instruction:
        'Poll permit-issuing jurisdictions; normalize new filings into structured events.',
      outputTo: ['a-qualifier'],
      dwellMs: 5000,
      passRate: 0.34,
      enabled: true,
    },
    {
      id: 'a-sam',
      layer: 2,
      role: 'ProcurementWatcher',
      instruction:
        'Watch SAM.gov and state portals for new construction-adjacent solicitations.',
      outputTo: ['a-qualifier'],
      dwellMs: 5000,
      passRate: 0.28,
      enabled: true,
    },
    {
      id: 'a-news',
      layer: 2,
      role: 'NewsWatcher',
      instruction:
        'Scan local news, trade press, and press wires for project announcements.',
      outputTo: ['a-qualifier'],
      dwellMs: 5000,
      passRate: 0.22,
      enabled: true,
    },
    {
      id: 'a-entity',
      layer: 2,
      role: 'EntityWatcher',
      instruction: 'Detect new construction LLCs forming in target geographies.',
      outputTo: ['a-qualifier'],
      dwellMs: 5000,
      passRate: 0.18,
      enabled: true,
    },
    // Layer 3 — Signal
    {
      id: 'a-qualifier',
      layer: 3,
      role: 'Qualifier',
      instruction: 'Apply hard buying-signal filters to incoming events.',
      inputFrom: ['a-permit', 'a-sam', 'a-news', 'a-entity'],
      outputTo: ['a-enricher'],
      dwellMs: 8000,
      passRate: 0.34,
      enabled: true,
    },
    {
      id: 'a-enricher',
      layer: 3,
      role: 'Enricher',
      instruction: 'Resolve GC contact, owner, timeline, and adjacent needs.',
      inputFrom: ['a-qualifier'],
      outputTo: ['a-geo', 'a-compete'],
      dwellMs: 8000,
      passRate: 0.62,
      enabled: true,
    },
    {
      id: 'a-geo',
      layer: 3,
      role: 'GeoMapper',
      instruction: 'Map projects to coverage geographies and proximity buyers.',
      inputFrom: ['a-enricher'],
      outputTo: ['a-ranker'],
      dwellMs: 8000,
      passRate: 0.78,
      enabled: true,
    },
    {
      id: 'a-compete',
      layer: 3,
      role: 'CompetitiveIntel',
      instruction: 'Identify incumbents and existing security relationships.',
      inputFrom: ['a-enricher'],
      outputTo: ['a-ranker'],
      dwellMs: 8000,
      passRate: 0.55,
      enabled: true,
    },
    // Layer 4 — Synthesis
    {
      id: 'a-ranker',
      layer: 4,
      role: 'Ranker',
      instruction: 'Score qualified events by win probability and value.',
      inputFrom: ['a-geo', 'a-compete'],
      outputTo: ['a-outreach', 'a-briefer'],
      dwellMs: 10000,
      passRate: 0.82,
      enabled: true,
    },
    {
      id: 'a-outreach',
      layer: 4,
      role: 'OutreachDrafter',
      instruction: 'Draft a personalized outreach email for the GC contact.',
      inputFrom: ['a-ranker'],
      dwellMs: 10000,
      passRate: 0.86,
      enabled: true,
    },
    {
      id: 'a-briefer',
      layer: 4,
      role: 'Briefer',
      instruction: 'Compile a one-page brief for sales review.',
      inputFrom: ['a-ranker'],
      dwellMs: 10000,
      passRate: 0.9,
      enabled: true,
    },
  ];

  return {
    status: 'live',
    buyerPain,
    dataSources,
    agents,
  };
}

export type SystemContextValue = {
  config: SystemConfig;
  /** Replace config — used by Onboarding when the user approves architecture. */
  deploy: (next: Partial<SystemConfig>) => void;
  /** Replace with the canonical default architecture. */
  deployDefault: (buyerPain: string) => void;
  resetToUnconfigured: () => void;
  addAgent: (agent: AgentDef) => void;
  updateAgent: (id: string, patch: Partial<AgentDef>) => void;
  removeAgent: (id: string) => void;
  addDataSource: (source: DataSource) => void;
  removeDataSource: (id: string) => void;
};

const SystemContext = createContext<SystemContextValue | null>(null);

export function SystemProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<SystemConfig>(emptyConfig);

  const deploy = useCallback((next: Partial<SystemConfig>) => {
    setConfig((prev) => ({ ...prev, ...next }));
  }, []);

  const deployDefault = useCallback((buyerPain: string) => {
    setConfig(buildDefaultArchitecture(buyerPain));
  }, []);

  const resetToUnconfigured = useCallback(() => {
    setConfig(emptyConfig);
  }, []);

  const addAgent = useCallback((agent: AgentDef) => {
    setConfig((prev) => ({ ...prev, agents: [...prev.agents, agent] }));
  }, []);

  const updateAgent = useCallback((id: string, patch: Partial<AgentDef>) => {
    setConfig((prev) => ({
      ...prev,
      agents: prev.agents.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    }));
  }, []);

  const removeAgent = useCallback((id: string) => {
    setConfig((prev) => ({
      ...prev,
      agents: prev.agents.filter((a) => a.id !== id),
    }));
  }, []);

  const addDataSource = useCallback((source: DataSource) => {
    setConfig((prev) => ({ ...prev, dataSources: [...prev.dataSources, source] }));
  }, []);

  const removeDataSource = useCallback((id: string) => {
    setConfig((prev) => ({
      ...prev,
      dataSources: prev.dataSources.filter((d) => d.id !== id),
    }));
  }, []);

  const value = useMemo<SystemContextValue>(
    () => ({
      config,
      deploy,
      deployDefault,
      resetToUnconfigured,
      addAgent,
      updateAgent,
      removeAgent,
      addDataSource,
      removeDataSource,
    }),
    [
      config,
      deploy,
      deployDefault,
      resetToUnconfigured,
      addAgent,
      updateAgent,
      removeAgent,
      addDataSource,
      removeDataSource,
    ],
  );

  return <SystemContext.Provider value={value}>{children}</SystemContext.Provider>;
}

export function useSystem() {
  const ctx = useContext(SystemContext);
  if (!ctx) throw new Error('useSystem must be used inside <SystemProvider>');
  return ctx;
}

export const __testing = { buildDefaultArchitecture };
