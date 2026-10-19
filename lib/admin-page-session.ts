import { redirect } from 'next/navigation';
import { requireAdminSession } from '@/lib/admin-session';

// Authorize at the data-reading page as well as middleware; the client UI is not an access control.
export async function requireAdminPage() {
  const session = await requireAdminSession();
  if (!session.user) redirect('/admin/login');
  return session.user;
}
