import styles from './roadmap.module.css';
import type { RoadmapCategory, RoadmapFeature } from '@/data/roadmap';
import { STATUS_ORDER } from '@/data/roadmap';
import FeatureCard from './FeatureCard';

export default function CategorySection({
  category,
  features,
}: {
  category: RoadmapCategory;
  features: RoadmapFeature[];
}) {
  const sorted = [...features].sort(
    (a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status),
  );
  return (
    <section
      className={styles.categorySection}
      data-testid="category-section"
      data-category={category}
    >
      <h2 className={styles.h2}>{category}</h2>
      <div className={styles.grid}>
        {sorted.map((f) => (
          <FeatureCard key={f.title} feature={f} />
        ))}
      </div>
    </section>
  );
}
