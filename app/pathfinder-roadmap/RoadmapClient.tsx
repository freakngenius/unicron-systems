'use client';

import { useMemo, useState } from 'react';
import styles from './roadmap.module.css';
import type { RoadmapData } from '@/data/roadmap';
import Hero from './Hero';
import StatusFilterBar, { type FilterValue } from './StatusFilterBar';
import FeatureGrid from './FeatureGrid';
import Footer from './Footer';

export default function RoadmapClient({ data }: { data: RoadmapData }) {
  const [filter, setFilter] = useState<FilterValue>('all');

  const counts = useMemo<Record<FilterValue, number>>(() => {
    const c: Record<FilterValue, number> = {
      all: data.features.length,
      live: 0,
      building: 0,
      planned: 0,
      considering: 0,
      future: 0,
    };
    for (const f of data.features) c[f.status]++;
    return c;
  }, [data.features]);

  return (
    <main className={styles.root}>
      <div className={styles.container}>
        <Hero lastUpdated={data.lastUpdated} />
        <StatusFilterBar value={filter} onChange={setFilter} counts={counts} />
        <FeatureGrid features={data.features} filter={filter} />
        <Footer />
      </div>
    </main>
  );
}
