// lib/ingest/__stubs.ts — Stream C Sprint 1
//
// Stub implementations of the Stream B interfaces so this stream can
// typecheck now. These stubs are DELETED after Stream B's PR (sprint/1-ingest)
// is merged and the conductor rebases this branch.
//
// Real implementations will live at:
//   lib/ingest/base.ts                  — base writer (ledger, vault, action items)
//   lib/ingest/skills/ingest-call.ts    — call ingest skill
//   lib/taboo-keeper.ts                 — Taboo Keeper guard
//
// Do NOT import from this file in production code. Only the test files
// and __stubs need references; route.ts imports from the real paths.

// ─── IngestCallResult (from lib/ingest/skills/ingest-call.ts) ────────────────

export type IngestCallResult =
  | { status: 'NO_SIGNAL'; reason: string }
  | { status: 'ABSTAIN'; reason: string }
  | { status: 'records'; ledger_row: unknown; vault_doc: unknown; action_items: unknown[]; signals: unknown[] };

// ─── IngestCallInput (from lib/ingest/skills/ingest-call.ts) ─────────────────

export interface IngestCallInput {
  source_id: string;
  source_url: string | null;
  raw_content: string;
  participants: { team_member_id?: string; name?: string; email?: string }[];
  captured_at: string;
  captured_by: { type: 'human' | 'agent'; id: string };
  metadata?: Record<string, unknown>;
}

// ─── IngestBaseResult (from lib/ingest/base.ts) ───────────────────────────────

export interface IngestBaseResult {
  ledger_id: string;
  vault_doc_path: string;
  action_item_ids: string[];
}

// ─── TabooVerdict (from lib/taboo-keeper.ts) ─────────────────────────────────

export type TabooVerdict =
  | { verdict: 'pass'; reason?: string; matched_taboo?: undefined; warning?: string }
  | { verdict: 'bounce'; reason: string; matched_taboo: string; warning?: string };

// ─── Stub: runIngestCall ─────────────────────────────────────────────────────
// Real export: export async function runIngestCall(input: IngestCallInput): Promise<IngestCallResult>
export async function runIngestCall(_input: IngestCallInput): Promise<IngestCallResult> {
  return { status: 'NO_SIGNAL', reason: 'stub — Stream B not yet merged' };
}

// ─── Stub: checkTaboo ────────────────────────────────────────────────────────
// Real export: export async function checkTaboo(subject: unknown, context: string): Promise<TabooVerdict>
export async function checkTaboo(_subject: unknown, _context: string): Promise<TabooVerdict> {
  return { verdict: 'pass' };
}

// ─── Stub: writeIngestRecords ────────────────────────────────────────────────
// Real export: export async function writeIngestRecords(result: Extract<IngestCallResult, {status:'records'}>): Promise<IngestBaseResult>
export async function writeIngestRecords(_result: Extract<IngestCallResult, { status: 'records' }>): Promise<IngestBaseResult> {
  return { ledger_id: 'stub', vault_doc_path: 'stub', action_item_ids: [] };
}
