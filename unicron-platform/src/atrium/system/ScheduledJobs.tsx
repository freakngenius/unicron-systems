// ScheduledJobs.tsx — Sprint 7 Stream C Task 5
// Live scheduled jobs table backed by ns_list_scheduled_jobs RPC.
// Toggle on/off (optimistic UI + rollback). Trigger now with confirmation + audit log.
// Verified scheduled_jobs columns: id, name, schedule_cron, owner_agent_id, active,
//   last_run_at, last_run_status, next_run_at, notes, created_at.

import { useEffect, useRef, useState } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Job {
  id:              string;
  name:            string;
  schedule_cron:   string | null;
  owner_agent_id:  string | null;
  active:          boolean;
  last_run_at:     string | null;
  last_run_status: string | null;
  next_run_at:     string | null;
  notes:           string | null;
  created_at:      string;
}

type TriggerState = 'idle' | 'confirming' | 'running' | 'done' | 'blocked' | 'error';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Convert a cron expression to a rough human-readable string. */
function humanCron(cron: string | null): string {
  if (!cron) return '—';
  // Strip TZ prefix
  const expr = cron.replace(/^TZ=[^\s]+\s+/, '');
  const parts = expr.trim().split(/\s+/);
  if (parts.length < 5) return cron;
  const [min, hour, dom, month, dow] = parts;

  // Common patterns
  if (expr === '* * * * *')    return 'Every minute';
  if (min.startsWith('*/'))    return `Every ${min.slice(2)} min`;
  if (dom === '*' && month === '*' && dow === '*') {
    const h = hour === '*' ? null : parseInt(hour, 10);
    const m = min  === '*' ? null : parseInt(min,  10);
    const timeStr = h !== null ? `${String(h).padStart(2,'0')}:${String(m ?? 0).padStart(2,'0')}` : null;
    if (timeStr) return `Daily at ${timeStr}`;
  }
  if (dom === '*' && month === '*' && dow !== '*') {
    const days: Record<string,string> = { '0':'Sun','1':'Mon','2':'Tue','3':'Wed','4':'Thu','5':'Fri','6':'Sat' };
    const dayStr = dow.split(',').map(d => days[d] ?? d).join(', ');
    const h = parseInt(hour, 10);
    const m = parseInt(min,  10);
    return `${dayStr} at ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
  }
  if (dom === '1' && month !== '*') {
    return `Monthly on the 1st`;
  }
  if (dom === '1') return `Monthly on the 1st`;
  return expr; // fall back to raw expression
}

function fmtRelative(ts: string | null): string {
  if (!ts) return 'Never';
  try {
    const diff = Date.now() - new Date(ts).getTime();
    const mins  = Math.floor(diff / 60_000);
    if (mins < 2)  return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24)  return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  } catch {
    return ts;
  }
}

function fmtNext(ts: string | null): string {
  if (!ts) return '—';
  try {
    const d    = new Date(ts);
    const diff = d.getTime() - Date.now();
    const mins = Math.floor(diff / 60_000);
    if (mins < 2)  return 'soon';
    if (mins < 60) return `in ${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24)  return `in ${hrs}h`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
  } catch {
    return ts;
  }
}

function StatusBadge({ status }: { status: string | null }) {
  if (!status) {
    return (
      <span className="flex items-center gap-1.5 mono text-[11.5px]" style={{ color: 'var(--text-lo)' }}>
        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: 'var(--text-lo)' }} />
        Never run
      </span>
    );
  }
  const ok  = status === 'ok' || status === 'success';
  const col = ok ? '#4FB286' : '#DD6262';
  return (
    <span className="flex items-center gap-1.5 mono text-[11.5px]" style={{ color: col }}>
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: col }} />
      {ok ? 'Success' : status}
    </span>
  );
}

// ─── Toggle switch ────────────────────────────────────────────────────────────

