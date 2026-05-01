import { useEffect, type ReactNode } from 'react';
import { useSettings, type ArchitectNotifications, type Settings } from './SettingsContext';

type Props = {
  open: boolean;
  onClose: () => void;
};

export function SettingsDrawer({ open, onClose }: Props) {
  const { settings, update } = useSettings();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <>
      <div
        onClick={onClose}
        className={[
          'fixed inset-0 z-40 bg-black/40 transition-opacity',
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
        ].join(' ')}
        aria-hidden
      />
      <aside
        className={[
          'fixed right-0 top-0 bottom-0 w-[360px] z-50 bg-bg-panel border-l border-border-default',
          'transition-transform duration-200 ease-out',
          open ? 'translate-x-0' : 'translate-x-full',
        ].join(' ')}
        role="dialog"
        aria-label="Settings"
      >
        <div className="h-14 flex items-center justify-between px-6 border-b border-border-default">
          <span className="mono text-[11px] uppercase tracking-[0.2em] text-text-primary/60">
            Settings
          </span>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-text-primary/60 hover:text-text-primary mono text-base leading-none w-6 h-6 flex items-center justify-center"
          >
            ×
          </button>
        </div>

        <div className="overflow-y-auto h-[calc(100%-56px)] px-6 py-6">
          <Section title="Interface">
            <Row label="Show internal cost metrics">
              <Toggle
                on={settings.showInternalCostMetrics}
                onChange={(v) => update('showInternalCostMetrics', v)}
              />
            </Row>
            <Row label="Hover labels">
              <Toggle on={settings.hoverLabels} onChange={(v) => update('hoverLabels', v)} />
            </Row>
            <Row label="Activity feed">
              <Toggle on={settings.activityFeed} onChange={(v) => update('activityFeed', v)} />
            </Row>
            <Row label="Reduced motion" last>
              <Toggle on={settings.reducedMotion} onChange={(v) => update('reducedMotion', v)} />
            </Row>
          </Section>

          <Section title="Notifications">
            <Row label="Architect proposals">
              <Select
                value={settings.architectNotifications}
                onChange={(v) => update('architectNotifications', v as ArchitectNotifications)}
                options={[
                  { value: 'all', label: 'All' },
                  { value: 'sources', label: 'Sources only' },
                  { value: 'off', label: 'Off' },
                ]}
              />
            </Row>
            <Row label="Quality alerts">
              <Toggle on={settings.qualityAlerts} onChange={(v) => update('qualityAlerts', v)} />
            </Row>
            <Row label="Daily digest" last>
              <Toggle on={settings.dailyDigest} onChange={(v) => update('dailyDigest', v)} />
            </Row>
          </Section>

          <Section title="Architect">
            <Row label="Auto-accept trusted sources">
              <Toggle
                on={settings.autoAcceptTrustedSources}
                onChange={(v) => update('autoAcceptTrustedSources', v)}
              />
            </Row>
            <Row label="Auto-accept low-risk tuning">
              <Toggle
                on={settings.autoAcceptLowRiskTuning}
                onChange={(v) => update('autoAcceptLowRiskTuning', v)}
              />
            </Row>
            <Row label="Confidence threshold" last align="start">
              <ConfidenceSlider
                value={settings.confidenceThreshold}
                onChange={(v) => update('confidenceThreshold', v as Settings['confidenceThreshold'])}
              />
            </Row>
          </Section>

          <Section title="Access" last>
            <Row label="Team members">
              <ManageLink />
            </Row>
            <Row label="API keys">
              <ManageLink />
            </Row>
            <Row label="Billing" last>
              <ManageLink />
            </Row>
          </Section>
        </div>
      </aside>
    </>
  );
}

function Section({
  title,
  children,
  last,
}: {
  title: string;
  children: ReactNode;
  last?: boolean;
}) {
  return (
    <section className={last ? '' : 'mb-8'}>
      <h3 className="mono text-[11px] uppercase tracking-[0.22em] text-accent-gold mb-4">{title}</h3>
      <div>{children}</div>
    </section>
  );
}

function Row({
  label,
  children,
  last,
  align = 'center',
}: {
  label: string;
  children: ReactNode;
  last?: boolean;
  align?: 'center' | 'start';
}) {
  return (
    <div
      className={[
        'flex justify-between gap-4 py-3',
        align === 'start' ? 'items-start' : 'items-center',
        last ? '' : 'border-b border-border-default',
      ].join(' ')}
    >
      <span className="mono text-[12px] text-text-primary/85">{label}</span>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={[
        'relative w-8 h-[18px] rounded-full transition-colors',
        on ? 'bg-accent-violet/80' : 'bg-bg-input border border-border-default',
      ].join(' ')}
    >
      <span
        className={[
          'absolute top-[2px] w-[14px] h-[14px] rounded-full transition-all',
          on ? 'left-[16px] bg-white' : 'left-[2px] bg-text-primary/40',
        ].join(' ')}
      />
    </button>
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="mono text-[12px] bg-bg-input border border-border-default text-text-primary rounded-md px-2 py-1 focus:outline-none focus:border-accent-violet"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function ConfidenceSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex flex-col items-end gap-1 min-w-[140px]">
      <input
        type="range"
        min={0.7}
        max={1}
        step={0.01}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-[140px] accent-accent-violet"
      />
      <span className="mono text-[11px] text-text-primary/60">{value.toFixed(2)}</span>
    </div>
  );
}

function ManageLink() {
  return (
    <button
      type="button"
      className="mono text-[12px] text-text-primary/80 hover:text-accent-violet transition-colors"
    >
      Manage →
    </button>
  );
}
