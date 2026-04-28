'use client';

// SettingsShell — left-rail nav + main pane for /settings.
//
// Light-mode chrome matching the dashboard's TopBar / BranchDock / Modal
// surfaces: white background, ink-black labels, hairline borders, soft
// shadows. The dark map-bg variant lived briefly in v1; the dashboard's
// "everything outside the map is light" rule wins.

import * as React from 'react';

import { hexAlpha, PF_TINTS } from '@/lib/agent-tints';
import { getUserEmail, setUserEmail, useIsOperator } from '@/lib/settings';

import { DisplaySection } from './sections/Display';
import { NotificationsSection } from './sections/Notifications';
import { BranchesCustomersSection } from './sections/BranchesCustomers';
import { SourcesSection } from './sections/Sources';
import { ScoringSection } from './sections/Scoring';
import { AgentsSection } from './sections/Agents';
import { IntegrationsSection } from './sections/Integrations';
import { UsersSection } from './sections/Users';
import { DataSection } from './sections/Data';
import { AdvancedSection } from './sections/Advanced';

interface SectionDef {
  id: string;
  label: string;
  Component: React.ComponentType;
}

const SECTIONS: SectionDef[] = [
  { id: 'display', label: 'Display', Component: DisplaySection },
  { id: 'notifications', label: 'Notifications', Component: NotificationsSection },
  { id: 'branches-customers', label: 'Branches and customers', Component: BranchesCustomersSection },
  { id: 'sources', label: 'Sources', Component: SourcesSection },
  { id: 'scoring', label: 'Scoring and thresholds', Component: ScoringSection },
  { id: 'agents', label: 'Agents', Component: AgentsSection },
  { id: 'integrations', label: 'Integrations', Component: IntegrationsSection },
  { id: 'users', label: 'Users and permissions', Component: UsersSection },
  { id: 'data', label: 'Data and security', Component: DataSection },
  { id: 'advanced', label: 'Advanced', Component: AdvancedSection },
];

export function SettingsShell() {
  const [activeId, setActiveId] = React.useState<string>(SECTIONS[0].id);
  const [email, setEmailState] = React.useState<string>('');

  React.useEffect(() => {
    const fromHash = () => {
      const h = window.location.hash.replace('#', '').trim();
      if (h && SECTIONS.some((s) => s.id === h)) setActiveId(h);
    };
    fromHash();
    window.addEventListener('hashchange', fromHash);
    return () => window.removeEventListener('hashchange', fromHash);
  }, []);

  React.useEffect(() => {
    setEmailState(getUserEmail() ?? '');
  }, []);

  const activeSection = SECTIONS.find((s) => s.id === activeId) ?? SECTIONS[0];
  const ActiveComponent = activeSection.Component;

  return (
    <div
      style={{
        // The dashboard sets `body { overflow: hidden }` so the map fills
        // the viewport without document scroll. The settings page needs
        // its own scroll container, so we lock outer height to the
        // viewport and let `overflow: auto` here handle the scroll.
        height: '100vh',
        overflow: 'auto',
        background: PF_TINTS.bgAlt,
        color: PF_TINTS.ink,
        font: `400 13px/1.5 ${PF_TINTS.sans}`,
      }}
    >
      <Header email={email} setEmailState={setEmailState} />
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '240px 1fr',
          minHeight: 'calc(100vh - 56px)',
          maxWidth: 1200,
          margin: '0 auto',
        }}
      >
        <LeftRail
          sections={SECTIONS}
          activeId={activeId}
          onSelect={(id) => {
            setActiveId(id);
            window.location.hash = id;
          }}
        />
        <main style={{ padding: '24px 32px 64px', overflowX: 'hidden' }}>
          <h2
            style={{
              font: `600 18px/1.2 ${PF_TINTS.sans}`,
              letterSpacing: '-0.005em',
              color: PF_TINTS.ink,
              margin: '0 0 4px',
            }}
          >
            {activeSection.label}
          </h2>
          <div
            className="pf-mono"
            style={{
              fontSize: 9,
              color: PF_TINTS.inkDim,
              letterSpacing: '0.10em',
              textTransform: 'uppercase',
              marginBottom: 24,
            }}
          >
            {activeSection.id}
          </div>
          <ActiveComponent />
        </main>
      </div>
    </div>
  );
}

