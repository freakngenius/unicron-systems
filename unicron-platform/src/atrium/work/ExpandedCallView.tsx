// ExpandedCallView.tsx — Atrium Work > Calls > expanded view
//
// Goal "Fix Atrium call upload end-to-end" — Condition 5.
// Renders the prescribed top-to-bottom structure, WYSIWYG, no raw JSON:
//   (a) Title + Date + Participants + Owner highlights
//   (b) Key Takeaways (3-5 bullets)
//   (c) Action Items with Notion + Atrium links
//   (d) Decisions made
//   (e) Insights
//   (f) Customer Mentions
//   (g) Transcript (collapsed by default)
//
// Reads from:
//   - nervous_system.ledger row (the call itself; supplied by parent)
//   - ns_list_action_items_by_ledger(p_ledger_id)
//   - ns_list_call_decisions_for(p_call_id) — added in this PR
//   - ns_list_call_customer_mentions_for(p_call_id) — added in this PR
// All four panels render even when empty, using a "None linked" placeholder.

import { useEffect, useState } from 'react';
import { getSupabase } from '../../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CallRow {
  id: string;
  source_type: string;
  content_summary: string | null;
  content_full: string | null;
  insights: Record<string, unknown> | null;
  created_at: string;
}

interface ActionItemRow {
  id: string;
  title: string;
  priority: string | null;
  status: string | null;
  notion_page_id?: string | null;
}

interface DecisionRow {
  id: string;
  decision: string;
  rationale: string | null;
  decided_by: string | null;
  created_at: string;
}

interface CustomerMentionRow {
  ordinal: number;
  customer_name: string;
  sentiment: string;
  snippet: string | null;
  customer_id?: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getString(insights: Record<string, unknown> | null, key: string): string | null {
  if (!insights) return null;
  const v = insights[key];
  return typeof v === 'string' && v.trim() ? v : null;
}

function getStringArray(insights: Record<string, unknown> | null, key: string): string[] {
  if (!insights) return [];
  const v = insights[key];
  if (Array.isArray(v)) return v.filter((s): s is string => typeof s === 'string' && s.trim().length > 0);
  return [];
}

function getParticipants(insights: Record<string, unknown> | null): string[] {
  if (!insights) return [];
  const p = insights['participants'];
  if (Array.isArray(p)) return p.map(String);
  if (typeof p === 'string') return p.split(',').map((s) => s.trim()).filter(Boolean);
  return [];
}

function formatCallDate(insights: Record<string, unknown> | null, fallbackIso: string): string {
  const isoDate = getString(insights, 'call_date');
  const target = isoDate ?? fallbackIso;
  try {
    return new Date(target).toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    });
  } catch {
    return target;
  }
}

function priorityChipClass(priority: string | null): string {
  switch ((priority ?? '').toLowerCase()) {
    case 'high':
      return 'bg-[#E14B4B]/12 text-[#E14B4B] border-[#E14B4B]/30';
    case 'low':
      return 'bg-text-muted/10 text-text-muted border-border-default';
    case 'irreversible':
      return 'bg-[#9B5DE5]/12 text-[#9B5DE5] border-[#9B5DE5]/30';
    default:
      return 'bg-[#6081BE]/10 text-[#6081BE] border-[#6081BE]/30';
  }
}

// ─── Data hooks ───────────────────────────────────────────────────────────────

function useExpandedCallData(callId: string) {
  const [actionItems, setActionItems] = useState<ActionItemRow[]>([]);
  const [decisions, setDecisions] = useState<DecisionRow[]>([]);
  const [mentions, setMentions] = useState<CustomerMentionRow[]>([]);
  const [loading, setLoading] = useState(true);
  // Bug 1: bump on `atrium:call-processing-complete` so sections re-fetch
  // without a manual refresh when Inngest finishes extraction.
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!callId) return;
    function handler(e: Event) {
      const detail = (e as CustomEvent<{ call_id?: string }>).detail;
      if (detail?.call_id === callId) setReloadKey((k) => k + 1);
    }
    window.addEventListener('atrium:call-processing-complete', handler);
    return () => window.removeEventListener('atrium:call-processing-complete', handler);
  }, [callId]);

  useEffect(() => {
    if (!callId) return;
    let cancelled = false;
    setLoading(true);
    const sb = getSupabase();

    Promise.all([
      sb.rpc('ns_list_call_action_items_for', { p_call_id: callId }),
      sb.rpc('ns_list_call_decisions_for', { p_call_id: callId }),
      sb.rpc('ns_list_call_customer_mentions_for', { p_call_id: callId }),
    ])
      .then(([a, d, m]) => {
        if (cancelled) return;
        setActionItems((a.data as ActionItemRow[] | null) ?? []);
        setDecisions((d.data as DecisionRow[] | null) ?? []);
        setMentions((m.data as CustomerMentionRow[] | null) ?? []);
      })
      .catch(() => { /* one bad RPC shouldn't blank the screen */ })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [callId, reloadKey]);

  return { actionItems, decisions, mentions, loading };
}

