// services/architect/src/lib/architectAdapters.ts
//
// Adapter layer between Stream D's canonical wire types
// (`DecompositionApiResponse`, `ArchitectProposalRow`) and the legacy UI
// shapes Stream C's components consume (`DecompositionResponse`,
// `Proposal`). Pure functions, no I/O.
//
// Per `MEMORY/audit-unicron-platform.md` § "Stream C findings —
// 2026-05-01" recommendation #1: adapter at the client layer keeps the
// existing components unchanged while swapping the backend.
//
// Per-component migration to canonical types is a separate cleanup; the
// adapter just buys time to ship.

import type { SystemConfig, AgentDef, DataSource, DataSourceType } from '../context/SystemContext';
import type {
  ArchitectProposalRow,
  DecompositionApiResponse,
  DecompositionArchitecture,
  DecompositionLine,
  DecompositionResponse,
  Proposal,
  ProposalCategory,
  ProposalDetail,
} from './contracts/architect';

// ---- Decomposition response adapter ---------------------------------------

export function decompositionApiToLegacy(
  api: DecompositionApiResponse,
  buyerPain: string,
): DecompositionResponse {
  const lines = architectureToLines(api.architecture, api.reasoning, api.cost_usd);
  return {
    sessionId: api.session_id,
    lines,
    recommendedConfig: architectureToSystemConfig(api.architecture, buyerPain),
    confidence: confidenceLabelToNumber(api.architecture.estimates.architecture_confidence),
    costUsd: api.cost_usd,
    architecture: api.architecture,
  };
}

// Synthesize the type-on `lines[]` Stream C's UI expects from Stream D's
// structured `architecture` + `reasoning[]`. The lines are categorized by
// `kind` so the UI's color/glyph treatment still works.
export function architectureToLines(
  arch: DecompositionArchitecture,
  reasoning: string[],
  costUsd?: number,
): DecompositionLine[] {
  const out: DecompositionLine[] = [];
  let i = 0;
  out.push({ index: i++, text: `BUYER         ${arch.buyer}`, kind: 'buyer' });
  out.push({ index: i++, text: `BUYING SIGNAL ${arch.buying_signal}`, kind: 'signal' });
  out.push({ index: i++, text: '', kind: 'header' });

  out.push({ index: i++, text: 'PUBLIC DATA SOURCES', kind: 'data' });
  for (const ds of arch.data_sources_proposed) {
    const juris = ds.jurisdictions.length > 0 ? ds.jurisdictions.join(', ') : 'national';
    out.push({
      index: i++,
      text: `  · ${ds.type.padEnd(28)} ${juris}  ~${ds.expected_daily_volume}/day`,
      kind: 'data',
    });
  }
  if (arch.data_sources_rejected.length > 0) {
    out.push({ index: i++, text: '', kind: 'header' });
    out.push({ index: i++, text: 'REJECTED SOURCES', kind: 'data' });
    for (const r of arch.data_sources_rejected) {
      out.push({ index: i++, text: `  · ${r.type.padEnd(28)} ${r.reason}`, kind: 'data' });
    }
  }

  out.push({ index: i++, text: '', kind: 'header' });
  out.push({ index: i++, text: 'PROPOSED ARCHITECTURE', kind: 'arch' });
  for (const w of arch.layer_2_watchers) {
    out.push({ index: i++, text: `  L2  watcher  ${w.source_type}`, kind: 'arch' });
  }
  for (const a of arch.layer_3_agents) {
    out.push({ index: i++, text: `  L3  ${a.role.padEnd(20)} ${truncate(a.instruction, 80)}`, kind: 'arch' });
  }
  for (const a of arch.layer_4_agents) {
    out.push({ index: i++, text: `  L4  ${a.role.padEnd(20)} ${truncate(a.instruction, 80)}`, kind: 'arch' });
  }

  if (arch.open_questions.length > 0) {
    out.push({ index: i++, text: '', kind: 'header' });
    out.push({ index: i++, text: 'OPEN QUESTIONS', kind: 'header' });
    for (const q of arch.open_questions) {
      out.push({ index: i++, text: `  ? ${truncate(q, 100)}`, kind: 'header' });
    }
  }

  // Reasoning summaries surfaced as a final block — visible only when
  // operator settings opt in to internal metrics (filtered via `kind: 'cost'`
  // by ArchitectThinking's useStableLines).
  if (reasoning.length > 0) {
    out.push({ index: i++, text: '', kind: 'cost' });
    out.push({ index: i++, text: '[INTERNAL ONLY] reasoning trace', kind: 'cost' });
    for (const r of reasoning) {
      out.push({ index: i++, text: `  · ${truncate(r, 100)}`, kind: 'cost' });
    }
  }

  out.push({ index: i++, text: '', kind: 'header' });
  out.push({
    index: i++,
    text: `CONFIDENCE    ${arch.estimates.architecture_confidence}  ·  ~${arch.estimates.daily_qualified_volume} qualified/day  ·  ~$${arch.estimates.cost_per_lead_usd.toFixed(3)}/lead`,
    kind: 'confidence',
  });
  if (costUsd != null) {
    out.push({
      index: i,
      text: `[INTERNAL ONLY] decomposition cost: $${costUsd.toFixed(4)}`,
      kind: 'cost',
    });
  }
  return out;
}

