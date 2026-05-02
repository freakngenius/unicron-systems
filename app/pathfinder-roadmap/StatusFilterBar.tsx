'use client';

import styles from './roadmap.module.css';
import type { RoadmapStatus } from '@/data/roadmap';
import { STATUS_LABELS, STATUS_ORDER } from '@/data/roadmap';

export type FilterValue = 'all' | RoadmapStatus;

const PILL_CLASS: Record<RoadmapStatus, string> = {
  live: styles['pill-live'] as string,
  building: styles['pill-building'] as string,
  planned: styles['pill-planned'] as string,
  considering: styles['pill-considering'] as string,
  future: styles['pill-future'] as string,
};

type Item = { key: FilterValue; label: string; pillClass: string | null };

const ITEMS: Item[] = [
  { key: 'all', label: 'All', pillClass: null },
  ...STATUS_ORDER.map((s) => ({
    key: s,
    label: STATUS_LABELS[s],
    pillClass: PILL_CLASS[s],
  })),
];

export default function StatusFilterBar({
  value,
  onChange,
  counts,
}: {
  value: FilterValue;
  onChange: (next: FilterValue) => void;
  counts: Record<FilterValue, number>;
}) {
  return (
    <nav className={styles.filterBar} aria-label="Filter features by status">
      {ITEMS.map((item) => {
        const isActive = value === item.key;
        const className = [
          styles.pill,
          styles.filterPill,
          item.pillClass ?? styles.filterPillAll,
          isActive ? styles.pillActive : '',
        ]
          .filter(Boolean)
          .join(' ');
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onChange(item.key)}
            aria-pressed={isActive}
            className={className}
            data-testid={`filter-${item.key}`}
          >
            {item.pillClass ? (
              <span className={styles.pillDot} aria-hidden="true" />
            ) : null}
            {item.label}
            <span className={styles.count}>{counts[item.key]}</span>
          </button>
        );
      })}
    </nav>
  );
}
