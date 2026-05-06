// Atrium "Now" tab — default landing view after sign-in.
// Sprint 1 placeholder: welcome message + date.

type Props = {
  name: string;
};

export function AtriumNow({ name }: Props) {
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="max-w-2xl">
      <div className="mono text-[11px] uppercase tracking-[0.18em] text-text-secondary mb-2">
        {today}
      </div>
      <h1 className="text-[22px] font-semibold text-text-primary mb-4">
        Welcome, {name}.
      </h1>
      <p className="mono text-[12px] text-text-secondary leading-relaxed">
        Atrium is being built. This is the internal cockpit for Unicron Systems.
        More surfaces will appear as sprints complete.
      </p>

      <div className="mt-8 grid grid-cols-2 gap-3">
        {[
          { label: 'People', sprint: 3, desc: 'Team directory, roles, availability' },
          { label: 'Work',   sprint: 3, desc: 'Active work items, sprints, kanban' },
          { label: 'Money',  sprint: 5, desc: 'Revenue, billing, expense tracker' },
          { label: 'System', sprint: 2, desc: 'Agent health, audit log, connectors' },
        ].map((item) => (
          <div
            key={item.label}
            className="bg-bg-card border border-border-default rounded-md p-4"
          >
            <div className="mono text-[11px] uppercase tracking-[0.14em] text-text-primary mb-1">
              {item.label}
            </div>
            <div className="mono text-[10px] text-text-secondary mb-2">{item.desc}</div>
            <div className="mono text-[9px] uppercase tracking-[0.14em] text-border-hover">
              Sprint {item.sprint}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
