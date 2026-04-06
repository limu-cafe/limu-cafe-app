import { createAdminClient } from '@/lib/supabase/server';
import UsersClient from './UsersClient';

export const dynamic = 'force-dynamic';

export default async function AdminUsersPage() {
  const supabase = createAdminClient();
  const { data: users } = await supabase
    .from('users')
    .select('*')
    .order('created_at', { ascending: false });

  return <UsersClient users={users ?? []} />;
}
