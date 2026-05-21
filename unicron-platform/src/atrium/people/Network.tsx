// Network.tsx — Sprint 5 Stream E
// Contacts from vault/Memory/people/*.md via GET /api/atrium/network.
// Shows: name, role/relationship, last-touch date, how-introduced note.
// "Who introduced who" 2-level tree: contact A → introduced B and C (indented list).

import { useState, useEffect } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Contact {
  id: string;
  name: string;
  role: string | null;
  relationship: string | null;
  introduced_by: string | null;
  introduced_to: string[] | null;
  last_touch: string | null;
  file_modified: string | null;
  raw_intro_note: string | null;
}

// ─── Data fetching ────────────────────────────────────────────────────────────

async function fetchNetwork(): Promise<Contact[]> {
  const res = await fetch('/api/atrium/network');
  if (!res.ok) throw new Error(`network API ${res.status}`);
  return (await res.json()) as Contact[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function lastTouchDisplay(c: Contact): string | null {
  const raw = c.last_touch ?? c.file_modified;
  if (!raw) return null;
  try {
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return raw;
    const diff = Date.now() - date.getTime();
    const d = Math.floor(diff / 86400000);
    if (d === 0) return 'today';
    if (d < 7) return `${d}d ago`;
    if (d < 30) return `${Math.floor(d / 7)}w ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return raw;
  }
}

function Initials({ name, size = 28 }: { name: string; size?: number }) {
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

// ─── Contact row ──────────────────────────────────────────────────────────────

function ContactRow({ contact, onSelect, isSelected }: {
  contact: Contact;
  onSelect: () => void;
  isSelected: boolean;
}) {
  const touch = lastTouchDisplay(contact);

  return (
    <button
      onClick={onSelect}
      style={{
        textAlign: 'left', padding: '12px 16px',
        display: 'flex', alignItems: 'center', gap: 12,
        background: isSelected ? 'var(--bg-raised)' : 'transparent',
        borderLeft: isSelected ? '2px solid var(--accent)' : '2px solid transparent',
        transition: 'background var(--d-hover) var(--ease)',
        width: '100%',
      }}
      onMouseEnter={(e) => {
        if (!isSelected) e.currentTarget.style.background = 'var(--bg-elevated)';
      }}
      onMouseLeave={(e) => {
        if (!isSelected) e.currentTarget.style.background = 'transparent';
      }}
    >
      <Initials name={contact.name} size={32} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-hi)', fontWeight: 500 }}>
          {contact.name}
        </div>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-md)', marginTop: 1 }}>
          {[contact.role, contact.relationship].filter(Boolean).join(' · ') || 'Contact'}
        </div>
      </div>
      {touch && (
        <span style={{
          fontSize: 'var(--text-2xs)', color: 'var(--text-lo)',
          fontFamily: 'var(--font-mono)', flexShrink: 0,
        }}>
          {touch}
        </span>
      )}
    </button>
  );
}

// ─── Contact detail panel ─────────────────────────────────────────────────────

function ContactDetail({ contact, all }: { contact: Contact; all: Contact[] }) {
  const touch = lastTouchDisplay(contact);

  // Build intro tree: who they introduced + who introduced them
  const introducedByPerson = contact.introduced_by
    ? all.find((c) => c.name.toLowerCase().includes(contact.introduced_by!.toLowerCase()))
    : null;

  const introductions =
    contact.introduced_to?.map((name) => {
      const person = all.find((c) => c.name.toLowerCase().includes(name.toLowerCase()));
      return { name, person };
    }) ?? [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Identity */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <Initials name={contact.name} size={44} />
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', fontWeight: 500, color: 'var(--text-hi)' }}>
            {contact.name}
          </div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-md)', marginTop: 2 }}>
            {[contact.role, contact.relationship].filter(Boolean).join(' · ') || 'Contact'}
          </div>
        </div>
      </div>

      {/* Metadata grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr', gap: '8px 14px', fontSize: 'var(--text-sm)' }}>
        {touch && (
          <>
            <span style={{ color: 'var(--text-lo)', fontSize: 'var(--text-xs)', paddingTop: 2 }}>Last touch</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-hi)' }}>{touch}</span>
          </>
        )}
        {contact.introduced_by && (
          <>
            <span style={{ color: 'var(--text-lo)', fontSize: 'var(--text-xs)', paddingTop: 2 }}>Introduced by</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {introducedByPerson && <Initials name={introducedByPerson.name} size={18} />}
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-hi)' }}>{contact.introduced_by}</span>
            </div>
          </>
        )}
      </div>

      {/* Intro note */}
      {contact.raw_intro_note && (
        <div>
          <div style={{
            fontSize: 'var(--text-2xs)', color: 'var(--text-lo)',
            textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600, marginBottom: 6,
          }}>
            How they connected
          </div>
          <div style={{
            padding: '10px 14px', background: 'var(--bg-surface)',
            border: '1px solid var(--border-faint)', borderRadius: 'var(--r-md)',
            fontSize: 'var(--text-xs)', color: 'var(--text-md)', lineHeight: 1.5,
          }}>
            {contact.raw_intro_note}
          </div>
        </div>
      )}

      {/* Introductions tree */}
      {introductions.length > 0 && (
        <div>
          <div style={{
            fontSize: 'var(--text-2xs)', color: 'var(--text-lo)',
            textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600, marginBottom: 8,
          }}>
            Introduced to
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {/* Root node */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Initials name={contact.name} size={20} />
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-hi)', fontWeight: 500 }}>{contact.name}</span>
            </div>
            {/* Introduced contacts (indented) */}
            {introductions.map((intro) => (
              <div
                key={intro.name}
                style={{
                  marginLeft: 28,
                  display: 'flex', alignItems: 'center', gap: 8,
                  borderLeft: '1px solid var(--border-default)',
                  paddingLeft: 12,
                }}
              >
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-lo)' }}>└</span>
                {intro.person && <Initials name={intro.person.name} size={18} />}
                <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-md)' }}>{intro.name}</span>
                {intro.person?.role && (
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-lo)' }}>· {intro.person.role}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function Network() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Contact | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetchNetwork()
      .then((data) => { if (!cancelled) { setContacts(data); setLoading(false); } })
      .catch((e) => { if (!cancelled) { setError(e instanceof Error ? e.message : 'Failed to load'); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  const filtered = contacts.filter((c) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      (c.role?.toLowerCase() ?? '').includes(q) ||
      (c.relationship?.toLowerCase() ?? '').includes(q) ||
      (c.introduced_by?.toLowerCase() ?? '').includes(q)
    );
  });

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{
            height: 60, background: 'var(--bg-elevated)', borderRadius: 'var(--r-md)',
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

  if (contacts.length === 0) {
    return (
      <div style={{
        padding: '40px 24px', textAlign: 'center',
        background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--r-lg)',
      }}>
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-md)' }}>
          No contacts found.
        </div>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-lo)', marginTop: 6 }}>
          Set{' '}
          <span style={{ fontFamily: 'var(--font-mono)' }}>VAULT_PATH</span>{' '}
          and add markdown files under{' '}
          <span style={{ fontFamily: 'var(--font-mono)' }}>Memory/people/</span>{' '}
          to populate your network.
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Summary row */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        marginBottom: 16, flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-md)' }}>
          {contacts.length} contacts
        </span>
        <div style={{ flex: 1 }} />
        {/* Search — Atrium audit fix item #10. Client-side filter is the right
            default for the (small) contact list, but the input previously had
            no backend escape hatch. Adding a "Search vault →" CTA that hands
            off to the Library Repo vault-wide search when the user wants
            results outside the loaded contacts. */}
        <div style={{ position: 'relative', display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter contacts…"
            style={{
              width: 220, padding: '6px 10px',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)', borderRadius: 'var(--r-md)',
              fontSize: 'var(--text-xs)', color: 'var(--text-hi)',
            }}
          />
          {query.trim().length > 0 && (
            <button
              type="button"
              onClick={() => {
                try {
                  window.dispatchEvent(new CustomEvent('atrium:navigate', {
                    detail: { tab: 'library', subTab: 'repo', filter: { q: query.trim() } },
                  }));
                } catch {
                  // non-browser env — ignore
                }
              }}
              title="Hand off this query to the vault-wide repo search"
              style={{
                padding: '6px 10px',
                background: 'transparent',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--r-md)',
                fontSize: 'var(--text-xs)',
                color: 'var(--text-hi)',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              Search vault →
            </button>
          )}
        </div>
      </div>

      {/* Split view */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: selected ? '1.2fr 1.6fr' : '1fr',
        gap: 16,
        alignItems: 'flex-start',
      }}>
        {/* List panel */}
        <div style={{
          background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--r-lg)', overflow: 'hidden',
        }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '20px 16px', fontSize: 'var(--text-xs)', color: 'var(--text-lo)', textAlign: 'center' }}>
              No contacts match.
            </div>
          ) : (
            filtered.map((c, i) => (
              <div key={c.id} style={{ borderTop: i === 0 ? 'none' : '1px solid var(--border-faint)' }}>
                <ContactRow
                  contact={c}
                  onSelect={() => setSelected(selected?.id === c.id ? null : c)}
                  isSelected={selected?.id === c.id}
                />
              </div>
            ))
          )}
        </div>

        {/* Detail panel */}
        {selected && (
          <div style={{
            background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--r-lg)', padding: '20px 22px',
            animation: 'fadeIn 200ms var(--ease)',
          }}>
            <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }`}</style>
            <ContactDetail contact={selected} all={contacts} />
          </div>
        )}
      </div>
    </div>
  );
}
