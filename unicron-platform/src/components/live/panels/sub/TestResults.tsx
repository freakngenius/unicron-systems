import { type TestEvent } from '../../../../data/mocks';

type Props = {
  role: string;
  events: TestEvent[];
};

export function TestResults({ role, events }: Props) {
  const passed = events.filter((e) => e.status === 'pass').length;
  const failed = events.filter((e) => e.status === 'fail').length;
  const warned = events.filter((e) => e.status === 'warn').length;

  return (
    <section className="mt-8">
      <div className="mono text-[11px] uppercase tracking-[0.22em] text-accent-gold mb-4">
        TEST RESULTS · 10 recent events
        <span className="ml-2 text-text-secondary normal-case tracking-[0.08em]">· {role}</span>
      </div>

      <div className="bg-bg-card border border-border-default rounded-md divide-y divide-border-default">
        {events.map((e, i) => (
          <Row key={i} event={e} />
        ))}
      </div>

      <div className="mono text-[11px] text-text-secondary mt-3">
        {passed} of {events.length} passed
        {failed ? ` · ${failed} error${failed > 1 ? 's' : ''}` : ''}
        {warned ? ` · ${warned} warning${warned > 1 ? 's' : ''}` : ''}
      </div>
    </section>
  );
}

function Row({ event }: { event: TestEvent }) {
  const icon =
    event.status === 'pass' ? (
      <span className="text-accent-cyan">✓</span>
    ) : event.status === 'fail' ? (
      <span className="text-accent-magenta">✗</span>
    ) : (
      <span className="text-accent-gold">⚠</span>
    );

  return (
    <div className="p-3">
      <div className="mono text-[12px] flex items-center gap-3 text-text-primary">
        <span className="w-3 inline-flex justify-center">{icon}</span>
        <span>permit #{event.id}</span>
        <span className="text-text-secondary">·</span>
        <span className="text-text-secondary">{event.jurisdiction}</span>
      </div>
      <div className="mono text-[11px] text-text-primary/80 ml-6 mt-1">
        <div>
          <span className="text-text-secondary mr-2">in </span>
          <span className="text-text-primary/70">{event.in}</span>
        </div>
        <div className="mt-0.5">
          <span className="text-text-secondary mr-2">out</span>
          <OutValue status={event.status} value={event.out} />
        </div>
      </div>
    </div>
  );
}

function OutValue({ status, value }: { status: TestEvent['status']; value: string }) {
  if (status === 'fail') return <span className="text-accent-magenta">{value}</span>;
  if (status === 'warn') return <span className="text-accent-gold">{value}</span>;
  return <span className="text-text-primary/70">{value}</span>;
}
