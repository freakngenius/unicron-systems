// Generic Tier 2 ticket resolve modal. Exported for any agent that needs
// to escalate a candidate to operator help — Source Onboarder is the first
// consumer; Coverage Expansion (M1) wires it for its Tier 2 list once this
// file is on main; future agents (Architect Discovery, Cross-Pollination)
// reuse the same shape.
//
// Backed by Pathfinder's POST /api/architect/inbox/[id]/resolve endpoint.
// Three resolution modes: 'manual' (operator handled it out-of-band),
// 'dismiss' (drop the ticket), 'resume' (re-dispatch the agent with a
// supplied piece — URL override, api_key_env, hint, jurisdiction).

import { useEffect, useState } from 'react';
import type {
  InboxTicket,
  ResolveInboxRequest,
  ResolveInboxResponse,
} from '../../lib/contracts/inbox';
import { resolveInboxTicket } from '../../lib/inboxClient';

interface Props {
  ticket: InboxTicket;
  onClose: () => void;
  /** Override for tests / runtime mock. */
  resolveFn?: typeof resolveInboxTicket;
  onResolved?: (response: ResolveInboxResponse, mode: ResolveInboxRequest['resolution']) => void;
}

type Mode = ResolveInboxRequest['resolution'];

const MODE_LABEL: Record<Mode, string> = {
  manual: 'MANUAL — RESOLVED OUT-OF-BAND',
  resume: 'RESUME — SUPPLY MISSING PIECE',
  dismiss: 'DISMISS — NOT WORTH RESOLVING',
};

