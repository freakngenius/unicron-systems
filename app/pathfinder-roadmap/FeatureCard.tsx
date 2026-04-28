import styles from './roadmap.module.css';
import type { RoadmapFeature, RoadmapStatus } from '@/data/roadmap';
import { STATUS_LABELS } from '@/data/roadmap';

const PILL_CLASS: Record<RoadmapStatus, string> = {
  live: styles['pill-live'] as string,
  building: styles['pill-building'] as string,
  planned: styles['pill-planned'] as string,
  considering: styles['pill-considering'] as string,
  future: styles['pill-future'] as string,
};

export default function FeatureCard({ feature }: { feature: RoadmapFeature }) {
  return (
    <article className={styles.card} data-testid="feature-card">
      <header className={styles.cardHeader}>
        <span className={`${styles.pill} ${PILL_CLASS[feature.status]}`}>
          {STATUS_LABELS[feature.status]}
        </span>
        <span className={`${styles.mono} ${styles.tag}`}>{feature.category}</span>
      </header>
      <h3 className={styles.h3}>{feature.title}</h3>
      <p className={styles.body}>{feature.description}</p>
    </article>
  );
}
