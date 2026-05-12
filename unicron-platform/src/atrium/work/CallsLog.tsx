// CallsLog.tsx — Sprint 4 Stream D / W-5 upgrade
// W-5: inline split-panel detail, voice badge on voice-agent calls, semantic search bar.

import { useState, useEffect } from 'react';
import { getSupabase } from '../../lib/supabase';
import { UploadCallModal } from './UploadCallModal';

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

interface ActionItemRow {
  id: string;
  title: string;
  priority: string;
  status: string;
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

function getParticipants(insights: Record<string, unknown> | null): string {
  if (!insights) return '—';
  const p = insights['participants'];
  if (Array.isArray(p)) return p.join(', ');
  if (typeof p === 'string') return p;
  return '—';
}

function getParticipantList(row: LedgerRow): string[] {
  const insights = row.insights;
  if (!insights) return [];
  const p = insights['participants'];
  if (Array.isArray(p)) return p.map(String);
  if (typeof p === 'string') return p.split(',').map((s) => s.trim()).filter(Boolean);
  return [];
}

// Filter state is persisted across page refreshes via sessionStorage.
// Defaults to 'all' when nothing is stored (or sessionStorage isn't available
// during SSR / jsdom test envs).
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
    /* sessionStorage disabled in private windows */
  }
}

function getDecisions(insights: Record<string, unknown> | null): string[] {
  if (!insights) return [];
  const d = insights['decisions'];
  if (Array.isArray(d)) return d.map(String);
  return [];
}

