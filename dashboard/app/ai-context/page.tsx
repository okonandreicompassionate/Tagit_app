import { requireAdmin } from '@/lib/auth-guard';
import { Nav } from '../Nav';
import { AiContextClient } from './AiContextClient';

export default async function AiContextPage() {
  await requireAdmin();
  return (
    <>
      <Nav />
      <AiContextClient />
    </>
  );
}
