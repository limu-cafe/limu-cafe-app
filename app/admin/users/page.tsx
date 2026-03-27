import { createClient } from '@/lib/supabase/server';
import UsersClient from './UsersClient';

export default async function AdminUsersPage() {
  const supabase = await createClient();
  const { data: users } = await supabase
    .from('users')
    .select('*')
    .order('created_at', { ascending: false });

  return <UsersClient users={users ?? []} />;
}
