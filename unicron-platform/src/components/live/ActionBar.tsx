export type ActivePanel = 'add-agent' | 'add-source' | 'edit-node' | null;

type Props = {
  active: ActivePanel;
  onToggle: (panel: NonNullable<ActivePanel>) => void;
};

const buttons: { id: NonNullable<ActivePanel>; label: string }[] = [
  { id: 'add-agent', label: '+ AGENT' },
  { id: 'add-source', label: '+ SOURCE' },
  { id: 'edit-node', label: 'EDIT NODE' },
];

export function ActionBar({ active, onToggle }: Props) {
  return (
    <div className="absolute top-4 right-4 z-30 flex gap-2">
      {buttons.map((b) => {
        const isActive = active === b.id;
        return (
          <button
            key={b.id}
            type="button"
            onClick={() => onToggle(b.id)}
            className={[
              'mono text-[11px] tracking-[0.14em] uppercase py-2 px-4 rounded-md border transition-colors',
              isActive
                ? 'bg-white text-bg-base border-white'
                : 'bg-transparent text-text-primary border-border-default hover:bg-white/[0.08] hover:border-border-hover',
            ].join(' ')}
          >
            {b.label}
          </button>
        );
      })}
    </div>
  );
}
