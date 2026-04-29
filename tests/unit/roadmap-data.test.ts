import { describe, it, expect } from 'vitest';
import {
  roadmapData,
  ROADMAP_CATEGORIES,
  type RoadmapStatus,
} from '@/data/roadmap';

const VALID_STATUSES: RoadmapStatus[] = [
  'live',
  'building',
  'planned',
  'considering',
  'future',
];

describe('roadmapData', () => {
  it('has at least 60 features (matches current spec seed)', () => {
    expect(roadmapData.features.length).toBeGreaterThanOrEqual(60);
  });

  it('every feature has a valid status', () => {
    for (const f of roadmapData.features) {
      expect(VALID_STATUSES).toContain(f.status);
    }
  });

  it('every feature has a non-empty title and description', () => {
    for (const f of roadmapData.features) {
      expect(f.title.trim().length).toBeGreaterThan(0);
      expect(f.description.trim().length).toBeGreaterThan(0);
    }
  });

  it('every feature category is one of the 15 declared categories', () => {
    for (const f of roadmapData.features) {
      expect(ROADMAP_CATEGORIES).toContain(f.category);
    }
  });

  it('lastUpdated is an ISO-style yyyy-mm-dd date', () => {
    expect(roadmapData.lastUpdated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('has at least one feature in each of the 5 statuses', () => {
    for (const status of VALID_STATUSES) {
      const count = roadmapData.features.filter((f) => f.status === status).length;
      expect(count, `expected >=1 feature with status=${status}`).toBeGreaterThan(0);
    }
  });

  it('feature titles are unique', () => {
    const titles = roadmapData.features.map((f) => f.title);
    expect(new Set(titles).size).toBe(titles.length);
  });
});
