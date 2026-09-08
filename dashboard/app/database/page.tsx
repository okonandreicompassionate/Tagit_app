import { requireAdmin } from '@/lib/auth-guard';
import { currentLimits, currentPlan } from '@/lib/limits';
import { Nav } from '../Nav';
import { DatabaseClient } from './DatabaseClient';

export default async function DatabasePage() {
  await requireAdmin();
  const limits = currentLimits();
  const plan = currentPlan();

  return (
    <>
      <Nav />
      <DatabaseClient
        limits={{
          plan,
          planLabel: limits.label,
          databaseBytes: limits.databaseBytes,
          storageBytes: limits.storageBytes,
          realtimeConcurrent: limits.realtimeConcurrent,
          monthlyActiveUsers: limits.monthlyActiveUsers,
        }}
      />
    </>
  );
}
