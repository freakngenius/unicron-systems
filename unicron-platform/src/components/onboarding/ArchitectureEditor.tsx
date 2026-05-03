import { useState, type ReactNode } from 'react';
import type { DecompositionArchitecture } from '../../lib/contracts/architect';

type Props = {
  architecture: DecompositionArchitecture;
  onApply: (edited: DecompositionArchitecture) => void;
  onCancel: () => void;
};

/**
 * In-place architecture editor. Renders the structured `architecture` shape
 * Stream D returns (and the mock synthesizes) as a set of editable fields:
 *   - BUYER + BUYING SIGNAL: free-text inputs.
 *   - PUBLIC DATA SOURCES: chip list (add/remove rows). Each row is the
 *     canonical `type` string and a comma-separated jurisdictions field.
 *   - PROPOSED ARCHITECTURE: chip lists for each layer (watcher source_type,
 *     L3 role, L4 role).
 *
 * Per Phase B spec, APPLY EDITS does not re-call the architect; it commits
 * the edited shape as-is. CANCEL discards the local draft.
 */
export function ArchitectureEditor({
  architecture,
  onApply,
  onCancel,
}: Props) {
  const [draft, setDraft] = useState<DecompositionArchitecture>(() =>
    cloneArchitecture(architecture),
  );

  const updateBuyer = (buyer: string) =>
    setDraft((d) => ({ ...d, buyer }));
  const updateSignal = (buying_signal: string) =>
    setDraft((d) => ({ ...d, buying_signal }));

  const updateSourceType = (idx: number, type: string) =>
    setDraft((d) => ({
      ...d,
      data_sources_proposed: d.data_sources_proposed.map((s, i) =>
        i === idx ? { ...s, type } : s,
      ),
    }));
  const updateSourceJurisdictions = (idx: number, raw: string) => {
    const jurisdictions = raw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    setDraft((d) => ({
      ...d,
      data_sources_proposed: d.data_sources_proposed.map((s, i) =>
        i === idx ? { ...s, jurisdictions } : s,
      ),
    }));
  };
  const removeSource = (idx: number) =>
    setDraft((d) => ({
      ...d,
      data_sources_proposed: d.data_sources_proposed.filter((_, i) => i !== idx),
    }));
  const addSource = () =>
    setDraft((d) => ({
      ...d,
      data_sources_proposed: [
        ...d.data_sources_proposed,
        { type: 'permits', jurisdictions: [], expected_daily_volume: 1 },
      ],
    }));

  const updateWatcherType = (idx: number, source_type: string) =>
    setDraft((d) => ({
      ...d,
      layer_2_watchers: d.layer_2_watchers.map((w, i) =>
        i === idx ? { ...w, source_type } : w,
      ),
    }));
  const removeWatcher = (idx: number) =>
    setDraft((d) => ({
      ...d,
      layer_2_watchers: d.layer_2_watchers.filter((_, i) => i !== idx),
    }));
  const addWatcher = () =>
    setDraft((d) => ({
      ...d,
      layer_2_watchers: [
        ...d.layer_2_watchers,
        { source_type: 'permits', instruction: '' },
      ],
    }));

  const updateL3Role = (idx: number, role: string) =>
    setDraft((d) => ({
      ...d,
      layer_3_agents: d.layer_3_agents.map((a, i) =>
        i === idx ? { ...a, role } : a,
      ),
    }));
  const removeL3 = (idx: number) =>
    setDraft((d) => ({
      ...d,
      layer_3_agents: d.layer_3_agents.filter((_, i) => i !== idx),
    }));
  const addL3 = () =>
    setDraft((d) => ({
      ...d,
      layer_3_agents: [...d.layer_3_agents, { role: 'Agent', instruction: '' }],
    }));

  const updateL4Role = (idx: number, role: string) =>
    setDraft((d) => ({
      ...d,
      layer_4_agents: d.layer_4_agents.map((a, i) =>
        i === idx ? { ...a, role } : a,
      ),
    }));
  const removeL4 = (idx: number) =>
    setDraft((d) => ({
      ...d,
      layer_4_agents: d.layer_4_agents.filter((_, i) => i !== idx),
    }));
  const addL4 = () =>
    setDraft((d) => ({
      ...d,
      layer_4_agents: [...d.layer_4_agents, { role: 'Agent', instruction: '' }],
    }));

  return (
    <div className="space-y-5">
      <Section label="BUYER">
        <input
          type="text"
          value={draft.buyer}
          onChange={(e) => updateBuyer(e.target.value)}
          className={inputClass}
          aria-label="Buyer"
        />
      </Section>

      <Section label="BUYING SIGNAL">
        <textarea
          rows={2}
          value={draft.buying_signal}
          onChange={(e) => updateSignal(e.target.value)}
          className={`${inputClass} resize-none`}
          aria-label="Buying signal"
        />
      </Section>

      <Section label="PUBLIC DATA SOURCES">
        <div className="space-y-2">
          {draft.data_sources_proposed.map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="text"
                value={s.type}
                onChange={(e) => updateSourceType(i, e.target.value)}
                className={`${inputClass} flex-shrink-0 w-[170px]`}
                aria-label={`Data source type ${i + 1}`}
              />
              <input
                type="text"
                value={s.jurisdictions.join(', ')}
                onChange={(e) => updateSourceJurisdictions(i, e.target.value)}
                placeholder="jurisdictions (comma-separated)"
                className={`${inputClass} flex-1`}
                aria-label={`Data source ${i + 1} jurisdictions`}
              />
              <RemoveButton onClick={() => removeSource(i)} label={`Remove data source ${i + 1}`} />
            </div>
          ))}
          <AddButton onClick={addSource} label="+ ADD DATA SOURCE" />
        </div>
      </Section>

      <Section label="PROPOSED ARCHITECTURE — L2 WATCHERS">
        <ChipList
          items={draft.layer_2_watchers.map((w) => w.source_type)}
          onChange={updateWatcherType}
          onRemove={removeWatcher}
          onAdd={addWatcher}
          ariaLabelPrefix="Watcher"
          addLabel="+ ADD WATCHER"
        />
      </Section>

      <Section label="L3 AGENTS">
        <ChipList
          items={draft.layer_3_agents.map((a) => a.role)}
          onChange={updateL3Role}
          onRemove={removeL3}
          onAdd={addL3}
          ariaLabelPrefix="L3 agent"
          addLabel="+ ADD L3 AGENT"
        />
      </Section>

      <Section label="L4 AGENTS">
        <ChipList
          items={draft.layer_4_agents.map((a) => a.role)}
          onChange={updateL4Role}
          onRemove={removeL4}
          onAdd={addL4}
          ariaLabelPrefix="L4 agent"
          addLabel="+ ADD L4 AGENT"
        />
      </Section>

      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={() => onApply(draft)}
          className="bg-white text-bg-base mono text-[12px] tracking-[0.12em] uppercase py-3 px-5 rounded-md hover:bg-text-primary transition-colors"
        >
          APPLY EDITS
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="border border-border-default text-text-primary mono text-[12px] tracking-[0.12em] uppercase py-3 px-5 rounded-md hover:border-border-hover transition-colors"
        >
          CANCEL
        </button>
      </div>
    </div>
  );
}

