import { useMemo, useState } from 'react';
import { AgentModalShell } from '../../components/agent-console/AgentModalShell';
import { AgentHistoryGrid } from '../../components/agent-console/AgentHistoryGrid';
import { crossPollinationAgent } from '../../lib/agents/crossPollinationAgent';
import { createDispatch, requeueDispatch, verifyDispatch } from '../../lib/agentConsoleClient';
import { listCrossPollinationMatches } from '../../lib/crossPollinationClient';
import {
  type CrossPollinationMatch,
  bucketFor,
} from '../../lib/contracts/crossPollination';
import type { AgentDispatch } from '../../lib/contracts/agentConsole';

interface Props {
  onClose: () => void;
  bridge?: CrossPollinationBridge;
}

export interface CrossPollinationBridge {
  createDispatch: typeof createDispatch;
  verifyDispatch: typeof verifyDispatch;
  listMatches: typeof listCrossPollinationMatches;
}

const REAL_BRIDGE: CrossPollinationBridge = {
  createDispatch,
  verifyDispatch,
  listMatches: listCrossPollinationMatches,
};

const ORG_ID = 'zedcor';

type Phase =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'review'; matches: CrossPollinationMatch[]; dispatch: AgentDispatch }
  | { kind: 'failed'; error: string };

export function CrossPollinationModal({ onClose, bridge = REAL_BRIDGE }: Props) {
  const [leadInput, setLeadInput] = useState('');
  const [threshold, setThreshold] = useState(0.7);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [verifiedIds, setVerifiedIds] = useState<Set<string>>(new Set());
  const [rejectedIds, setRejectedIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const onSearch = async () => {
    setPhase({ kind: 'loading' });
    try {
      const ids = leadInput
        .split(/[\s,]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const matches = await bridge.listMatches({
        lead_ids: ids.length > 0 ? ids : undefined,
        customer_org_id: ORG_ID,
        min_confidence: threshold,
      });
      const dispatch = await bridge.createDispatch({
        agent_name: crossPollinationAgent.name,
        customer_org_id: ORG_ID,
        input_payload: { lead_ids: ids, threshold, summary: summarize(ids, threshold) },
      });
      setPhase({ kind: 'review', matches, dispatch });
      // Auto-verify high-confidence matches on load so the operator only
      // reviews the ambiguous band. Done at transition time rather than via
      // an effect to keep React state derivation explicit.
      const autoVerified = new Set(
        matches.filter((m) => bucketFor(m.match_confidence) === 'high').map((m) => m.id),
      );
      setVerifiedIds(autoVerified);
      setRejectedIds(new Set());
    } catch (e) {
      setPhase({ kind: 'failed', error: e instanceof Error ? e.message : String(e) });
    }
  };

  const onVerify = async (match: CrossPollinationMatch) => {
    if (phase.kind !== 'review') return;
    setBusy(true);
    try {
      // Pathfinder schema lacks verified_/rejected_ columns (operator-todo
      // 2026-05-02-pathfinder-cross-pollination-verify-schema.md). Record the
      // operator decision in unicron.agent_dispatches only — when Pathfinder
      // ships the schema, M5 flips a flag to also write the Pathfinder row.
      await bridge.verifyDispatch({
        id: phase.dispatch.id,
        verified_by_user_id: 'operator-mock',
        result_payload: {
          verified_match_ids: [...Array.from(verifiedIds), match.id],
          rejected_match_ids: Array.from(rejectedIds),
        },
      });
      setVerifiedIds((prev) => {
        const next = new Set(prev);
        next.add(match.id);
        return next;
      });
    } catch (e) {
      setPhase({ kind: 'failed', error: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  const onReject = (match: CrossPollinationMatch) => {
    setRejectedIds((prev) => {
      const next = new Set(prev);
      next.add(match.id);
      return next;
    });
  };

  const counts = useMemo(() => {
    if (phase.kind !== 'review') return { high: 0, ambiguous: 0, low: 0 };
    return phase.matches.reduce(
      (acc, m) => {
        const b = bucketFor(m.match_confidence);
        acc[b] += 1;
        return acc;
      },
      { high: 0, ambiguous: 0, low: 0 },
    );
  }, [phase]);

  const status =
    phase.kind === 'idle'
      ? 'idle'
      : phase.kind === 'loading'
        ? 'running'
        : phase.kind === 'review'
          ? 'awaiting_review'
          : 'failed';

  return (
    <AgentModalShell
      agent={crossPollinationAgent}
      status={status}
      costUsd={null}
      recentRunsCount={null}
      onClose={onClose}
    >
      <div className="max-w-4xl mx-auto flex flex-col gap-6">
        {phase.kind === 'idle' || phase.kind === 'failed' ? (
          <form
            data-testid="cross-pollination-input-form"
            onSubmit={async (e) => {
              e.preventDefault();
              await onSearch();
            }}
            className="flex flex-col gap-4"
          >
            <FieldRow
              label="LEAD ID OR BATCH"
              hint="Single id or comma/whitespace-separated list. Leave blank to query the entire org."
            >
              <textarea
                value={leadInput}
                onChange={(e) => setLeadInput(e.target.value)}
                rows={2}
                placeholder="e.g. lead-pgh-3401, lead-hou-2207"
                data-testid="cross-pollination-lead-input"
                className={inputClass}
              />
            </FieldRow>
            <FieldRow label={`MATCH CONFIDENCE THRESHOLD — ${threshold.toFixed(2)}`}>
              <input
                type="range"
                min={0.5}
                max={1}
                step={0.01}
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
                data-testid="cross-pollination-threshold"
                className="w-full accent-accent-gold"
              />
            </FieldRow>
            <FieldRow label="CUSTOMER CORPUS">
              <input type="text" value={ORG_ID} disabled className={inputClass} />
            </FieldRow>
            {phase.kind === 'failed' ? (
              <p
                data-testid="cross-pollination-error"
                className="mono text-[11px] uppercase tracking-[0.18em] text-rose-400"
              >
                {phase.error}
              </p>
            ) : null}
            <button
              type="submit"
              data-testid="cross-pollination-dispatch-button"
              className="self-end mono text-[11px] uppercase tracking-[0.18em] border border-text-primary px-4 py-2 rounded-md text-text-primary hover:bg-text-primary hover:text-bg-base transition-colors"
            >
              SEARCH MATCHES
            </button>
          </form>
        ) : null}

        {phase.kind === 'loading' ? (
          <p className="mono text-[11px] uppercase tracking-[0.18em] text-text-primary/40">
            LOADING MATCHES…
          </p>
        ) : null}

        {phase.kind === 'review' ? (
          <section
            data-testid="cross-pollination-review"
            className="flex flex-col gap-4"
          >
            <header className="flex items-baseline justify-between">
              <span className="mono text-[10px] uppercase tracking-[0.18em] text-text-primary/50">
                {phase.matches.length} MATCHES — {counts.high} HIGH · {counts.ambiguous} AMBIGUOUS ·{' '}
                {counts.low} LOW
              </span>
              <span className="mono text-[10px] uppercase tracking-[0.18em] text-text-primary/30">
                Auto-verified high band; review the ambiguous band below.
              </span>
            </header>

            <ul className="flex flex-col gap-2">
              {phase.matches.map((m) => {
                const bucket = bucketFor(m.match_confidence);
                const verified = verifiedIds.has(m.id);
                const rejected = rejectedIds.has(m.id);
                return (
                  <li
                    key={m.id}
                    data-testid="cross-pollination-row"
                    data-bucket={bucket}
                    data-match-id={m.id}
                    className={[
                      'border rounded-md bg-bg-panel p-3 flex flex-col gap-2',
                      bucket === 'ambiguous'
                        ? 'border-accent-gold/60'
                        : bucket === 'high'
                          ? 'border-emerald-400/30'
                          : 'border-border-default',
                    ].join(' ')}
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="mono text-[12px] text-text-primary truncate">
                          {m.customer_canonical}
                          {m.national_account ? (
                            <span className="ml-2 mono text-[9px] uppercase tracking-[0.18em] text-accent-gold border border-accent-gold/40 rounded-md px-1.5 py-0.5">
                              NATIONAL
                            </span>
                          ) : null}
                        </span>
                        <span className="mono text-[10px] text-text-primary/50">
                          {m.match_layer.replace('_', ' ')} · matched on {m.matched_field.replace('_', ' ')} · "{m.matched_value_raw}"
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="mono text-[11px] text-text-primary/70">
                          {(m.match_confidence * 100).toFixed(0)}%
                        </span>
                        {verified ? (
                          <span
                            data-testid="cross-pollination-verified-badge"
                            className="mono text-[10px] uppercase tracking-[0.18em] text-emerald-400 border border-emerald-400/40 rounded-md px-2 py-0.5"
                          >
                            VERIFIED
                          </span>
                        ) : rejected ? (
                          <span className="mono text-[10px] uppercase tracking-[0.18em] text-rose-400 border border-rose-400/40 rounded-md px-2 py-0.5">
                            REJECTED
                          </span>
                        ) : bucket === 'ambiguous' ? (
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => onVerify(m)}
                              disabled={busy}
                              data-testid="cross-pollination-verify"
                              className="mono text-[10px] uppercase tracking-[0.18em] border border-emerald-400/60 text-emerald-400 px-2 py-0.5 rounded-md hover:bg-emerald-400 hover:text-bg-base disabled:opacity-50 transition-colors"
                            >
                              VERIFY
                            </button>
                            <button
                              type="button"
                              onClick={() => onReject(m)}
                              disabled={busy}
                              data-testid="cross-pollination-reject"
                              className="mono text-[10px] uppercase tracking-[0.18em] border border-rose-400/60 text-rose-400 px-2 py-0.5 rounded-md hover:bg-rose-400 hover:text-bg-base disabled:opacity-50 transition-colors"
                            >
                              REJECT
                            </button>
                          </div>
                        ) : (
                          <span className="mono text-[10px] uppercase tracking-[0.18em] text-text-primary/30">
                            {bucket === 'low' ? 'BELOW THRESHOLD' : 'AUTO-OK'}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mono text-[10px] uppercase tracking-[0.18em] text-text-primary/40">
                      <span>{m.primary_branch_name ?? '—'}</span>
                      <span>{m.branch_count} branches</span>
                      <span>{m.active_site_count} active sites</span>
                      <span>since {m.most_recent_site_date ?? '—'}</span>
                    </div>
                  </li>
                );
              })}
            </ul>

            <div
              data-testid="cross-pollination-manual-match"
              className="flex items-center justify-between border border-border-default border-dashed rounded-md bg-bg-panel p-3"
            >
              <span className="mono text-[10px] uppercase tracking-[0.18em] text-text-primary/50">
                ADD MANUAL MATCH
              </span>
              <button
                type="button"
                disabled
                title="Pending Pathfinder schema additions — see MEMORY/operator-todos/2026-05-02-pathfinder-cross-pollination-verify-schema.md"
                className="mono text-[10px] uppercase tracking-[0.18em] border border-border-default text-text-primary/40 px-3 py-1 rounded-md cursor-not-allowed"
              >
                ADD — PENDING SCHEMA
              </button>
            </div>
          </section>
        ) : null}

        <div className="border-t border-border-default pt-6">
          <AgentHistoryGrid
            agentName={crossPollinationAgent.name}
            customerOrgId={ORG_ID}
            onRerun={(d) => {
              void requeueDispatch({ dispatch_id: d.id }).catch((err) => {
                console.error('requeueDispatch failed', err);
              });
            }}
          />
        </div>
      </div>
    </AgentModalShell>
  );
}

function summarize(leadIds: string[], threshold: number): string {
  if (leadIds.length === 0) return `org-wide · threshold ${threshold.toFixed(2)}`;
  if (leadIds.length === 1) return `${leadIds[0]} · threshold ${threshold.toFixed(2)}`;
  return `${leadIds.length} leads · threshold ${threshold.toFixed(2)}`;
}

function FieldRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="mono text-[10px] uppercase tracking-[0.18em] text-text-primary/50">
        {label}
      </span>
      {children}
      {hint ? (
        <span className="mono text-[10px] tracking-[0.04em] text-text-primary/30">{hint}</span>
      ) : null}
    </label>
  );
}

const inputClass =
  'bg-bg-panel border border-border-default rounded-md px-3 py-2 text-[13px] text-text-primary placeholder:text-text-primary/30 focus:outline-none focus:border-accent-gold/60 disabled:opacity-50';
