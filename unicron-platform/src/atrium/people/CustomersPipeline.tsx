// CustomersPipeline.tsx — Sprint 5 Stream E
// Kanban board for nervous_system.customers by status stages.
// Drag-drop via HTML5 drag events; PATCH /api/atrium/customers/:id on drop.
// Mobile: stacked list view with status badge.

import { useState, useEffect, useCallback } from 'react';
import { CustomerHealthCard } from './CustomerHealthCard';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Customer {
  id: string;
  name: string;
  status: string;
  primary_contact: string | null;
  notes: unknown | null;
  created_at: string;
  updated_at: string | null;
  // Enriched fields from join (may be absent)
  last_contact_date?: string | null;
  next_action?: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STAGES = [
  'Cold',
  'Discovery',
  'Proposal',
  'Contract',
  'Onboarding',
  'Active',
  'Churned',
] as const;

type Stage = (typeof STAGES)[number];

// DB canon for status is lowercase ('discovery', 'active'…). UI labels are
// title-cased. Normalize at the boundary so case never breaks bucketing.
function toStage(dbStatus: string | null | undefined): Stage {
  if (!dbStatus) return 'Cold';
  const lc = dbStatus.toLowerCase();
  const cap = lc.charAt(0).toUpperCase() + lc.slice(1);
  return (STAGES as readonly string[]).includes(cap) ? (cap as Stage) : 'Cold';
}

const STAGE_COLORS: Record<Stage, string> = {
  Cold:       'rgba(107,114,128,0.8)',
  Discovery:  'rgba(111,149,214,0.8)',
  Proposal:   'rgba(217,162,58,0.8)',
  Contract:   'rgba(79,178,134,0.8)',
  Onboarding: 'rgba(232,118,58,0.8)',
  Active:     '#2E8E66',
  Churned:    '#E14B4B',
};

const STAGE_TONE: Record<Stage, string> = {
  Cold:       'neutral',
  Discovery:  'info',
  Proposal:   'warn',
  Contract:   'ok',
  Onboarding: 'accent',
  Active:     'ok',
  Churned:    'err',
};

// ─── Data fetching ────────────────────────────────────────────────────────────

async function fetchCustomers(): Promise<Customer[]> {
  const res = await fetch('/api/atrium/customers');
  if (!res.ok) throw new Error(`customers API ${res.status}`);
  return (await res.json()) as Customer[];
}

async function patchCustomerStatus(id: string, status: string): Promise<void> {
  const res = await fetch(`/api/atrium/customers/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `PATCH failed (${res.status})`);
  }
}

// ─── Badge component ──────────────────────────────────────────────────────────

function StageBadge({ stage }: { stage: string }) {
  const color = STAGE_COLORS[stage as Stage] ?? 'rgba(107,114,128,0.8)';
  const tone = STAGE_TONE[stage as Stage] ?? 'neutral';
  const toneStyles: Record<string, { bg: string; fg: string; bd: string }> = {
    neutral: { bg: 'var(--bg-raised)', fg: 'var(--text-md)', bd: 'var(--border-subtle)' },
    info:    { bg: 'var(--info-soft)', fg: 'var(--info)', bd: 'rgba(111,149,214,0.25)' },
    warn:    { bg: 'var(--warn-soft)', fg: 'var(--warn)', bd: 'rgba(217,162,58,0.25)' },
    ok:      { bg: 'var(--ok-soft)', fg: 'var(--ok)', bd: 'rgba(79,178,134,0.25)' },
    accent:  { bg: 'var(--accent-soft)', fg: 'var(--accent)', bd: 'rgba(232,118,58,0.25)' },
    err:     { bg: 'var(--err-soft)', fg: 'var(--err)', bd: 'rgba(221,98,98,0.25)' },
  };
  const s = toneStyles[tone];
  void color; // kept for future use
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      background: s.bg, color: s.fg, border: `1px solid ${s.bd}`,
      padding: '2px 8px', borderRadius: 'var(--r-pill)',
      fontSize: 'var(--text-xs)', lineHeight: 1, fontWeight: 500, whiteSpace: 'nowrap',
    }}>
      {stage}
    </span>
  );
}

// ─── Initials avatar ──────────────────────────────────────────────────────────

function Initials({ name, size = 22 }: { name: string; size?: number }) {
  const initials = name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: 'linear-gradient(135deg, #3a4253, #1f242e)',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.38, fontWeight: 600, color: 'var(--text-hi)',
      flexShrink: 0, boxShadow: '0 0 0 1px rgba(255,255,255,0.07) inset',
    }}>
      {initials}
    </div>
  );
}

// ─── Customer card ────────────────────────────────────────────────────────────

function CustomerCard({
  customer,
  onDragStart,
  onClick,
}: {
  customer: Customer;
  onDragStart: (id: string) => void;
  onClick: (customer: Customer) => void;
}) {
  const relTime = customer.last_contact_date
    ? (() => {
        const diff = Date.now() - new Date(customer.last_contact_date).getTime();
        const d = Math.floor(diff / 86400000);
        return d === 0 ? 'today' : `${d}d ago`;
      })()
    : customer.updated_at
    ? (() => {
        const diff = Date.now() - new Date(customer.updated_at).getTime();
        const d = Math.floor(diff / 86400000);
        return d === 0 ? 'today' : `${d}d ago`;
      })()
    : null;

  return (
    <div
      draggable
      onDragStart={() => onDragStart(customer.id)}
      onClick={() => onClick(customer)}
      style={{
        padding: '10px 12px',
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--r-md)',
        cursor: 'grab',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        transition: 'box-shadow var(--d-hover) var(--ease), border-color var(--d-hover) var(--ease)',
        userSelect: 'none',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--border-default)';
        e.currentTarget.style.boxShadow = 'var(--sh-2)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--border-subtle)';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      {/* Customer name */}
      <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-hi)', fontWeight: 500, lineHeight: 1.3 }}>
        {customer.name}
      </div>
      {/* Contact row */}
      {customer.primary_contact && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Initials name={customer.primary_contact} size={16} />
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-md)' }}>
            {customer.primary_contact}
          </span>
        </div>
      )}
      {/* Bottom row: last contact + next action */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        {relTime && (
          <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-lo)', fontFamily: 'var(--font-mono)' }}>
            {relTime}
          </span>
        )}
        {customer.next_action && (
          <span style={{
            fontSize: 'var(--text-2xs)', color: 'var(--text-md)',
            background: 'var(--bg-raised)', borderRadius: 'var(--r-sm)',
            padding: '2px 6px', maxWidth: 120, overflow: 'hidden',
            whiteSpace: 'nowrap', textOverflow: 'ellipsis',
          }}>
            {customer.next_action}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Kanban column ────────────────────────────────────────────────────────────

function KanbanColumn({
  stage,
  customers,
  draggingId,
  onDragStart,
  onDrop,
  onCustomerClick,
}: {
  stage: Stage;
  customers: Customer[];
  draggingId: string | null;
  onDragStart: (id: string) => void;
  onDrop: (stage: Stage) => void;
  onCustomerClick: (c: Customer) => void;
}) {
  const [isDragOver, setIsDragOver] = useState(false);
  const color = STAGE_COLORS[stage];

  return (
    <div
      style={{
        flex: '1 0 200px',
        minWidth: 200,
        maxWidth: 260,
        background: isDragOver ? 'var(--bg-raised)' : 'var(--bg-surface)',
        border: isDragOver ? `1px solid ${color}` : '1px solid var(--border-faint)',
        borderRadius: 'var(--r-md)',
        padding: 10,
        minHeight: 240,
        transition: 'background var(--d-hover) var(--ease), border-color var(--d-hover) var(--ease)',
        borderTop: `3px solid ${color}`,
      }}
      onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={() => { setIsDragOver(false); onDrop(stage); }}
    >
      {/* Column header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 10, padding: '0 2px',
      }}>
        <span style={{
          fontSize: 'var(--text-xs)', color: 'var(--text-md)',
          textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600,
        }}>
          {stage}
        </span>
        <span style={{
          fontSize: 'var(--text-2xs)', color: 'var(--text-lo)',
          fontFamily: 'var(--font-mono)',
        }}>
          {customers.length}
        </span>
      </div>
      {/* Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {customers.map((c) => (
          <div
            key={c.id}
            style={{
              opacity: draggingId === c.id ? 0.4 : 1,
              transition: 'opacity 150ms',
            }}
          >
            <CustomerCard
              customer={c}
              onDragStart={onDragStart}
              onClick={onCustomerClick}
            />
          </div>
        ))}
        {customers.length === 0 && (
          <div style={{
            fontSize: 'var(--text-xs)', color: 'var(--text-faint)',
            padding: '16px 8px', textAlign: 'center', fontStyle: 'italic',
          }}>
            —
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Mobile list view ─────────────────────────────────────────────────────────

function MobileList({
  customers,
  onCustomerClick,
}: {
  customers: Customer[];
  onCustomerClick: (c: Customer) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {customers.map((c) => (
        <button
          key={c.id}
          onClick={() => onCustomerClick(c)}
          style={{
            textAlign: 'left', padding: 12,
            background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--r-md)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 12,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-hi)', fontWeight: 500 }}>
              {c.name}
            </div>
            {c.primary_contact && (
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-md)', marginTop: 2 }}>
                {c.primary_contact}
              </div>
            )}
          </div>
          <StageBadge stage={toStage(c.status)} />
        </button>
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function CustomersPipeline() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [patchError, setPatchError] = useState<string | null>(null);

  // Detect mobile (< 640px) via a simple media query
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 640 : false,
  );
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const handler = () => setIsMobile(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchCustomers();
      setCustomers(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load customers');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleDrop = useCallback(
    async (targetStage: Stage) => {
      if (!draggingId) return;
      const customer = customers.find((c) => c.id === draggingId);
      if (!customer || toStage(customer.status) === targetStage) {
        setDraggingId(null);
        return;
      }

      // Optimistic update
      setCustomers((prev) =>
        prev.map((c) => (c.id === draggingId ? { ...c, status: targetStage } : c)),
      );
      setDraggingId(null);
      setPatchError(null);

      try {
        await patchCustomerStatus(draggingId, targetStage);
      } catch (e) {
        // Rollback
        setCustomers((prev) =>
          prev.map((c) => (c.id === draggingId ? { ...c, status: customer.status } : c)),
        );
        setPatchError(e instanceof Error ? e.message : 'Failed to update status');
      }
    },
    [draggingId, customers],
  );

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{
            height: 80, background: 'var(--bg-elevated)', borderRadius: 'var(--r-md)',
            animation: 'pulse 1.5s ease-in-out infinite',
          }} />
        ))}
        <style>{`@keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.4 } }`}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        padding: '20px 24px', background: 'var(--bg-elevated)',
        border: '1px solid var(--border-subtle)', borderRadius: 'var(--r-lg)',
      }}>
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--err)' }}>{error}</div>
        <button
          onClick={() => void load()}
          style={{
            marginTop: 12, fontSize: 'var(--text-xs)', color: 'var(--text-md)',
            background: 'var(--bg-raised)', border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--r-md)', padding: '4px 10px', cursor: 'pointer',
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  // Group by stage — normalize case at the boundary (DB lowercase, UI title-case)
  const byStage: Record<string, Customer[]> = {};
  for (const stage of STAGES) byStage[stage] = [];
  for (const c of customers) {
    byStage[toStage(c.status)].push(c);
  }

  return (
    <div>
      {/* Metrics row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)',
        gap: 10, marginBottom: 20,
      }}>
        {[
          { label: 'Total', value: customers.length },
          { label: 'Active', value: byStage['Active']?.length ?? 0 },
          { label: 'Proposal', value: byStage['Proposal']?.length ?? 0 },
          { label: 'Churned', value: byStage['Churned']?.length ?? 0 },
        ].map((m) => (
          <div key={m.label} style={{
            background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--r-lg)', padding: '12px 16px',
          }}>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-lo)', textTransform: 'uppercase', letterSpacing: 0.6 }}>
              {m.label}
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-3xl)', fontWeight: 600, lineHeight: 1, marginTop: 4 }}>
              {m.value}
            </div>
          </div>
        ))}
      </div>

      {/* Patch error banner */}
      {patchError && (
        <div style={{
          marginBottom: 12, padding: '8px 12px',
          background: 'var(--err-soft)', border: '1px solid rgba(221,98,98,0.25)',
          borderRadius: 'var(--r-md)', fontSize: 'var(--text-xs)', color: 'var(--err)',
        }}>
          {patchError}
        </div>
      )}

      {/* Board / list */}
      {customers.length === 0 ? (
        <div style={{
          padding: '40px 24px', textAlign: 'center',
          background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--r-lg)',
        }}>
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-md)' }}>
            No customers yet.
          </div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-lo)', marginTop: 6 }}>
            Create customers in Supabase <span style={{ fontFamily: 'var(--font-mono)' }}>nervous_system.customers</span> to activate this view.
          </div>
        </div>
      ) : isMobile ? (
        <MobileList customers={customers} onCustomerClick={setSelectedCustomer} />
      ) : (
        <div
          style={{
            display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8,
            alignItems: 'flex-start',
          }}
          onDragEnd={() => setDraggingId(null)}
        >
          {STAGES.map((stage) => (
            <KanbanColumn
              key={stage}
              stage={stage}
              customers={byStage[stage]}
              draggingId={draggingId}
              onDragStart={setDraggingId}
              onDrop={handleDrop}
              onCustomerClick={setSelectedCustomer}
            />
          ))}
        </div>
      )}

      {/* Drill-in modal */}
      {selectedCustomer && (
        <CustomerHealthCard
          customer={selectedCustomer}
          onClose={() => setSelectedCustomer(null)}
        />
      )}
    </div>
  );
}
