// Settings.tsx — Sprint 7 Stream B
// Notification preferences panel for Atrium.
// Accessible from the user avatar menu in AtriumLayout.
//
// Reads from  GET  /api/atrium/me/preferences?member_id=<uuid>
// Writes to   PATCH /api/atrium/me/preferences  { member_id, notifications }
//
// Preferences are stored in nervous_system.team_members.config->'notifications'
// via ns_get_member_notifications / ns_update_member_notifications RPCs.

import { useState, useEffect, useCallback } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NotificationPreferences {
  slack_dm: boolean;
  slack_escalations_channel: boolean;
  atrium_badges: {
    escalations: boolean;
    calendar: boolean;
    calls: boolean;
    sprints: boolean;
    calendar_minutes_before: number;
  };
  email_digest: boolean;
  push_notifications: boolean;
}

const DEFAULT_PREFS: NotificationPreferences = {
  slack_dm: true,
  slack_escalations_channel: true,
  atrium_badges: {
    escalations: true,
    calendar: true,
    calls: true,
    sprints: true,
    calendar_minutes_before: 15,
  },
  email_digest: false,
  push_notifications: false,
};

const CALENDAR_MINUTES_OPTIONS = [5, 10, 15, 30] as const;

// ─── Sub-components ───────────────────────────────────────────────────────────

interface ToggleProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  id: string;
}

function Toggle({ checked, onChange, disabled, id }: ToggleProps) {
  return (
    <button
      id={id}
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E8763A] focus-visible:ring-offset-2 focus-visible:ring-offset-[#101012] disabled:opacity-40 disabled:cursor-not-allowed"
      style={{ background: checked ? 'var(--accent)' : '#2A2A2E' }}
    >
      <span
        className="pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform"
        style={{ transform: checked ? 'translateX(16px)' : 'translateX(0px)' }}
      />
    </button>
  );
}

interface RowProps {
  label: string;
  description?: string;
  id: string;
  children: React.ReactNode;
}

function PrefRow({ label, description, id, children }: RowProps) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-border-default last:border-b-0">
      <div className="flex-1 min-w-0">
        <label htmlFor={id} className="mono text-[12px] text-text-primary block cursor-pointer">
          {label}
        </label>
        {description && (
          <p className="mono text-[10px] text-text-muted mt-0.5">{description}</p>
        )}
      </div>
      <div className="flex-shrink-0 flex items-center">{children}</div>
    </div>
  );
}

interface SectionProps {
  title: string;
  children: React.ReactNode;
}

