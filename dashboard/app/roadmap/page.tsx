import { requireAdmin } from '@/lib/auth-guard';
import { Nav } from '../Nav';
import { RoadmapClient } from './RoadmapClient';

export default async function RoadmapPage() {
  await requireAdmin();
  return (
    <>
      <Nav />
      <RoadmapClient />
    </>
  );
}
