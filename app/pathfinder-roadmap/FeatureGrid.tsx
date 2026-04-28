import styles from './roadmap.module.css';
import type { RoadmapFeature, RoadmapStatus } from '@/data/roadmap';
import { ROADMAP_CATEGORIES } from '@/data/roadmap';
import CategorySection from './CategorySection';

export default function FeatureGrid({
  features,
  filter,
}: {
  features: RoadmapFeature[];
  filter: 'all' | RoadmapStatus;
}) {
  const filtered =
    filter === 'all' ? features : features.filter((f) => f.status === filter);

  return (
    <div className={styles.featureGridRoot}>
      {ROADMAP_CATEGORIES.map((category) => {
        const matching = filtered.filter((f) => f.category === category);
        if (matching.length === 0) return null;
        return (
          <CategorySection
            key={category}
            category={category}
            features={matching}
          />
        );
      })}
      {filtered.length === 0 && (
        <p className={styles.empty}>No features match the current filter.</p>
      )}
    </div>
  );
}
