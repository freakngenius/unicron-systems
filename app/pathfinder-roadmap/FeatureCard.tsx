import type { CSSProperties } from 'react';
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

interface CardCSSVars extends CSSProperties {
  '--rd-i'?: number;
}

export default function FeatureCard({
  feature,
  index = 0,
}: {
  feature: RoadmapFeature;
  index?: number;
}) {
  const style: CardCSSVars = { '--rd-i': index };
  return (
    <article className={styles.card} data-testid="feature-card" style={style}>
      <header className={styles.cardHeader}>
        <span className={`${styles.pill} ${PILL_CLASS[feature.status]}`}>
          <span className={styles.pillDot} aria-hidden="true" />
          {STATUS_LABELS[feature.status]}
        </span>
        <span className={styles.tag}>{feature.category}</span>
      </header>
      <h3 className={styles.h3}>{feature.title}</h3>
      <p className={styles.body}>{feature.description}</p>
    </article>
  );
}
