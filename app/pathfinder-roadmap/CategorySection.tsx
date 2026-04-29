import styles from './roadmap.module.css';
import type { RoadmapCategory, RoadmapFeature } from '@/data/roadmap';
import { STATUS_ORDER } from '@/data/roadmap';
import FeatureCard from './FeatureCard';

export default function CategorySection({
  category,
  features,
  index,
  total,
}: {
  category: RoadmapCategory;
  features: RoadmapFeature[];
  index: number;
  total: number;
}) {
  const sorted = [...features].sort(
    (a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status),
  );
  const positionLabel = `Area ${String(index + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}`;
  return (
    <section
      className={styles.categorySection}
      data-testid="category-section"
      data-category={category}
    >
      <header className={styles.categoryHeader}>
        <div>
          <div className={styles.categoryEyebrow}>{positionLabel}</div>
          <h2 className={styles.h2}>{category}</h2>
        </div>
        <div className={styles.categoryCount}>
          {features.length} {features.length === 1 ? 'feature' : 'features'}
        </div>
      </header>
      <div className={styles.grid}>
        {sorted.map((f, i) => (
          <FeatureCard key={f.title} feature={f} index={Math.min(i, 6)} />
        ))}
      </div>
    </section>
  );
}