function confidenceLabelToNumber(label: 'low' | 'medium' | 'high'): number {
  return label === 'high' ? 0.85 : label === 'medium' ? 0.6 : 0.35;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + '…';
}

// ---- Architecture → SystemConfig adapter ----------------------------------
//
// Stream D returns a richer "vertical_configuration" shape than Stream C's
// `SystemConfig`. The adapter does a minimal mapping suitable for visualizer
// rendering + the operator's APPROVE & DEPLOY action. Fields the visualizer
// doesn't need (rejected_sources, open_questions, exact estimates) are
// accessible via the proposal row's `details` jsonb if the operator wants
// to drill in later.

export function architectureToSystemConfig(
  arch: DecompositionArchitecture,
  buyerPain: string,
): SystemConfig {
  const totalWeight = arch.data_sources_proposed.reduce(
    (acc, s) => acc + Math.max(0, s.expected_daily_volume),
    0,
  );
  const dataSources: DataSource[] = arch.data_sources_proposed.map((s, idx) => ({
    id: `src-${slug(s.type)}-${idx}`,
    type: dataSourceTypeFromCanonical(s.type),
    label: humanizeSourceType(s.type),
    jurisdiction: s.jurisdictions.join(', ') || undefined,
    pollFrequencyMs: defaultPollFrequencyMs(s.type),
    enabled: true,
    watcherRole: watcherRoleFor(s.type),
    weight:
      totalWeight > 0
        ? Math.max(0.02, Math.min(1, s.expected_daily_volume / totalWeight))
        : 1 / Math.max(1, arch.data_sources_proposed.length),
  }));

  const watchers: AgentDef[] = arch.layer_2_watchers.map((w, idx) => ({
    id: `a-l2-${slug(w.source_type)}-${idx}`,
    layer: 2,
    role: watcherRoleFor(w.source_type),
    instruction: w.instruction,
    inputFrom: [],
    outputTo: arch.layer_3_agents.map((a) => `a-l3-${slug(a.role)}-0`).slice(0, 1),
    dwellMs: 5000,
    passRate: 0.7,
    enabled: true,
  }));

  const layer3: AgentDef[] = arch.layer_3_agents.map((a, idx) => ({
    id: `a-l3-${slug(a.role)}-${idx}`,
    layer: 3,
    role: a.role,
    instruction: a.instruction,
    inputFrom: idx === 0 ? watchers.map((w) => w.id).slice(0, 1) : [],
    outputTo: arch.layer_4_agents.map((b) => `a-l4-${slug(b.role)}-0`).slice(0, 1),
    dwellMs: 7000,
    passRate: 0.5,
    enabled: true,
  }));

  const layer4: AgentDef[] = arch.layer_4_agents.map((a, idx) => ({
    id: `a-l4-${slug(a.role)}-${idx}`,
    layer: 4,
    role: a.role,
    instruction: a.instruction,
    inputFrom: idx === 0 ? layer3.map((b) => b.id).slice(0, 1) : [],
    outputTo: [],
    dwellMs: 10_000,
    passRate: 0.7,
    enabled: true,
  }));

  return {
    status: 'configured',
    buyerPain,
    dataSources,
    agents: [...watchers, ...layer3, ...layer4],
  };
}

function dataSourceTypeFromCanonical(canonicalType: string): DataSourceType {
  const t = canonicalType.toLowerCase();
  if (t === 'sam.gov' || t.includes('sam.gov')) return 'sam_gov';
  if (t.includes('permit')) return 'permits';
  if (t.includes('news') || t.includes('google')) return 'news';
  if (t.includes('property') || t.includes('land') || t.includes('deed')) return 'land_txn';
  if (t.includes('business') || t.includes('formation') || t.includes('license')) return 'entity_formation';
  if (t.includes('rfp') || t.includes('opportunit')) return 'rfp';
  return 'permits'; // default for the visualizer; the canonical type is preserved in `details`.
}

function watcherRoleFor(canonicalType: string): string {
  const t = canonicalType.toLowerCase();
  if (t.includes('permit')) return 'PermitWatcher';
  if (t.includes('sam.gov')) return 'ProcurementWatcher';
  if (t.includes('news') || t.includes('google')) return 'NewsWatcher';
  if (t.includes('property') || t.includes('land')) return 'PropertyWatcher';
  if (t.includes('business') || t.includes('formation') || t.includes('license')) return 'EntityWatcher';
  if (t.includes('fema')) return 'DisasterWatcher';
  if (t.includes('sec') || t.includes('edgar')) return 'SecWatcher';
  if (t.includes('court') || t.includes('pacer')) return 'CourtWatcher';
  if (t.includes('job')) return 'HiringWatcher';
  return 'Watcher';
}

