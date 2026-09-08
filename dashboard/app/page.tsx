import { requireAdmin } from '@/lib/auth-guard';
import { Nav } from './Nav';
import { OverviewClient } from './OverviewClient';

export default async function OverviewPage() {
  await requireAdmin();
  return (
    <>
      <Nav />
      <OverviewClient />
    </>
  );
}