const inputClass =
  'bg-bg-input border border-border-default rounded-md px-3 py-2 mono text-[12px] text-text-primary placeholder:text-text-primary/35 focus:outline-none focus:border-accent-violet transition-colors w-full';

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="mono text-[10px] uppercase tracking-[0.22em] text-accent-gold mb-2">
        {label}
      </div>
      {children}
    </div>
  );
}

type ChipListProps = {
  items: string[];
  onChange: (idx: number, value: string) => void;
  onRemove: (idx: number) => void;
  onAdd: () => void;
  ariaLabelPrefix: string;
  addLabel: string;
};

function ChipList({ items, onChange, onRemove, onAdd, ariaLabelPrefix, addLabel }: ChipListProps) {
  return (
    <div className="space-y-2">
      {items.map((value, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(i, e.target.value)}
            className={inputClass}
            aria-label={`${ariaLabelPrefix} ${i + 1}`}
          />
          <RemoveButton onClick={() => onRemove(i)} label={`Remove ${ariaLabelPrefix} ${i + 1}`} />
        </div>
      ))}
      <AddButton onClick={onAdd} label={addLabel} />
    </div>
  );
}

function RemoveButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="mono text-[12px] text-text-secondary hover:text-accent-magenta border border-border-default hover:border-accent-magenta rounded-md w-8 h-8 flex items-center justify-center transition-colors flex-shrink-0"
    >
      ×
    </button>
  );
}

function AddButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mono text-[10px] uppercase tracking-[0.18em] text-text-secondary hover:text-text-primary border border-dashed border-border-default hover:border-border-hover rounded-md py-2 px-3 transition-colors"
    >
      {label}
    </button>
  );
}

function cloneArchitecture(arch: DecompositionArchitecture): DecompositionArchitecture {
  return {
    buyer: arch.buyer,
    buying_signal: arch.buying_signal,
    data_sources_proposed: arch.data_sources_proposed.map((s) => ({
      type: s.type,
      jurisdictions: [...s.jurisdictions],
      expected_daily_volume: s.expected_daily_volume,
    })),
    data_sources_rejected: arch.data_sources_rejected.map((r) => ({ ...r })),
    layer_2_watchers: arch.layer_2_watchers.map((w) => ({ ...w })),
    layer_3_agents: arch.layer_3_agents.map((a) => ({ ...a })),
    layer_4_agents: arch.layer_4_agents.map((a) => ({ ...a })),
    estimates: { ...arch.estimates },
    open_questions: [...arch.open_questions],
  };
}
