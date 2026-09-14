import { requireGod } from '@/lib/auth-guard';
import { Nav } from '../Nav';
import { ModerationClient } from './ModerationClient';

export default async function ModerationPage() {
  await requireGod();
  return (
    <>
      <Nav />
      <ModerationClient />
    </>
  );
}