function getQuotes(insights: Record<string, unknown> | null): string[] {
  if (!insights) return [];
  const q = insights['quotes'];
  if (Array.isArray(q)) return q.map(String);
  return [];
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

function useCallsLog(searchQuery: string, reloadKey: number) {
  const [calls, setCalls] = useState<LedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const sb = getSupabase();

    async function load() {
      try {
        // PGRST106 fix: use ns_list_ledger_calls RPC
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

function useCallDetail(callId: string | null) {
  const [actionItems, setActionItems] = useState<ActionItemRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!callId) { setActionItems([]); return; }
    let cancelled = false;
    setLoading(true);

    // PGRST106 fix: use ns_list_action_items_by_ledger RPC
    getSupabase()
      .rpc('ns_list_action_items_by_ledger', { p_ledger_id: callId })
      .then(({ data }) => {
        if (!cancelled) { setActionItems((data as ActionItemRow[] | null) ?? []); setLoading(false); }
      }, () => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [callId]);

  return { actionItems, loading };
}

// ─── Semantic search with debounce ────────────────────────────────────────────

function useDebounce<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
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

// ─── Inline detail panel ──────────────────────────────────────────────────────

function CallDetailPanel({ call, onClose }: { call: LedgerRow; onClose: () => void }) {
  const { actionItems, loading: aiLoading } = useCallDetail(call.id);
  const participants = getParticipants(call.insights);
  const decisions = getDecisions(call.insights);
  const quotes = getQuotes(call.insights);
  const voice = isVoiceCall(call);

  return (
    <div className="flex flex-col h-full bg-bg-card border border-border-default rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-default shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {voice && <VoiceBadge />}
          <div>
            <div className="mono text-[11px] font-medium text-text-primary">Call Detail</div>
            <div className="mono text-[9px] text-text-muted">
              {new Date(call.created_at).toLocaleDateString('en-US', {
                weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
              })}
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="mono text-[10px] uppercase tracking-[0.14em] text-text-muted hover:text-text-primary transition-colors shrink-0"
        >
          ✕
        </button>
      </div>

      <div className="overflow-y-auto flex-1 px-4 py-4 space-y-4">
        {/* Meta */}
        <div className="space-y-1.5">
          {[
            { label: 'Participants', value: participants },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-baseline gap-3">
              <div className="mono text-[9px] uppercase tracking-[0.16em] text-text-muted w-24 shrink-0">{label}</div>
              <div className="mono text-[11px] text-text-primary min-w-0 truncate">{value}</div>
            </div>
          ))}
        </div>

        {/* Summary */}
        {call.content_summary && (
          <div>
            <div className="mono text-[9px] uppercase tracking-[0.16em] text-text-muted mb-1.5">Summary</div>
            <div className="mono text-[11px] text-text-primary leading-relaxed">{call.content_summary}</div>
          </div>
        )}

        {/* Decisions */}
        {decisions.length > 0 && (
          <div>
            <div className="mono text-[9px] uppercase tracking-[0.16em] text-text-muted mb-1.5">Decisions</div>
            <div className="space-y-1">
              {decisions.map((d, i) => (
                <div key={i} className="flex gap-2">
                  <span className="mono text-[9px] text-text-muted mt-1">·</span>
                  <span className="mono text-[11px] text-text-primary leading-relaxed">{d}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action items */}
        <div>
          <div className="mono text-[9px] uppercase tracking-[0.16em] text-text-muted mb-1.5">Action Items</div>
          {aiLoading ? (
            <div className="h-8 bg-bg-raised rounded-lg animate-pulse" />
          ) : actionItems.length === 0 ? (
            <div className="mono text-[11px] text-text-muted">None linked.</div>
          ) : (
            <div className="space-y-1.5">
              {actionItems.map((ai) => (
                <div key={ai.id} className="flex items-center justify-between gap-2 bg-bg-raised border border-border-default rounded-lg px-3 py-2">
                  <div className="mono text-[11px] text-text-primary truncate">{ai.title}</div>
                  <span className="mono text-[9px] uppercase tracking-[0.12em] text-text-muted shrink-0">{ai.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quotes */}
        {quotes.length > 0 && (
          <div>
            <div className="mono text-[9px] uppercase tracking-[0.16em] text-text-muted mb-1.5">Quotes</div>
            <div className="space-y-2">
              {quotes.map((q, i) => (
                <blockquote key={i} className="border-l-2 border-accent pl-3 mono text-[11px] text-text-secondary italic leading-relaxed">
                  {q}
                </blockquote>
              ))}
            </div>
          </div>
        )}

        {/* Transcript */}
        {call.content_full && (
          <div>
            <div className="mono text-[9px] uppercase tracking-[0.16em] text-text-muted mb-1.5">Transcript</div>
            <div className="bg-bg-raised border border-border-default rounded-lg p-3 max-h-64 overflow-y-auto">
              <pre className="mono text-[10px] text-text-secondary whitespace-pre-wrap leading-relaxed">{call.content_full}</pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

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
      .then(({ data }) => {
        if (!cancelled) setMembers((data as TeamMember[] | null) ?? []);
      })
      .catch(() => { /* leave empty */ });
    return () => { cancelled = true; };
  }, []);
  return members;
}

export function CallsLog() {
  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 300);
  const [detail, setDetail] = useState<LedgerRow | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [participantFilter, setParticipantFilter] = useState<string>(readPersistedFilter);
  const { calls: rawCalls, loading, error } = useCallsLog(search, reloadKey);
  const teamMembers = useTeamMembers();

  // Persist filter selection across refreshes.
  useEffect(() => {
    writePersistedFilter(participantFilter);
  }, [participantFilter]);

  // Client-side filter — ledger calls only have ~100 rows, so a server-side
  // filter would be over-engineered. When C4 mirror migration lands and we
  // switch the read RPC to ns_list_calls, the filter can move server-side
  // for free via the p_participant arg.
  const calls = participantFilter === 'all'
    ? rawCalls
    : rawCalls.filter((row) => getParticipantList(row).includes(participantFilter));

  // The UploadCallModal is rendered alongside every list state (loading /
  // error / empty / populated) so that an in-flight upload survives the
  // refetch triggered by onUploaded → reloadKey++. Previously the loading
  // and error early-returns dropped the modal from the tree, causing it to
  // unmount mid-submit and remount with fresh state — the user saw a blank
  // form pop back into place instead of the success view.
  const uploadModal = (
    <UploadCallModal
      open={uploadOpen}
      onClose={() => setUploadOpen(false)}
      onUploaded={() => setReloadKey((k) => k + 1)}
    />
  );

  if (loading) {
    return (
      <>
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 bg-bg-card rounded-xl animate-pulse" />
          ))}
        </div>
        {uploadModal}
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
      </>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Semantic search bar + participant filter */}
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
        /* Split-panel layout — list + optional detail side by side */
        <div className={`flex gap-4 ${detail ? 'items-start' : ''}`}>
          {/* Call list */}
          <div className={`flex flex-col gap-2 ${detail ? 'w-72 shrink-0' : 'flex-1'}`}>
            {calls.map((call) => {
              const voice = isVoiceCall(call);
              const isSelected = detail?.id === call.id;
              const title = typeof call.insights?.['title'] === 'string' ? (call.insights['title'] as string) : null;
              const notionUrl = typeof call.insights?.['notion_url'] === 'string' ? (call.insights['notion_url'] as string) : null;
              const participants = getParticipantList(call);
              return (
                <div
                  key={call.id}
                  onClick={() => setDetail(isSelected ? null : call)}
                  className="bg-bg-card border rounded-xl px-4 py-3 hover:border-border-hover transition-colors cursor-pointer"
                  style={{ borderColor: isSelected ? 'rgba(232,118,58,0.25)' : 'var(--border-default)' }}
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
                      <div className={`mono text-[11px] text-text-primary leading-relaxed ${detail ? 'line-clamp-2' : 'line-clamp-2'}`}>
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
                    <div className="mono text-[10px] text-text-muted shrink-0 mt-0.5">
                      {isSelected ? '▸' : '›'}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Detail panel */}
          {detail && (
            <div className="flex-1 min-w-0" style={{ minHeight: '400px' }}>
              <CallDetailPanel call={detail} onClose={() => setDetail(null)} />
            </div>
          )}
        </div>
      )}

      {uploadModal}
    </div>
  );
}