function Section({ title, children }: SectionProps) {
  return (
    <div className="bg-white border border-border-default rounded-lg mb-4">
      <div className="px-4 pt-3 pb-1 border-b border-border-default">
        <span className="mono text-[9px] uppercase tracking-[0.18em] text-text-muted">
          {title}
        </span>
      </div>
      <div className="px-4">{children}</div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface SettingsProps {
  memberId?: string;
  onClose?: () => void;
}

type SaveState = 'idle' | 'loading' | 'success' | 'error';

export function Settings({ memberId, onClose }: SettingsProps) {
  const [prefs, setPrefs] = useState<NotificationPreferences>(DEFAULT_PREFS);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [errorMsg, setErrorMsg] = useState<string>('');

  // Load preferences on mount
  const loadPrefs = useCallback(async () => {
    if (!memberId) {
      // No member_id — use defaults without loading
      setLoadState('ready');
      return;
    }
    setLoadState('loading');
    try {
      const resp = await fetch(
        `/api/atrium/me/preferences?member_id=${encodeURIComponent(memberId)}`
      );
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = (await resp.json()) as { notifications?: Partial<NotificationPreferences> };
      const remote = json.notifications ?? {};

      // Merge remote prefs over defaults (handles partial data in DB)
      setPrefs({
        ...DEFAULT_PREFS,
        ...remote,
        atrium_badges: {
          ...DEFAULT_PREFS.atrium_badges,
          ...(remote.atrium_badges ?? {}),
        },
      });
      setLoadState('ready');
    } catch (e) {
      // If no member found or load fails, fall back to defaults
      setLoadState('ready');
    }
  }, [memberId]);

  useEffect(() => {
    loadPrefs();
  }, [loadPrefs]);

  // Save preferences
  async function handleSave() {
    if (!memberId) {
      setErrorMsg('No member ID — cannot save preferences');
      setSaveState('error');
      return;
    }
    setSaveState('loading');
    setErrorMsg('');
    try {
      const resp = await fetch('/api/atrium/me/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ member_id: memberId, notifications: prefs }),
      });
      if (!resp.ok) {
        const json = (await resp.json()) as { error?: string };
        throw new Error(json.error ?? `HTTP ${resp.status}`);
      }
      setSaveState('success');
      setTimeout(() => setSaveState('idle'), 2500);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setSaveState('error');
      setTimeout(() => setSaveState('idle'), 4000);
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  function setTop<K extends keyof NotificationPreferences>(
    key: K,
    value: NotificationPreferences[K]
  ) {
    setPrefs((p) => ({ ...p, [key]: value }));
  }

  function setBadge<K extends keyof NotificationPreferences['atrium_badges']>(
    key: K,
    value: NotificationPreferences['atrium_badges'][K]
  ) {
    setPrefs((p) => ({
      ...p,
      atrium_badges: { ...p.atrium_badges, [key]: value },
    }));
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loadState === 'loading') {
    return (
      <div className="max-w-xl w-full">
        <SettingsHeader onClose={onClose} />
        <div className="flex items-center justify-center py-16 mono text-[11px] text-text-muted animate-pulse">
          loading preferences…
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-xl w-full">
      <SettingsHeader onClose={onClose} />

      {/* Slack */}
      <Section title="Slack">
        <PrefRow
          id="pref-slack-dm"
          label="Direct message"
          description="Receive Slack DMs from agents for action items and escalations"
        >
          <Toggle
            id="pref-slack-dm"
            checked={prefs.slack_dm}
            onChange={(v) => setTop('slack_dm', v)}
          />
        </PrefRow>
        <PrefRow
          id="pref-slack-escalations"
          label="#escalations channel"
          description="Tag you in the escalations channel when issues surface"
        >
          <Toggle
            id="pref-slack-escalations"
            checked={prefs.slack_escalations_channel}
            onChange={(v) => setTop('slack_escalations_channel', v)}
          />
        </PrefRow>
      </Section>

      {/* Atrium badges */}
      <Section title="Atrium badges">
        <PrefRow
          id="pref-badge-escalations"
          label="Escalations"
          description="Show badge on the Atrium tab for unresolved escalations"
        >
          <Toggle
            id="pref-badge-escalations"
            checked={prefs.atrium_badges.escalations}
            onChange={(v) => setBadge('escalations', v)}
          />
        </PrefRow>
        <PrefRow
          id="pref-badge-calendar"
          label="Calendar"
          description="Show badge when upcoming events need attention"
        >
          <Toggle
            id="pref-badge-calendar"
            checked={prefs.atrium_badges.calendar}
            onChange={(v) => setBadge('calendar', v)}
          />
        </PrefRow>
        <PrefRow
          id="pref-badge-calls"
          label="Calls"
          description="Show badge for new call summaries or action items"
        >
          <Toggle
            id="pref-badge-calls"
            checked={prefs.atrium_badges.calls}
            onChange={(v) => setBadge('calls', v)}
          />
        </PrefRow>
        <PrefRow
          id="pref-badge-sprints"
          label="Sprints"
          description="Show badge when sprint tasks are blocked or need review"
        >
          <Toggle
            id="pref-badge-sprints"
            checked={prefs.atrium_badges.sprints}
            onChange={(v) => setBadge('sprints', v)}
          />
        </PrefRow>
        <PrefRow
          id="pref-calendar-advance"
          label="Calendar alert advance"
          description="How many minutes before an event to show a badge"
        >
          <select
            id="pref-calendar-advance"
            value={prefs.atrium_badges.calendar_minutes_before}
            onChange={(e) => setBadge('calendar_minutes_before', Number(e.target.value))}
            className="bg-bg-raised border border-border-default rounded-md px-2 py-1 mono text-[11px] text-text-primary focus:outline-none focus:border-[#E8763A] cursor-pointer"
          >
            {CALENDAR_MINUTES_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {m} min
              </option>
            ))}
          </select>
        </PrefRow>
      </Section>

      {/* Email + Push */}
      <Section title="Email & push">
        <PrefRow
          id="pref-email-digest"
          label="Daily email digest"
          description="Receive a daily summary of action items and agent activity"
        >
          <Toggle
            id="pref-email-digest"
            checked={prefs.email_digest}
            onChange={(v) => setTop('email_digest', v)}
          />
        </PrefRow>
        <PrefRow
          id="pref-push"
          label="Push notifications"
          description="Browser push for urgent escalations (requires permission)"
        >
          <Toggle
            id="pref-push"
            checked={prefs.push_notifications}
            onChange={(v) => setTop('push_notifications', v)}
          />
        </PrefRow>
      </Section>

      {/* Save bar */}
      <div className="flex items-center justify-between gap-3 mt-5">
        <div className="flex-1">
          {saveState === 'success' && (
            <span className="mono text-[11px] text-[#2E8E66]">Preferences saved</span>
          )}
          {saveState === 'error' && (
            <span className="mono text-[11px] text-[#E14B4B]">{errorMsg || 'Save failed'}</span>
          )}
          {!memberId && (
            <span className="mono text-[10px] text-text-faint">
              Sign in to save preferences to your profile
            </span>
          )}
        </div>
        <button
          onClick={handleSave}
          disabled={saveState === 'loading' || !memberId}
          className="mono text-[11px] uppercase tracking-[0.14em] px-4 py-2 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: 'var(--accent)', color: '#fff' }}
        >
          {saveState === 'loading' ? 'Saving…' : 'Save preferences'}
        </button>
      </div>
    </div>
  );
}

// ─── Header ───────────────────────────────────────────────────────────────────

function SettingsHeader({ onClose }: { onClose?: () => void }) {
  return (
    <div className="flex items-center justify-between mb-5">
      <div>
        <h1 className="mono text-[18px] text-text-primary font-semibold">Settings</h1>
        <p className="mono text-[11px] text-text-muted mt-1">
          Notification preferences and account settings
        </p>
      </div>
      {onClose && (
        <button
          onClick={onClose}
          className="mono text-[10px] uppercase tracking-[0.16em] text-text-muted hover:text-text-primary transition-colors"
          aria-label="Close settings"
        >
          Close
        </button>
      )}
    </div>
  );
}
