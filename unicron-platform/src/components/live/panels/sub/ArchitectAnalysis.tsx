import { sourceAnalysis } from '../../../../data/mocks';

export function ArchitectAnalysis() {
  const { sourceType, watcher, schemaMapping, sampleFetch, confidence } = sourceAnalysis;

  return (
    <section className="mt-8">
      <div className="mono text-[11px] uppercase tracking-[0.22em] text-accent-gold mb-4">
        ✦ ARCHITECT ANALYSIS
      </div>

      <div className="bg-bg-card border border-border-default rounded-lg p-5 mono text-[12px] leading-[1.65] text-text-primary space-y-5">
        <Block label="SOURCE TYPE DETECTED">
          <div className="text-text-primary/85">{sourceType}</div>
        </Block>

        <Block label="PROPOSED WATCHER">
          <KvRow k="Name" v={watcher.name} />
          <KvRow k="Layer" v={watcher.layer} />
          <KvRow k="Adapter" v={watcher.adapter} />
          <KvRow k="Poll cadence" v={watcher.pollCadence} />
          <div className="mt-2">
            <div className="text-text-secondary">Schema mapping</div>
            <div className="ml-2 mt-1 space-y-0.5">
              {schemaMapping.map((m, i) => (
                <div key={i} className="flex gap-2">
                  <span
                    className={
                      m.status === '✓' ? 'text-accent-cyan w-3' : 'text-accent-gold w-3'
                    }
                  >
                    {m.status}
                  </span>
                  <span className={m.status === '⚠' ? 'text-text-primary/85' : 'text-text-primary/85'}>
                    {m.text}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Block>

        <Block label="SAMPLE FETCH (last 5 records)">
          <div className="space-y-0.5 text-text-primary/80">
            {sampleFetch.map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </div>
        </Block>

        <Block label="CONFIDENCE">
          <div className="text-text-primary">{confidence}</div>
        </Block>
      </div>
    </section>
  );
}

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-text-secondary tracking-[0.12em] mb-1">{label}</div>
      <div className="ml-2">{children}</div>
    </div>
  );
}

function KvRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-3">
      <span className="text-text-secondary">{k}</span>
      <span className="text-text-primary/85">{v}</span>
    </div>
  );
}
