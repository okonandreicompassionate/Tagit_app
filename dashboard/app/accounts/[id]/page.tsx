import { requireAdmin } from '@/lib/auth-guard';
import { Nav } from '../../Nav';
import { AccountDetailClient } from './AccountDetailClient';

export default async function AccountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  return (
    <>
      <Nav />
      <AccountDetailClient id={id} />
    </>
  );
}
