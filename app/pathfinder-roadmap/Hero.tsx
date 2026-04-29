import styles from './roadmap.module.css';
import { STATUS_LABELS, STATUS_ORDER } from '@/data/roadmap';
import type { RoadmapStatus } from '@/data/roadmap';

const PILL_CLASS: Record<RoadmapStatus, string> = {
  live: styles['pill-live'] as string,
  building: styles['pill-building'] as string,
  planned: styles['pill-planned'] as string,
  considering: styles['pill-considering'] as string,
  future: styles['pill-future'] as string,
};

export default function Hero({
  lastUpdated,
  counts,
  totalCategories,
}: {
  lastUpdated: string;
  counts: Record<RoadmapStatus | 'all', number>;
  totalCategories: number;
}) {
  return (
    <section className={styles.hero}>
      <div className={styles.heroLeft}>
        <span className={styles.brand}>Pathfinder</span>
        <h1 className={styles.h1}>Roadmap</h1>
        <p className={styles.lede}>
          Pathfinder finds the next contract before the rep does. This is the
          public log of what&rsquo;s shipped, what&rsquo;s in flight, and where
          the agent fleet is headed next.
        </p>
        <div className={styles.heroStamp}>
          Updated{' '}
          <time dateTime={lastUpdated}>{formatDate(lastUpdated)}</time>
        </div>
      </div>
      <aside className={styles.heroRight} aria-label="Roadmap stats">
        {STATUS_ORDER.map((s) => (
          <div key={s} className={styles.stat}>
            <span className={styles.statLabel}>
              <span
                className={`${styles.statSwatch} ${PILL_CLASS[s]}`}
                aria-hidden="true"
              />
              {STATUS_LABELS[s]}
            </span>
            <span className={styles.statValue}>
              {counts[s].toString().padStart(2, '0')}
            </span>
          </div>
        ))}
        <div className={styles.stat}>
          <span className={styles.statLabel}>Categories</span>
          <span className={styles.statValue}>
            {totalCategories.toString().padStart(2, '0')}
          </span>
        </div>
      </aside>
    </section>
  );
}

function formatDate(iso: string): string {
  const [yStr, mStr, dStr] = iso.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  const d = Number(dStr);
  if (!y || !m || !d) return iso;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