function Toggle({ on, disabled, onToggle }: { on: boolean; disabled: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      disabled={disabled}
      className="relative inline-block rounded-full transition-colors flex-shrink-0"
      style={{ width: 30, height: 17, background: on ? '#4FB286' : 'rgba(255,255,255,0.07)', opacity: disabled ? 0.6 : 1 }}
    >
      <span
        className="absolute top-0.5 rounded-full bg-white transition-all"
        style={{ width: 13, height: 13, left: on ? 15 : 2 }}
      />
    </button>
  );
}

// ─── Trigger button ───────────────────────────────────────────────────────────

function TriggerButton({ jobId, jobName, onTriggered }: { jobId: string; jobName: string; onTriggered: () => void }) {
  const [state, setState] = useState<TriggerState>('idle');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleClick = async () => {
    if (state === 'idle') {
      setState('confirming');
      timerRef.current = setTimeout(() => setState('idle'), 3000);
      return;
    }

    if (state === 'confirming') {
      if (timerRef.current) clearTimeout(timerRef.current);
      setState('running');

      try {
        const resp = await fetch('/api/atrium/scheduled-jobs', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ op: 'trigger', id: jobId, triggered_by: 'operator' }),
        });
        const json = await resp.json() as { ok: boolean; error?: string };

        if (json.ok) {
          setState('done');
          onTriggered();
          setTimeout(() => setState('idle'), 2000);
        } else {
          setState('error');
          setTimeout(() => setState('idle'), 2000);
        }
      } catch {
        setState('error');
        setTimeout(() => setState('idle'), 2000);
      }
    }
  };

  const label: Record<TriggerState, string> = {
    idle:       'Trigger now',
    confirming: 'Confirm?',
    running:    'Triggering…',
    done:       'Triggered',
    blocked:    'Blocked',
    error:      'Error',
  };

  const colors: Record<TriggerState, { border: string; color: string; bg: string }> = {
    idle:       { border: 'rgba(255,255,255,0.07)', color: 'var(--text-md)',  bg: 'transparent' },
    confirming: { border: '#D9A23A',                color: '#D9A23A',                bg: 'rgba(245,158,11,0.08)' },
    running:    { border: 'rgba(255,255,255,0.07)', color: 'var(--text-md)',  bg: 'transparent' },
    done:       { border: '#4FB286',                color: '#4FB286',                bg: 'rgba(34,197,94,0.08)' },
    blocked:    { border: '#DD6262',                color: '#DD6262',                bg: 'rgba(239,68,68,0.08)' },
    error:      { border: '#DD6262',                color: '#DD6262',                bg: 'rgba(239,68,68,0.08)' },
  };

  const c = colors[state];

  return (
    <button
      onClick={handleClick}
      disabled={state === 'running'}
      title={state === 'confirming' ? `Confirm manual trigger for "${jobName}"` : undefined}
      className="mono text-[11.5px] font-medium px-2.5 py-1 rounded-md flex items-center gap-1.5 transition-all"
      style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.color }}
    >
      {state === 'running' && (
        <span className="w-2 h-2 rounded-full border border-current border-t-transparent animate-spin" />
      )}
      {label[state]}
    </button>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ScheduledJobs() {
  const [jobs,    setJobs]    = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const loadJobs = () => {
    setLoading(true);
    setError(null);
    fetch('/api/atrium/scheduled-jobs')
      .then(r => r.json() as Promise<{ ok: boolean; jobs?: Job[]; error?: string }>)
      .then(json => {
        if (json.ok) setJobs(json.jobs ?? []);
        else setError(json.error ?? 'Failed to load');
      })
      .catch(err => setError((err as Error).message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadJobs(); }, []);

  const handleToggle = async (job: Job) => {
    const next = !job.active;

    // Optimistic update
    setJobs(prev => prev.map(j => j.id === job.id ? { ...j, active: next } : j));

    try {
      const resp = await fetch('/api/atrium/scheduled-jobs', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ op: 'toggle', id: job.id, active: next, triggered_by: 'operator' }),
      });
      const json = await resp.json() as { ok: boolean; error?: string };

      if (!json.ok) {
        // Rollback on failure
        setJobs(prev => prev.map(j => j.id === job.id ? { ...j, active: job.active } : j));
      }
    } catch {
      // Rollback on network error
      setJobs(prev => prev.map(j => j.id === job.id ? { ...j, active: job.active } : j));
    }
  };

  const activeCount = jobs.filter(j => j.active).length;

  return (
    <div className="bg-bg-card border border-border-default rounded-xl overflow-hidden">
      <div className="px-5 py-3.5 border-b border-border-subtle flex items-center justify-between gap-3">
        <div>
          <div className="mono text-[14px] font-semibold text-text-primary">Scheduled jobs</div>
          <div className="mono text-[11.5px] text-text-secondary mt-0.5">
            {loading ? 'Loading…' : `${activeCount} of ${jobs.length} active · cron-driven`}
          </div>
        </div>
        <button
          onClick={loadJobs}
          disabled={loading}
          className="mono text-[11px] text-text-secondary px-2.5 py-1 rounded-md border border-[rgba(255,255,255,0.07)] hover:border-[rgba(255,255,255,0.10)] transition-colors"
        >
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div className="px-5 py-3 mono text-[11.5px] text-red-400 bg-red-900/10 border-b border-border-subtle">
          Error: {error}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse" style={{ minWidth: 760 }}>
          <thead>
            <tr>
              {['', 'Name', 'Schedule', 'Last run', 'Status', 'Next run', 'Notes', ''].map((h, i) => (
                <th
                  key={i}
                  className={`px-4 py-2.5 mono text-[11.5px] text-text-secondary font-medium border-b border-border-default ${i === 7 ? 'text-right' : 'text-left'}`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && jobs.length === 0
              ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className={i > 0 ? 'border-t border-border-subtle' : ''}>
                    {Array.from({ length: 8 }).map((__, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-3 bg-bg-raised rounded animate-pulse" style={{ width: j === 0 ? 30 : j === 7 ? 80 : '80%' }} />
                      </td>
                    ))}
                  </tr>
                ))
              : jobs.map((j, idx) => (
                  <tr
                    key={j.id}
                    className={`transition-opacity ${idx > 0 ? 'border-t border-border-subtle' : ''}`}
                    style={{ opacity: j.active ? 1 : 0.5 }}
                  >
                    <td className="px-4 py-3">
                      <Toggle on={j.active} disabled={false} onToggle={() => handleToggle(j)} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="mono text-[13px] font-medium text-text-primary">{j.name}</div>
                      {j.owner_agent_id && (
                        <div className="mono text-[10.5px] text-text-secondary mt-0.5" title={j.owner_agent_id}>
                          agent {j.owner_agent_id.slice(0, 8)}…
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="mono text-[12px] text-text-primary">{humanCron(j.schedule_cron)}</div>
                      {j.schedule_cron && (
                        <div className="mono text-[10px] text-text-secondary mt-0.5">{j.schedule_cron}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 mono text-[11.5px] text-text-secondary whitespace-nowrap">
                      {fmtRelative(j.last_run_at)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={j.last_run_status} />
                    </td>
                    <td className="px-4 py-3 mono text-[11.5px] text-text-secondary whitespace-nowrap">
                      {fmtNext(j.next_run_at)}
                    </td>
                    <td className="px-4 py-3 mono text-[11px] text-text-secondary" style={{ maxWidth: 200 }}>
                      <span className="truncate block" title={j.notes ?? undefined}>
                        {j.notes ?? '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <TriggerButton jobId={j.id} jobName={j.name} onTriggered={loadJobs} />
                    </td>
                  </tr>
                ))
            }

            {!loading && jobs.length === 0 && (
              <tr>
                <td colSpan={8} className="px-5 py-8 text-center mono text-[11.5px] text-text-secondary">
                  No scheduled jobs found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
