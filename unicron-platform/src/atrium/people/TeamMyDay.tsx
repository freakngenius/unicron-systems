// TeamMyDay.tsx — Sprint 5 Stream E
// Team members loaded from nervous_system.team_members.
// Click-in view per member: open DRIs, calendar stub, capacity heatmap.

import { useState, useEffect } from 'react';
import { getSupabase } from '../../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TeamMember {
  id: string;
  name: string;
  role: string | null;
  email: string | null;
  avatar_url: string | null;
  active: boolean;
}

interface ActionItem {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_at: string | null;
  customer_id: string | null;
  notion_url: string | null;
}

// ─── Priority weights for capacity heatmap ────────────────────────────────────

const PRIORITY_WEIGHT: Record<string, number> = {
  high: 3,
  med: 2,
  low: 1,
};

function capacityColor(load: number): string {
  if (load >= 10) return 'var(--err)';
  if (load >= 6) return 'var(--warn)';
  return 'var(--ok)';
}

// ─── Avatar initials ──────────────────────────────────────────────────────────

function Avatar({ name, size = 36 }: { name: string; size?: number }) {
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

// ─── Member detail panel ──────────────────────────────────────────────────────

function MemberDetail({
  member,
  onClose,
}: {
  member: TeamMember;
  onClose: () => void;
}) {
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const sb = getSupabase();

    async function load() {
      try {
        const { data, error: err } = await sb
          .schema('nervous_system')
          .from('action_items')
          .select('id, title, status, priority, due_at, customer_id, notion_url')
          .eq('assigned_to', member.id)
          .eq('status', 'open')
          .order('priority', { ascending: false })
          .order('due_at', { ascending: true })
          .limit(20);

        if (cancelled) return;
        if (err) throw err;
        setActions((data as ActionItem[] | null) ?? []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [member.id]);

  // Capacity score
  const capacityScore = actions.reduce(
    (sum, a) => sum + (PRIORITY_WEIGHT[a.priority] ?? 1),
    0,
  );
  const capacityPct = Math.min(100, (capacityScore / 15) * 100);
  const capColor = capacityColor(capacityScore);

  // In-review items (items with status 'review' that have a notion_url)
  const reviewItems = actions.filter((a) => a.status === 'review' && a.notion_url);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'var(--bg-overlay)', backdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'stretch', justifyContent: 'flex-end',
        zIndex: 60,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(var(--detail-w), 92vw)',
          background: 'var(--bg-elevated)',
          borderLeft: '1px solid var(--border-default)',
          boxShadow: '-12px 0 32px rgba(0,0,0,0.4)',
          height: '100%', overflowY: 'auto',
          display: 'flex', flexDirection: 'column',
          animation: 'slideIn 300ms var(--ease)',
        }}
      >
        <style>{`@keyframes slideIn { from { transform: translateX(20px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }`}</style>

        {/* Header */}
        <div style={{
          padding: '18px 22px', borderBottom: '1px solid var(--border-subtle)',
          display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0,
        }}>
          <Avatar name={member.name} size={40} />
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', fontWeight: 500, color: 'var(--text-hi)' }}>
              {member.name}
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-md)', marginTop: 2 }}>
              {member.role ?? 'Team member'}
              {member.email && (
                <span style={{ marginLeft: 8, color: 'var(--text-lo)' }}>{member.email}</span>
              )}
            </div>
          </div>
          <button onClick={onClose} style={{ color: 'var(--text-md)', padding: 6, flexShrink: 0 }}>✕</button>
        </div>

        <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 22, flex: 1 }}>

          {/* Capacity heatmap */}
          <section>
            <SectionLabel>Capacity Heatmap</SectionLabel>
            <div style={{
              padding: '12px 16px', background: 'var(--bg-surface)',
              border: '1px solid var(--border-faint)', borderRadius: 'var(--r-md)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-xs)', marginBottom: 6 }}>
                <span style={{ color: 'var(--text-md)' }}>Load</span>
                <span style={{ color: capColor, fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                  {capacityScore} pts ({actions.length} open items)
                </span>
              </div>
              <div style={{ height: 8, background: 'var(--bg-raised)', borderRadius: 999, overflow: 'hidden' }}>
                <div style={{
                  width: `${capacityPct}%`, height: '100%',
                  background: capColor, borderRadius: 999,
                  transition: 'width 400ms var(--ease)',
                }} />
              </div>
              <div style={{
                display: 'flex', justifyContent: 'space-between',
                fontSize: 'var(--text-2xs)', color: 'var(--text-lo)', marginTop: 4,
              }}>
                <span>light</span>
                <span>heavy</span>
              </div>
            </div>
          </section>

          {/* Calendar stub */}
          <section>
            <SectionLabel>Calendar · Today</SectionLabel>
            <div style={{
              padding: '14px 16px',
              background: 'var(--bg-surface)', border: '1px solid var(--border-faint)',
              borderRadius: 'var(--r-md)',
              fontSize: 'var(--text-xs)', color: 'var(--text-md)',
            }}>
              Calendar not connected — integration deferred to Sprint 6.
            </div>
          </section>

          {/* Open DRIs */}
          <section>
            <SectionLabel>Open DRIs ({actions.length})</SectionLabel>
            {loading ? (
              <SkeletonList count={3} />
            ) : error ? (
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--err)' }}>{error}</div>
            ) : actions.length === 0 ? (
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-lo)', fontStyle: 'italic' }}>
                No open action items.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {actions.map((a) => (
                  <div
                    key={a.id}
                    style={{
                      padding: '9px 14px',
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border-faint)',
                      borderRadius: 'var(--r-md)',
                      display: 'flex', alignItems: 'center', gap: 10,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-hi)' }}>{a.title}</div>
                      {a.due_at && (
                        <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-lo)', marginTop: 2 }}>
                          due {new Date(a.due_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </div>
                      )}
                    </div>
                    <PriorityBadge priority={a.priority} />
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Pending review items */}
          {reviewItems.length > 0 && (
            <section>
              <SectionLabel>Pending Verified Reviews</SectionLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {reviewItems.map((a) => (
                  <div
                    key={a.id}
                    style={{
                      padding: '9px 14px',
                      background: 'var(--accent-soft)',
                      border: '1px solid var(--border-accent)',
                      borderRadius: 'var(--r-md)',
                      display: 'flex', alignItems: 'center', gap: 10,
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-hi)' }}>{a.title}</div>
                    </div>
                    {a.notion_url && (
                      <a
                        href={a.notion_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          fontSize: 'var(--text-xs)', color: 'var(--accent)',
                          textDecoration: 'none', whiteSpace: 'nowrap',
                        }}
                      >
                        Open in Notion →
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function TeamMyDay() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<TeamMember | null>(null);

  useEffect(() => {
    let cancelled = false;
    const sb = getSupabase();

    async function load() {
      try {
        const { data, error: err } = await sb
          .schema('nervous_system')
          .from('team_members')
          .select('id, name, role, email, avatar_url, active')
          .eq('active', true)
          .order('name');

        if (cancelled) return;
        if (err) throw err;
        setMembers((data as TeamMember[] | null) ?? []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load team');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{
            height: 120, background: 'var(--bg-elevated)',
            borderRadius: 'var(--r-lg)',
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
        fontSize: 'var(--text-sm)', color: 'var(--err)',
      }}>
        {error}
      </div>
    );
  }

  if (members.length === 0) {
    return (
      <div style={{
        padding: '40px 24px', textAlign: 'center',
        background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--r-lg)',
      }}>
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-md)' }}>
          No team members found.
        </div>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-lo)', marginTop: 6 }}>
          Add members to{' '}
          <span style={{ fontFamily: 'var(--font-mono)' }}>nervous_system.team_members</span>{' '}
          to activate this view.
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
        {members.map((m) => (
          <MemberCard key={m.id} member={m} onClick={() => setSelected(m)} />
        ))}
      </div>
      {selected && <MemberDetail member={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

// ─── Member summary card ──────────────────────────────────────────────────────

function MemberCard({ member, onClick }: { member: TeamMember; onClick: () => void }) {
  const [actionCount, setActionCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const sb = getSupabase();
    sb.schema('nervous_system')
      .from('action_items')
      .select('id', { count: 'exact', head: true })
      .eq('assigned_to', member.id)
      .eq('status', 'open')
      .then(({ count }) => {
        if (!cancelled) setActionCount(count ?? 0);
      });
    return () => { cancelled = true; };
  }, [member.id]);

  return (
    <button
      onClick={onClick}
      style={{
        textAlign: 'left', padding: '16px 18px',
        background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--r-lg)', cursor: 'pointer',
        display: 'flex', flexDirection: 'column', gap: 12,
        transition: 'border-color var(--d-hover) var(--ease), box-shadow var(--d-hover) var(--ease)',
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
      {/* Top row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Avatar name={member.name} size={36} />
        <div>
          <div style={{ fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--text-hi)' }}>
            {member.name}
          </div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-md)', marginTop: 1 }}>
            {member.role ?? 'Team member'}
          </div>
        </div>
        <span style={{ marginLeft: 'auto', fontSize: 'var(--text-xs)', color: 'var(--text-lo)' }}>
          →
        </span>
      </div>
      {/* DRI count */}
      <div style={{ display: 'flex', gap: 16 }}>
        <div>
          <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-lo)' }}>Open DRIs</div>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xl)',
            color: 'var(--text-hi)', fontWeight: 500,
          }}>
            {actionCount !== null ? actionCount : '—'}
          </div>
        </div>
      </div>
    </button>
  );
}

// ─── Shared primitives ────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 'var(--text-2xs)', color: 'var(--text-lo)',
      textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600,
      marginBottom: 8,
    }}>
      {children}
    </div>
  );
}

function SkeletonList({ count }: { count: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{
          height: 44, background: 'var(--bg-surface)',
          borderRadius: 'var(--r-md)', animation: 'pulse 1.5s ease-in-out infinite',
        }} />
      ))}
      <style>{`@keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.4 } }`}</style>
    </div>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const s =
    priority === 'high'
      ? { bg: 'var(--err-soft)', fg: 'var(--err)', bd: 'rgba(221,98,98,0.25)' }
      : priority === 'med'
      ? { bg: 'var(--warn-soft)', fg: 'var(--warn)', bd: 'rgba(217,162,58,0.25)' }
      : { bg: 'var(--bg-raised)', fg: 'var(--text-md)', bd: 'var(--border-subtle)' };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      background: s.bg, color: s.fg, border: `1px solid ${s.bd}`,
      padding: '2px 7px', borderRadius: 'var(--r-pill)',
      fontSize: 'var(--text-2xs)', fontWeight: 600, whiteSpace: 'nowrap',
    }}>
      {priority}
    </span>
  );
}