function Header({
  email,
  setEmailState,
}: {
  email: string;
  setEmailState: (s: string) => void;
}) {
  const isOperator = useIsOperator();
  return (
    <div
      style={{
        height: 56,
        background: PF_TINTS.bg,
        borderBottom: `1px solid ${PF_TINTS.ruleSoft}`,
        display: 'flex',
        alignItems: 'center',
        padding: '0 24px',
        gap: 16,
      }}
    >
      <a
        href="/pathfinder"
        title="Back to dashboard"
        style={{
          color: PF_TINTS.ink,
          textDecoration: 'none',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <span
          aria-hidden="true"
          style={{ font: `500 16px ${PF_TINTS.sans}`, color: PF_TINTS.inkDim, lineHeight: 1 }}
        >
          ←
        </span>
        {/* Same SVG wordmark as the dashboard TopBar — integer pixel
            dimensions matching the SVG's 8.75:1 native aspect so it
            renders crisp at any DPI. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/pathfinder/pathfinder_zedcor.svg"
          alt="Pathfinder · Zedcor"
          width={158}
          height={18}
          style={{ display: 'block', width: 158, height: 18 }}
        />
      </a>
      <span
        className="pf-mono"
        style={{
          fontSize: 9,
          color: PF_TINTS.inkDim,
          letterSpacing: '0.10em',
          textTransform: 'uppercase',
        }}
      >
        / settings
      </span>
      <span style={{ flex: 1 }} />
      <EmailPrompt email={email} setEmailState={setEmailState} />
      <span
        className="pf-mono"
        style={{
          fontSize: 9,
          color: isOperator ? '#9d35ff' : PF_TINTS.inkDim,
          letterSpacing: '0.10em',
          textTransform: 'uppercase',
          padding: '3px 8px',
          border: `1px solid ${
            isOperator ? hexAlpha('#9d35ff', 0.45) : PF_TINTS.ruleSoft
          }`,
          borderRadius: 3,
          background: isOperator ? hexAlpha('#9d35ff', 0.06) : 'transparent',
        }}
        title={
          isOperator
            ? 'Your email is in OPERATOR_EMAILS — operator-only sections are visible.'
            : 'Customer view — operator-only sections are hidden.'
        }
      >
        {isOperator ? 'operator' : 'customer'}
      </span>
    </div>
  );
}

function EmailPrompt({
  email,
  setEmailState,
}: {
  email: string;
  setEmailState: (s: string) => void;
}) {
  const [draft, setDraft] = React.useState(email);
  React.useEffect(() => setDraft(email), [email]);
  const onSave = () => {
    setUserEmail(draft);
    setEmailState(draft);
    window.dispatchEvent(new Event('storage'));
  };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span
        className="pf-mono"
        style={{
          fontSize: 9,
          color: PF_TINTS.inkDim,
          letterSpacing: '0.10em',
          textTransform: 'uppercase',
        }}
      >
        you
      </span>
      <input
        type="email"
        placeholder="email@example.com"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={onSave}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
        style={{
          background: PF_TINTS.bgAlt,
          border: `1px solid ${PF_TINTS.ruleSoft}`,
          borderRadius: 3,
          padding: '4px 8px',
          color: PF_TINTS.ink,
          font: `400 11px ${PF_TINTS.mono}`,
          width: 220,
          outline: 'none',
        }}
      />
    </span>
  );
}

function LeftRail({
  sections,
  activeId,
  onSelect,
}: {
  sections: SectionDef[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <nav
      style={{
        background: PF_TINTS.bg,
        borderRight: `1px solid ${PF_TINTS.ruleSoft}`,
        padding: '24px 8px',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
      }}
    >
      {sections.map((s) => {
        const active = s.id === activeId;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onSelect(s.id)}
            style={{
              textAlign: 'left',
              padding: '8px 12px',
              border: 'none',
              borderRadius: 3,
              background: active ? PF_TINTS.bgAlt : 'transparent',
              color: active ? PF_TINTS.ink : PF_TINTS.inkSub,
              cursor: 'pointer',
              font: `${active ? 600 : 500} 12px ${PF_TINTS.sans}`,
              letterSpacing: '-0.005em',
              transition: 'background 80ms ease, color 80ms ease',
            }}
          >
            {s.label}
          </button>
        );
      })}
    </nav>
  );
}