function defaultPollFrequencyMs(canonicalType: string): number {
  const t = canonicalType.toLowerCase();
  if (t.includes('news')) return 30 * 60 * 1000;
  if (t.includes('permit')) return 60 * 60 * 1000;
  if (t.includes('court') || t.includes('property')) return 6 * 60 * 60 * 1000;
  return 60 * 60 * 1000;
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function humanizeSourceType(canonicalType: string): string {
  return canonicalType
    .replace(/-permits$/i, ' permits')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---- Proposal row → legacy Proposal adapter -------------------------------

export function archProposalRowToLegacy(row: ArchitectProposalRow): Proposal {
  return {
    id: row.id,
    category: typeToCategory(row.type),
    type: typeToLabel(row.type),
    time: relativeTime(row.created_at),
    headline: row.headline,
    body: row.body ?? '',
    details: detailsToKv(row.type, row.details),
    // No `apply` patch — Stream D doesn't ship them; UI's fallbackApply
    // handles the demo path.
  };
}

export function typeToCategory(t: ArchitectProposalRow['type']): ProposalCategory {
  switch (t) {
    case 'source_discovery':
      return 'sources';
    case 'agent_proposal':
    case 'vertical_configuration':
      return 'agents';
    case 'tuning_suggestion':
      return 'tuning';
  }
}

function typeToLabel(t: ArchitectProposalRow['type']): string {
  switch (t) {
    case 'source_discovery':
      return 'SOURCE DISCOVERY';
    case 'agent_proposal':
      return 'AGENT PROPOSAL';
    case 'vertical_configuration':
      return 'VERTICAL CONFIGURATION';
    case 'tuning_suggestion':
      return 'TUNING SUGGESTION';
  }
}

export function relativeTime(iso: string): string {
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return '';
  const deltaSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (deltaSec < 60) return `${deltaSec}s ago`;
  const min = Math.floor(deltaSec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

// Type-aware projection of the jsonb `details` blob into the [{k,v}]
// list the legacy UI renders. Each proposal type has its own shape.
function detailsToKv(
  type: ArchitectProposalRow['type'],
  details: Record<string, unknown>,
): ProposalDetail[] {
  const kv: ProposalDetail[] = [];
  const pushIf = (k: string, v: unknown) => {
    if (v == null) return;
    if (typeof v === 'object') return;
    kv.push({ k, v: String(v) });
  };

  if (type === 'source_discovery') {
    pushIf('jurisdiction', details.candidate_jurisdiction);
    pushIf('source', details.source_name);
    pushIf('source type', details.source_type);
    pushIf('tier', details.tier);
    pushIf('reference rate', formatPercent(details.reference_rate));
    pushIf('estimated lift', `${formatNumber(details.lift_per_day)}/day`);
    pushIf('confidence', formatNumber(details.confidence));
    if (typeof details.source_url === 'string') kv.push({ k: 'url', v: details.source_url });
    return kv;
  }

  if (type === 'tuning_suggestion') {
    pushIf('agent', details.agent_role ?? details.role);
    pushIf('cluster', details.cluster_key);
    pushIf('cluster size', details.cluster_count);
    if (details.shadow_test && typeof details.shadow_test === 'object') {
      const st = details.shadow_test as Record<string, unknown>;
      pushIf('shadow win rate', formatPercent(st.win_rate));
      pushIf('shadow side effects', formatPercent(st.side_effect_rate));
      pushIf('shadow method', st.method);
    }
    pushIf('estimated impact', details.estimated_impact);
    pushIf('confidence', formatNumber(details.confidence));
    return kv;
  }

  if (type === 'vertical_configuration') {
    pushIf('buyer', details.buyer);
    pushIf('signal', details.buying_signal);
    if (Array.isArray(details.data_sources_proposed)) {
      kv.push({
        k: 'data sources',
        v: String(details.data_sources_proposed.length),
      });
    }
    if (details.estimates && typeof details.estimates === 'object') {
      const e = details.estimates as Record<string, unknown>;
      pushIf('confidence', e.architecture_confidence);
      pushIf('qualified/day', formatNumber(e.daily_qualified_volume));
      pushIf('cost/lead', formatNumber(e.cost_per_lead_usd));
    }
    return kv;
  }

  // agent_proposal: free-form jsonb. Surface up to 6 scalar keys.
  for (const [k, v] of Object.entries(details).slice(0, 6)) {
    pushIf(k, v);
  }
  return kv;
}

function formatPercent(v: unknown): string | undefined {
  if (typeof v !== 'number' || !Number.isFinite(v)) return undefined;
  return `${(v * 100).toFixed(0)}%`;
}

function formatNumber(v: unknown): string | undefined {
  if (typeof v !== 'number' || !Number.isFinite(v)) return undefined;
  if (Math.abs(v) < 1) return v.toFixed(3);
  return v.toFixed(1);
}