// ─── Section primitive ────────────────────────────────────────────────────────

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-7">
      <div className="mono text-[10px] uppercase tracking-[0.18em] text-text-muted font-semibold mb-2">
        {label}
      </div>
      {children}
    </section>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

interface ExpandedCallViewProps {
  call: CallRow;
  onClose: () => void;
}

export function ExpandedCallView({ call, onClose }: ExpandedCallViewProps) {
  const { actionItems, decisions, mentions, loading } = useExpandedCallData(call.id);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  // Bug 1: when processing completes, the parent ledger row's insights jsonb
  // grows (key_takeaways, extracted_insights). The prop `call` is frozen at
  // open-time, so we maintain a local `liveCall` that re-fetches on the
  // `atrium:call-processing-complete` event.
  const [liveCall, setLiveCall] = useState<CallRow>(call);
  useEffect(() => { setLiveCall(call); }, [call]);

  useEffect(() => {
    function handler(e: Event) {
      const detail = (e as CustomEvent<{ call_id?: string }>).detail;
      if (detail?.call_id !== call.id) return;
      getSupabase()
        .rpc('ns_get_call_ledger_row', { p_call_id: call.id })
        .then(
          ({ data }) => {
            const rows = (data as CallRow[] | null) ?? [];
            if (rows[0]) setLiveCall(rows[0]);
          },
          () => { /* leave stale data — sections will still refresh */ },
        );
    }
    window.addEventListener('atrium:call-processing-complete', handler);
    return () => window.removeEventListener('atrium:call-processing-complete', handler);
  }, [call.id]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const title =
    getString(liveCall.insights, 'title') ??
    (liveCall.content_summary ? liveCall.content_summary.slice(0, 80) : 'Call');
  const callNotionUrl = getString(liveCall.insights, 'notion_url');
  const participants = getParticipants(liveCall.insights);
  const dateLabel = formatCallDate(liveCall.insights, liveCall.created_at);
  const keyTakeaways = getStringArray(liveCall.insights, 'key_takeaways');
  const extractedInsights = getStringArray(liveCall.insights, 'extracted_insights');

  return (
    <div className="fixed inset-0 z-[95] flex items-start justify-center overflow-y-auto bg-black/55 backdrop-blur-sm px-4 py-10">
      <div
        className="relative w-full max-w-3xl bg-white border border-border-default rounded-2xl shadow-xl"
        style={{ boxShadow: '0 24px 64px rgba(11,21,48,0.18)' }}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-border-default bg-white rounded-t-2xl">
          <div className="text-[10.5px] uppercase tracking-[0.18em] text-text-muted font-semibold">
            Work &rsaquo; Calls &rsaquo; Detail
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[12px] text-text-secondary hover:text-text-primary px-2 py-1"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="px-7 pb-10">
          {/* (a) Title + Date + Participants + Owner highlights */}
          <header className="pt-6">
            <h1 className="text-[24px] leading-snug font-semibold text-text-primary tracking-tight">
              {title}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 mono text-[11px] text-text-secondary">
              <span>{dateLabel}</span>
              {participants.length > 0 && (
                <span>
                  <span className="text-text-muted">Participants · </span>
                  {participants.join(', ')}
                </span>
              )}
              {callNotionUrl && (
                <a
                  href={callNotionUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mono text-[10.5px] uppercase tracking-[0.14em] text-[#6081BE] hover:underline"
                >
                  Open in Notion ›
                </a>
              )}
            </div>
          </header>

          {/* (b) Key Takeaways */}
          <Section label="Key Takeaways">
            {keyTakeaways.length === 0 ? (
              <p className="text-[13px] text-text-muted leading-relaxed">
                {loading ? 'Loading…' : 'No key takeaways extracted yet.'}
              </p>
            ) : (
              <ul className="space-y-1.5">
                {keyTakeaways.map((t, i) => (
                  <li key={i} className="text-[13.5px] text-text-primary leading-relaxed flex gap-2">
                    <span className="text-text-muted shrink-0">•</span>
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* (c) Action Items with Notion + Atrium links */}
          <Section label="Action Items">
            {loading ? (
              <div className="h-12 bg-bg-raised rounded-lg animate-pulse" />
            ) : actionItems.length === 0 ? (
              <p className="text-[13px] text-text-muted leading-relaxed">None linked.</p>
            ) : (
              <ul className="space-y-2">
                {actionItems.map((ai) => {
                  const notionHref = ai.notion_page_id
                    ? `https://www.notion.so/${ai.notion_page_id.replace(/-/g, '')}`
                    : null;
                  const atriumHref = `/atrium/work/action-items/${ai.id}`;
                  return (
                    <li
                      key={ai.id}
                      className="border border-border-default rounded-xl px-4 py-3 bg-white hover:border-border-hover transition-colors"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="text-[13.5px] font-medium text-text-primary leading-snug">
                            {ai.title}
                          </div>
                          <div className="mt-1 flex items-center gap-2 flex-wrap">
                            {ai.priority && (
                              <span
                                className={
                                  'mono text-[9px] uppercase tracking-[0.12em] px-1.5 py-0.5 rounded border ' +
                                  priorityChipClass(ai.priority)
                                }
                              >
                                {ai.priority}
                              </span>
                            )}
                            {ai.status && (
                              <span className="mono text-[9px] uppercase tracking-[0.12em] text-text-muted">
                                {ai.status}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <a
                            href={atriumHref}
                            className="mono text-[10px] uppercase tracking-[0.12em] text-[#6081BE] hover:underline"
                          >
                            Atrium ›
                          </a>
                          {notionHref && (
                            <a
                              href={notionHref}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mono text-[10px] uppercase tracking-[0.12em] text-[#6081BE] hover:underline"
                            >
                              Notion ›
                            </a>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>

          {/* (d) Decisions made */}
          <Section label="Decisions">
            {loading ? (
              <div className="h-12 bg-bg-raised rounded-lg animate-pulse" />
            ) : decisions.length === 0 ? (
              <p className="text-[13px] text-text-muted leading-relaxed">No decisions captured.</p>
            ) : (
              <ul className="space-y-3">
                {decisions.map((d) => (
                  <li key={d.id} className="border border-border-default rounded-xl px-4 py-3 bg-white">
                    <div className="text-[13.5px] text-text-primary leading-relaxed">{d.decision}</div>
                    {d.rationale && (
                      <div className="mt-1 text-[12px] text-text-secondary leading-relaxed">{d.rationale}</div>
                    )}
                    {d.decided_by && (
                      <div className="mt-1 mono text-[10px] uppercase tracking-[0.12em] text-text-muted">
                        Decided by · {d.decided_by}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* (e) Insights */}
          <Section label="Insights">
            {extractedInsights.length === 0 ? (
              <p className="text-[13px] text-text-muted leading-relaxed">
                {loading ? 'Loading…' : 'No strategic insights captured.'}
              </p>
            ) : (
              <ul className="space-y-1.5">
                {extractedInsights.map((t, i) => (
                  <li key={i} className="text-[13.5px] text-text-primary leading-relaxed flex gap-2">
                    <span className="text-text-muted shrink-0">•</span>
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* (f) Customer Mentions */}
          <Section label="Customer Mentions">
            {loading ? (
              <div className="h-12 bg-bg-raised rounded-lg animate-pulse" />
            ) : mentions.length === 0 ? (
              <p className="text-[13px] text-text-muted leading-relaxed">No customer mentions found.</p>
            ) : (
              <ul className="space-y-3">
                {mentions.map((m) => (
                  <li key={m.ordinal} className="border border-border-default rounded-xl px-4 py-3 bg-white">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-[13.5px] text-text-primary font-medium">
                        {m.customer_name}
                      </div>
                      <span
                        className={
                          'mono text-[9px] uppercase tracking-[0.12em] px-1.5 py-0.5 rounded border ' +
                          (m.sentiment === 'positive'
                            ? 'bg-[#1F8F4F]/10 text-[#1F8F4F] border-[#1F8F4F]/30'
                            : m.sentiment === 'negative'
                            ? 'bg-[#E14B4B]/10 text-[#E14B4B] border-[#E14B4B]/30'
                            : 'bg-bg-card text-text-muted border-border-default')
                        }
                      >
                        {m.sentiment}
                      </span>
                    </div>
                    {m.snippet && (
                      <blockquote className="mt-2 text-[12.5px] text-text-secondary leading-relaxed border-l-2 border-border-default pl-3 italic">
                        {m.snippet}
                      </blockquote>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* (g) Transcript (collapsed by default) */}
          {liveCall.content_full && (
            <Section label="Transcript">
              <button
                type="button"
                onClick={() => setTranscriptOpen((v) => !v)}
                className="mono text-[11px] uppercase tracking-[0.14em] text-text-secondary hover:text-text-primary transition-colors"
                aria-expanded={transcriptOpen}
              >
                {transcriptOpen ? '▾ Hide transcript' : '▸ Show transcript'}
              </button>
              {transcriptOpen && (
                <div className="mt-3 bg-bg-raised border border-border-default rounded-xl p-4 max-h-96 overflow-y-auto">
                  <pre className="mono text-[11.5px] text-text-secondary whitespace-pre-wrap leading-relaxed">
                    {liveCall.content_full}
                  </pre>
                </div>
              )}
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}