export function Tier2ResolveModal({
  ticket,
  onClose,
  resolveFn = resolveInboxTicket,
  onResolved,
}: Props) {
  const [mode, setMode] = useState<Mode>('manual');
  const [note, setNote] = useState('');
  const [resumeUrl, setResumeUrl] = useState(ticket.candidate_url ?? '');
  const [resumeApiKeyEnv, setResumeApiKeyEnv] = useState('');
  const [resumeHint, setResumeHint] = useState<'socrata' | 'rest' | 'rss' | 'json-dump' | ''>(
    (ticket.hint as 'socrata' | 'rest' | 'rss' | 'json-dump' | undefined) ?? '',
  );
  const [resumeJurisdiction, setResumeJurisdiction] = useState(ticket.jurisdiction ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<ResolveInboxResponse | null>(null);

  // Lock body scroll while modal is open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const submit = async () => {
    setError(null);
    if ((mode === 'manual' || mode === 'dismiss') && note.trim().length === 0) {
      setError('Note is required for manual + dismiss to keep the audit trail useful.');
      return;
    }
    if (mode === 'resume' && resumeUrl.trim().length === 0) {
      setError('Resume requires a URL — supply the override the operator wants the agent to retry.');
      return;
    }
    setSubmitting(true);
    try {
      const body: ResolveInboxRequest = {
        resolution: mode,
        resolution_note: note.trim() || undefined,
      };
      if (mode === 'resume') {
        body.resume_url = resumeUrl.trim();
        if (resumeApiKeyEnv.trim()) body.resume_api_key_env = resumeApiKeyEnv.trim();
        if (resumeHint) body.resume_hint = resumeHint;
        if (resumeJurisdiction.trim()) body.resume_jurisdiction = resumeJurisdiction.trim();
      }
      const response = await resolveFn(ticket.id, body);
      setDone(response);
      onResolved?.(response, mode);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Resolve Tier 2 ticket"
      data-testid="tier2-resolve-modal"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70"
    >
      <div className="bg-bg-base border border-border-default rounded-md w-full max-w-2xl max-h-[90vh] overflow-auto">
        <header className="flex items-center justify-between border-b border-border-default px-6 py-4">
          <div className="flex flex-col">
            <span className="mono text-[10px] uppercase tracking-[0.18em] text-text-primary/50">
              TIER 2 TICKET · {ticket.category.toUpperCase()}
            </span>
            <span className="mono text-[13px] text-text-primary truncate">
              {ticket.candidate_url ?? ticket.id}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="mono text-[11px] uppercase tracking-[0.18em] text-text-primary/60 hover:text-text-primary"
          >
            CLOSE
          </button>
        </header>

        <main className="px-6 py-5 flex flex-col gap-5">
          {ticket.reason ? (
            <div className="flex flex-col gap-1">
              <span className="mono text-[10px] uppercase tracking-[0.18em] text-text-primary/50">
                ESCALATION REASON
              </span>
              <p className="text-[13px] text-text-primary/80">{ticket.reason}</p>
            </div>
          ) : null}

          {done ? (
            <div
              data-testid="tier2-resolve-success"
              className="flex flex-col gap-2 border border-emerald-400/40 rounded-md bg-bg-panel p-4"
            >
              <span className="mono text-[10px] uppercase tracking-[0.18em] text-emerald-400">
                RESOLVED · {done.status.toUpperCase()}
              </span>
              {done.request_id ? (
                <span className="mono text-[11px] text-text-primary/70">
                  re-dispatch id: {done.request_id}
                </span>
              ) : null}
              <button
                type="button"
                onClick={onClose}
                className="self-end mono text-[11px] uppercase tracking-[0.18em] border border-text-primary px-3 py-1 rounded-md text-text-primary hover:bg-text-primary hover:text-bg-base transition-colors"
              >
                DONE
              </button>
            </div>
          ) : (
            <>
              <fieldset className="flex flex-col gap-2">
                <legend className="mono text-[10px] uppercase tracking-[0.18em] text-text-primary/50 mb-1">
                  RESOLUTION MODE
                </legend>
                {(['manual', 'resume', 'dismiss'] as Mode[]).map((m) => (
                  <label
                    key={m}
                    className={[
                      'flex items-start gap-3 border rounded-md px-3 py-2 cursor-pointer',
                      mode === m
                        ? 'border-accent-gold/60 bg-bg-panel'
                        : 'border-border-default hover:border-border-default/80',
                    ].join(' ')}
                  >
                    <input
                      type="radio"
                      name="tier2-resolution-mode"
                      value={m}
                      checked={mode === m}
                      onChange={() => setMode(m)}
                      data-testid={`tier2-mode-${m}`}
                      className="mt-1 accent-accent-gold"
                    />
                    <span className="mono text-[11px] uppercase tracking-[0.18em] text-text-primary">
                      {MODE_LABEL[m]}
                    </span>
                  </label>
                ))}
              </fieldset>

              <label className="flex flex-col gap-1.5">
                <span className="mono text-[10px] uppercase tracking-[0.18em] text-text-primary/50">
                  NOTE {mode === 'resume' ? '(optional)' : '(required)'}
                </span>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  data-testid="tier2-note"
                  placeholder={
                    mode === 'manual'
                      ? 'How did you resolve this manually? (audit trail)'
                      : mode === 'dismiss'
                        ? 'Why is this ticket not worth resolving?'
                        : 'Optional context for the agent re-dispatch'
                  }
                  className={inputClass}
                />
              </label>

              {mode === 'resume' ? (
                <div className="flex flex-col gap-3 border border-border-default rounded-md bg-bg-panel p-3">
                  <span className="mono text-[10px] uppercase tracking-[0.18em] text-text-primary/50">
                    RESUME — AGENT WILL RE-DISPATCH WITH THESE OVERRIDES
                  </span>
                  <FieldRow label="URL OVERRIDE">
                    <input
                      type="text"
                      value={resumeUrl}
                      onChange={(e) => setResumeUrl(e.target.value)}
                      data-testid="tier2-resume-url"
                      className={inputClass}
                    />
                  </FieldRow>
                  <FieldRow label="API KEY ENV (NAME ONLY — NOT THE KEY)">
                    <input
                      type="text"
                      value={resumeApiKeyEnv}
                      onChange={(e) => setResumeApiKeyEnv(e.target.value)}
                      placeholder="e.g. AUSTIN_OPEN_DATA_TOKEN"
                      data-testid="tier2-resume-api-key-env"
                      className={inputClass}
                    />
                  </FieldRow>
                  <FieldRow label="HINT">
                    <select
                      value={resumeHint}
                      onChange={(e) =>
                        setResumeHint(
                          e.target.value as '' | 'socrata' | 'rest' | 'rss' | 'json-dump',
                        )
                      }
                      data-testid="tier2-resume-hint"
                      className={inputClass}
                    >
                      <option value="">auto-detect</option>
                      <option value="socrata">socrata</option>
                      <option value="rest">rest</option>
                      <option value="rss">rss</option>
                      <option value="json-dump">json-dump</option>
                    </select>
                  </FieldRow>
                  <FieldRow label="JURISDICTION">
                    <input
                      type="text"
                      value={resumeJurisdiction}
                      onChange={(e) => setResumeJurisdiction(e.target.value)}
                      data-testid="tier2-resume-jurisdiction"
                      className={inputClass}
                    />
                  </FieldRow>
                </div>
              ) : null}

              {error ? (
                <p
                  data-testid="tier2-error"
                  className="mono text-[11px] uppercase tracking-[0.18em] text-rose-400"
                  role="alert"
                >
                  {error}
                </p>
              ) : null}
            </>
          )}
        </main>

        {!done ? (
          <footer className="border-t border-border-default px-6 py-3 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="mono text-[11px] uppercase tracking-[0.18em] text-text-primary/60 hover:text-text-primary disabled:opacity-50"
            >
              CANCEL
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={submitting}
              data-testid="tier2-submit"
              className="mono text-[11px] uppercase tracking-[0.18em] border border-text-primary px-4 py-2 rounded-md text-text-primary hover:bg-text-primary hover:text-bg-base disabled:opacity-50 transition-colors"
            >
              {submitting ? 'SUBMITTING…' : 'SUBMIT RESOLUTION'}
            </button>
          </footer>
        ) : null}
      </div>
    </div>
  );
}

const inputClass =
  'bg-bg-panel border border-border-default rounded-md px-3 py-2 text-[13px] text-text-primary placeholder:text-text-primary/30 focus:outline-none focus:border-accent-gold/60 disabled:opacity-50';

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="mono text-[10px] uppercase tracking-[0.18em] text-text-primary/50">
        {label}
      </span>
      {children}
    </label>
  );
}
