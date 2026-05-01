import { useMemo, useState } from 'react';
import { TestResults } from './TestResults';
import { enricherTests, type TestEvent } from '../../../../data/mocks';

type Filter = 'all' | 'pass' | 'fail' | 'warn';

export function EditNodeTest() {
  const [filter, setFilter] = useState<Filter>('all');

  const counts = useMemo(() => {
    return {
      all: enricherTests.length,
      pass: enricherTests.filter((e) => e.status === 'pass').length,
      fail: enricherTests.filter((e) => e.status === 'fail').length,
      warn: enricherTests.filter((e) => e.status === 'warn').length,
    };
  }, []);

  const visible: TestEvent[] = useMemo(() => {
    if (filter === 'all') return enricherTests;
    return enricherTests.filter((e) => e.status === filter);
  }, [filter]);

  const pills: { id: Filter; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: counts.all },
    { id: 'pass', label: 'Passed', count: counts.pass },
    { id: 'fail', label: 'Failed', count: counts.fail },
    { id: 'warn', label: 'Warnings', count: counts.warn },
  ];

  return (
    <div>
      <div className="flex gap-2 flex-wrap mb-2">
        {pills.map((p) => {
          const active = filter === p.id;
          return (
            <button
              key={p.id}
              onClick={() => setFilter(p.id)}
              className={[
                'mono text-[12px] uppercase tracking-[0.12em] py-2 px-3 rounded-md border transition-colors',
                active
                  ? 'border-text-primary text-text-primary'
                  : 'border-border-default text-text-secondary hover:text-text-primary hover:border-border-hover',
              ].join(' ')}
            >
              {p.label} ({p.count})
            </button>
          );
        })}
      </div>

      {visible.length === 0 ? (
        <div className="bg-bg-card border border-border-default rounded-md p-6 mt-4 text-center mono text-[12px] text-text-secondary">
          no events match this filter
        </div>
      ) : (
        <TestResults role="Enricher" events={visible} />
      )}
    </div>
  );
}
