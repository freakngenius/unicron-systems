import { roadmapData } from '@/data/roadmap';
import RoadmapClient from './RoadmapClient';

export const dynamic = 'force-static';

export default function Page() {
  return <RoadmapClient data={roadmapData} />;
}
