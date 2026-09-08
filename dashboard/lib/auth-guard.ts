import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { COOKIE_NAME, verifySessionToken } from './session';

/** Call at the top of every protected Server Component. Redirects if not signed in. */
export async function requireAdmin(): Promise<void> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!(await verifySessionToken(token))) {
    redirect('/login');
  }
}
