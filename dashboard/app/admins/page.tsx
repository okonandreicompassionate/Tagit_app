import { requireGod } from '@/lib/auth-guard';
import { Nav } from '../Nav';
import { AdminsClient } from './AdminsClient';

export default async function AdminsPage() {
  await requireGod();
  return (
    <>
      <Nav />
      <AdminsClient />
    </>
  );
}
