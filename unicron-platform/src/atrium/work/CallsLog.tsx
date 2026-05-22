// CallsLog.tsx — Atrium Work > Calls
//
// Goal "Fix Atrium call upload end-to-end":
//   Condition 1 — owns the bottom-of-viewport status bar that cycles
//     "Call uploading..." → "Processing transcript..." → "Done: N to-dos,
//     M decisions, K mentions" with audit_log id. Persists ~5s after done.
//   Condition 5 — expanded call view (ExpandedCallView) renders the
//     prescribed top-to-bottom structure when the operator clicks a call.

import { useState, useEffect, useCallback } from 'react';
import { getSupabase } from '../../lib/supabase';
import { UploadCallModal, type UploadSubmitPayload } from './UploadCallModal';
import { ExpandedCallView, type CallRow } from './ExpandedCallView';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LedgerRow {
  id: string;
  source_type: string;
  content_summary: string | null;
  content_full: string | null;
  insights: Record<string, unknown> | null;
  created_at: string;
  customer_id: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isVoiceCall(row: LedgerRow): boolean {
  if (row.source_type === 'voice_memo') return true;
  if (!row.insights) return false;
  return (
    row.insights['channel'] === 'voice' ||
    Boolean(row.insights['voice_agent']) ||
    row.insights['via'] === 'voice'
  );
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getParticipantList(row: LedgerRow): string[] {
  const insights = row.insights;
  if (!insights) return [];
  const p = insights['participants'];
  if (Array.isArray(p)) return p.map(String);
  if (typeof p === 'string') return p.split(',').map((s) => s.trim()).filter(Boolean);
  return [];
}

const CALLS_FILTER_STORAGE_KEY = 'atrium:calls:participant-filter';

function readPersistedFilter(): string {
  if (typeof window === 'undefined') return 'all';
  try {
    return window.sessionStorage.getItem(CALLS_FILTER_STORAGE_KEY) ?? 'all';
  } catch {
    return 'all';
  }
}

function writePersistedFilter(value: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(CALLS_FILTER_STORAGE_KEY, value);
  } catch {
    /* sessionStorage disabled */
  }
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

function useCallsLog(searchQuery: string, reloadKey: number) {
  const [calls, setCalls] = useState<LedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setLoading(true);
      setError(null);
    });

    const sb = getSupabase();

    async function load() {
      try {
        const { data, error: err } = await sb
          .rpc('ns_list_ledger_calls', {
            p_search: searchQuery.trim() || null,
            p_limit: 100,
          });
        if (err) throw err;
        if (!cancelled) setCalls(data ?? []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load calls');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [searchQuery, reloadKey]);

  return { calls, loading, error };
}

function useDebounce<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

interface TeamMember {
  id: string;
  name: string;
  email: string | null;
}

function useTeamMembers(): TeamMember[] {
  const [members, setMembers] = useState<TeamMember[]>([]);
  useEffect(() => {
    let cancelled = false;
    getSupabase()
      .rpc('ns_list_team_members')
      .then(
        ({ data }) => {
          if (!cancelled) setMembers((data as TeamMember[] | null) ?? []);
        },
        () => { /* leave empty */ },
      );
    return () => { cancelled = true; };
  }, []);
  return members;
}

// ─── Voice badge ──────────────────────────────────────────────────────────────

function VoiceBadge() {
  return (
    <span className="inline-flex items-center gap-1 mono text-[9px] uppercase tracking-[0.12em] px-1.5 py-0.5 rounded border border-[rgba(232,118,58,0.25)] bg-[rgba(232,118,58,0.10)] text-[#E8763A]">
      <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
        <rect x="2.5" y="0.5" width="3" height="5" rx="1.5" fill="currentColor" />
        <path d="M1 3.5C1 5.16 2.34 6.5 4 6.5C5.66 6.5 7 5.16 7 3.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
        <line x1="4" y1="6.5" x2="4" y2="7.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
      </svg>
      Voice
    </span>
  );
}

// ─── Bottom status bar ────────────────────────────────────────────────────────

// Bug 1 of the Atrium blockers goal (2026-05-13): the UI now tracks an
// explicit job lifecycle (queued → processing → done | failed) instead of
// inferring 'done' from an audit_log row. 'queued' shows after upload returns
// but before Inngest picks the job up.
export type UploadStage =
  | { state: 'uploading' }
  | { state: 'queued'; ledgerId: string; notionUrl: string | null }
  | { state: 'processing'; ledgerId: string; notionUrl: string | null }
  | {
      state: 'done';
      ledgerId: string;
      auditLogId: string | null;
      actionItems: number;
      decisions: number;
      mentions: number;
    }
  | { state: 'error'; message: string };

export function UploadStatusBar({ stage, onDismiss }: { stage: UploadStage; onDismiss: () => void }) {
  let label: string;
  let detail: string | null = null;
  let tone: 'progress' | 'done' | 'error' = 'progress';

  switch (stage.state) {
    case 'uploading':
      label = 'Uploading…';
      break;
    case 'queued':
      label = 'Queued…';
      break;
    case 'processing':
      label = 'Processing transcript…';
      break;
    case 'done':
      tone = 'done';
      label = `Done: ${stage.actionItems} to-do${stage.actionItems === 1 ? '' : 's'}, ${stage.decisions} decision${stage.decisions === 1 ? '' : 's'}, ${stage.mentions} mention${stage.mentions === 1 ? '' : 's'}`;
      detail = stage.auditLogId ? `audit_log ${stage.auditLogId.slice(0, 8)}` : null;
      break;
    case 'error':
      tone = 'error';
      label = stage.message;
      break;
  }

  const bg =
    tone === 'done'
      ? 'bg-[#1F8F4F] text-white'
      : tone === 'error'
      ? 'bg-[#E14B4B] text-white'
      : 'bg-[#0B1530] text-white';

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-3 px-5 py-3 rounded-full shadow-xl"
      style={{
        boxShadow: '0 12px 36px rgba(11,21,48,0.28)',
      }}
      data-testid="upload-status-bar"
    >
      <div className={`flex items-center gap-3 rounded-full px-5 py-2 ${bg}`}>
        {tone === 'progress' && (
          <svg
            className="animate-spin"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
            <path d="M12 2 A10 10 0 0 1 22 12" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
        )}
        {tone === 'done' && (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M5 12.5l4 4 10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
        <span className="mono text-[12px] font-medium">{label}</span>
        {detail && <span className="mono text-[10px] opacity-80">· {detail}</span>}
        {(stage.state === 'done' || stage.state === 'error') && (
          <button
            type="button"
            onClick={onDismiss}
            className="ml-1 text-[14px] leading-none opacity-80 hover:opacity-100"
            aria-label="Dismiss"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Upload + processing driver ───────────────────────────────────────────────
//
// Drives the entire post-submit lifecycle:
//   1. POST /api/atrium/calls/upload (modal already closed)
//   2. On 200/207, transition to processing and poll ns_call_processing_status
//   3. On state='done', flip to done and auto-dismiss after ~5s
//   4. Any error path → stage=error (no auto-dismiss; user clicks ✕)
//
// Uses an effect on stage to manage polling + auto-dismiss timers.

export function useUploadDriver(onAnyChange: () => void) {
  const [stage, setStage] = useState<UploadStage | null>(null);

  const dismiss = useCallback(() => setStage(null), []);

  const startUpload = useCallback(async (payload: UploadSubmitPayload) => {
    setStage({ state: 'uploading' });
    const sb = getSupabase();
    try {
      const { data: sessionData } = await sb.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) {
        setStage({ state: 'error', message: 'Not signed in — refresh and sign in to upload.' });
        return;
      }

      const res = await fetch('/api/atrium/calls/upload', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));

      if (!res.ok && res.status !== 207) {
        setStage({ state: 'error', message: (json?.error as string) ?? `Upload failed (HTTP ${res.status})` });
        return;
      }

      const ledgerId = (json?.ledger_id as string | null) ?? null;
      const notionUrl = (json?.notion_url as string | null) ?? null;

      if (!ledgerId) {
        if (res.status === 207 && notionUrl) {
          setStage({
            state: 'error',
            message: `Saved to Notion (${notionUrl}) but ledger write failed.`,
          });
          return;
        }
        setStage({ state: 'error', message: 'Upload returned no ledger_id.' });
        return;
      }

      // Bug 1: upload returned quickly. Show 'queued' until the Inngest
      // function flips the job to 'processing'.
      onAnyChange();
      setStage({ state: 'queued', ledgerId, notionUrl });
    } catch (err) {
      setStage({
        state: 'error',
        message: err instanceof Error ? err.message : 'Upload failed',
      });
    }
  }, [onAnyChange]);

  // Bug 1: poll the new job RPC every 5s. The 5-minute wall-clock window
  // gives multi-minute Inngest runs (LLM + per-action-item Notion writes)
  // plenty of headroom. The job's status is the source of truth for the
  // transition — the UI no longer infers 'done' from an audit row.
  useEffect(() => {
    if (!stage) return;
    if (stage.state === 'queued' || stage.state === 'processing') {
      const ledgerId = stage.ledgerId;
      const notionUrl = stage.notionUrl;
      const initialState = stage.state;
      let cancelled = false;
      let attempts = 0;
      const POLL_INTERVAL_MS = 5_000;
      const MAX_ATTEMPTS = 60; // ~5 minutes

      async function poll() {
        if (cancelled) return;
        attempts += 1;
        try {
          const { data, error } = await getSupabase().rpc('ns_get_call_processing_job', { p_call_id: ledgerId });
          if (cancelled) return;
          if (!error && Array.isArray(data) && data.length > 0) {
            const row = data[0] as {
              status: string;
              error_message: string | null;
              action_items_count: number;
              decisions_count: number;
              mentions_count: number;
              audit_log_id: string | null;
            };
            if (row.status === 'complete') {
              setStage({
                state: 'done',
                ledgerId,
                auditLogId: row.audit_log_id,
                actionItems: row.action_items_count,
                decisions: row.decisions_count,
                mentions: row.mentions_count,
              });
              onAnyChange();
              // Bug 1: notify the open ExpandedCallView so its sections
              // (Key Takeaways, Action Items, Decisions, Mentions) re-fetch
              // without the operator clicking refresh.
              window.dispatchEvent(new CustomEvent('atrium:call-processing-complete', {
                detail: { call_id: ledgerId },
              }));
              return;
            }
            if (row.status === 'failed') {
              setStage({
                state: 'error',
                message: row.error_message
                  ? `Failed: ${row.error_message}`
                  : 'Processing failed — see audit log.',
              });
              return;
            }
            if (row.status === 'processing' && initialState === 'queued') {
              setStage({ state: 'processing', ledgerId, notionUrl });
            }
          }
        } catch {
          /* keep polling */
        }
        if (attempts >= MAX_ATTEMPTS) {
          setStage({
            state: 'error',
            message: 'Processing timed out — refresh to see partial results.',
          });
          return;
        }
        setTimeout(poll, POLL_INTERVAL_MS);
      }
      const t = setTimeout(poll, 1500); // brief gap before first poll so Inngest can pick up the event
      return () => {
        cancelled = true;
        clearTimeout(t);
      };
    }
    if (stage.state === 'done') {
      const t = setTimeout(() => setStage(null), 6000);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [stage, onAnyChange]);

  return { stage, startUpload, dismiss };
}

// ─── Main export ──────────────────────────────────────────────────────────────

export interface CallsLogProps {
  /**
   * Bug 2 of the Atrium blockers goal (2026-05-13): when /work/calls/<id>
   * is the URL, the detail modal opens immediately on mount.
   */
  initialDetailCallId?: string;
  onDetailChange?: (callId: string | undefined) => void;
}

export function CallsLog({ initialDetailCallId, onDetailChange }: CallsLogProps = {}) {
  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 300);
  const [detail, setDetail] = useState<LedgerRow | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [participantFilter, setParticipantFilter] = useState<string>(readPersistedFilter);
  const { calls: rawCalls, loading, error } = useCallsLog(search, reloadKey);
  const teamMembers = useTeamMembers();

  const triggerReload = useCallback(() => setReloadKey((k) => k + 1), []);
  const { stage, startUpload, dismiss } = useUploadDriver(triggerReload);

  // Bug 2: open the detail modal automatically when the URL carries a call id.
  // We try once the calls list has loaded — if the id doesn't appear in the
  // first page, we fetch the single row directly so deep-links work even when
  // the call is older than the list cap.
  useEffect(() => {
    if (!initialDetailCallId) return;
    if (detail && detail.id === initialDetailCallId) return;
    const fromList = rawCalls.find((r) => r.id === initialDetailCallId);
    if (fromList) {
      setDetail(fromList);
      return;
    }
    if (loading) return;
    let cancelled = false;
    getSupabase()
      .rpc('ns_get_call_ledger_row', { p_call_id: initialDetailCallId })
      .then(
        ({ data }) => {
          if (cancelled) return;
          const row = ((data as LedgerRow[] | null) ?? [])[0];
          if (row) setDetail(row);
        },
        () => { /* leave detail null — list still renders */ },
      );
    return () => { cancelled = true; };
  }, [initialDetailCallId, rawCalls, loading, detail]);

  useEffect(() => {
    writePersistedFilter(participantFilter);
  }, [participantFilter]);

  // Sprint 8 F9 fix (2026-05-14): the topbar phone-icon button now mounts its
  // own modal in AtriumLayout so it can overlay any tab without first
  // navigating away. The prior 'atrium:open-upload-call' window event handler
  // lived here only because CallsLog already owned the modal — now lifted, the
  // event listener is no longer needed.

  const calls = participantFilter === 'all'
    ? rawCalls
    : rawCalls.filter((row) => getParticipantList(row).includes(participantFilter));

  const uploadModal = (
    <UploadCallModal
      open={uploadOpen}
      onClose={() => setUploadOpen(false)}
      onSubmit={(payload) => { void startUpload(payload); }}
    />
  );

  const statusBar = stage ? <UploadStatusBar stage={stage} onDismiss={dismiss} /> : null;

  if (loading) {
    return (
      <>
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 bg-bg-card rounded-xl animate-pulse" />
          ))}
        </div>
        {uploadModal}
        {statusBar}
      </>
    );
  }

  if (error) {
    return (
      <>
        <div className="bg-[#E14B4B]/10 border border-[#E14B4B]/30 rounded-xl px-5 py-4">
          <div className="mono text-[12px] text-[#E14B4B]">{error}</div>
        </div>
        {uploadModal}
        {statusBar}
      </>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={participantFilter}
          onChange={(e) => setParticipantFilter(e.target.value)}
          className="bg-bg-card border border-border-default rounded-lg px-2.5 py-2 mono text-[11px] text-text-primary focus:outline-none focus:border-border-hover"
          aria-label="Filter calls by participant"
        >
          <option value="all">All calls</option>
          {teamMembers.map((m) => (
            <option key={m.id} value={m.name}>{m.name}'s calls</option>
          ))}
        </select>
        <div className="relative flex-1 sm:flex-none sm:w-80">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" width="12" height="12" viewBox="0 0 12 12" fill="none">
            <circle cx="5" cy="5" r="4" stroke="currentColor" strokeWidth="1.2" />
            <line x1="8.5" y1="8.5" x2="11" y2="11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Semantic search calls…"
            className="w-full bg-bg-card border border-border-default rounded-lg pl-8 pr-3 py-2 mono text-[12px] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-border-hover"
          />
        </div>
        <button
          type="button"
          onClick={() => setUploadOpen(true)}
          className="mono text-[10.5px] uppercase tracking-[0.14em] font-semibold px-3 py-2 rounded-lg bg-[#0B1530] text-white hover:bg-[#0B1530]/90 transition-colors"
        >
          + Upload call
        </button>
        {calls.length > 0 && (
          <span className="mono text-[10px] text-text-muted">{calls.length} call{calls.length !== 1 ? 's' : ''}</span>
        )}
      </div>

      {calls.length === 0 ? (
        <div className="bg-bg-card border border-border-default rounded-xl px-5 py-8 text-center">
          <div className="mono text-[11px] uppercase tracking-[0.18em] text-text-muted mb-1">
            {search ? 'No calls match this search.' : 'No calls logged yet'}
          </div>
          {!search && (
            <div className="mono text-[11px] text-text-muted">
              Use <span className="font-semibold text-text-secondary">+ Upload call</span> to paste a transcript, or wait for an auto-ingestion connector (Plaud / Fathom / Zoom).
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {calls.map((call) => {
            const voice = isVoiceCall(call);
            const title = typeof call.insights?.['title'] === 'string' ? (call.insights['title'] as string) : null;
            const notionUrl = typeof call.insights?.['notion_url'] === 'string' ? (call.insights['notion_url'] as string) : null;
            const participants = getParticipantList(call);
            return (
              <div
                key={call.id}
                onClick={() => { setDetail(call); onDetailChange?.(call.id); }}
                className="bg-bg-card border border-border-default rounded-xl px-4 py-3 hover:border-border-hover transition-colors cursor-pointer"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setDetail(call);
                    onDetailChange?.(call.id);
                  }
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      {voice && <VoiceBadge />}
                      <span className="mono text-[9px] uppercase tracking-[0.14em] text-text-muted">
                        {formatRelativeTime(call.created_at)}
                      </span>
                      {participants.length > 0 && (
                        <span className="mono text-[9px] text-text-muted">· {participants.slice(0, 3).join(', ')}{participants.length > 3 ? ` +${participants.length - 3}` : ''}</span>
                      )}
                    </div>
                    {title && (
                      <div className="mono text-[12px] font-medium text-text-primary mb-0.5 line-clamp-1">
                        {title}
                      </div>
                    )}
                    <div className="mono text-[11px] text-text-primary leading-relaxed line-clamp-2">
                      {call.content_summary
                        ? call.content_summary.slice(0, 160)
                        : call.content_full
                        ? call.content_full.slice(0, 160)
                        : 'No summary available.'}
                    </div>
                    {notionUrl && (
                      <a
                        href={notionUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="mono text-[9.5px] uppercase tracking-[0.14em] text-[#6081BE] hover:underline mt-1 inline-block"
                      >
                        Open in Notion ›
                      </a>
                    )}
                  </div>
                  <div className="mono text-[10px] text-text-muted shrink-0 mt-0.5">›</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {detail && (
        <ExpandedCallView
          call={detail as CallRow}
          onClose={() => { setDetail(null); onDetailChange?.(undefined); }}
        />
      )}

      {uploadModal}
      {statusBar}
    </div>
  );
}
