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

  const visibleCategories = ROADMAP_CATEGORIES.filter((category) =>
    filtered.some((f) => f.category === category),
  );

  return (
    <div className={styles.featureGridRoot}>
      {visibleCategories.map((category, idx) => {
        const matching = filtered.filter((f) => f.category === category);
        return (
          <CategorySection
            key={category}
            category={category}
            features={matching}
            index={idx}
            total={visibleCategories.length}
          />
        );
      })}
      {filtered.length === 0 && (
        <p className={styles.empty}>No features match the current filter.</p>
      )}
    </div>
  );
}
