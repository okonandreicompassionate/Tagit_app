import { requireAdmin } from '@/lib/auth-guard';
import { Nav } from '../Nav';
import { AccountsClient } from './AccountsClient';

export default async function AccountsPage() {
  await requireAdmin();
  return (
    <>
      <Nav />
      <AccountsClient />
    </>
  );
}
