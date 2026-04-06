import { createAdminClient } from '@/lib/supabase/server';
import SettlementClient from './SettlementClient';

export const dynamic = 'force-dynamic';

export default async function AdminSettlementPage() {
  const supabase = createAdminClient();

  // 後払い残高があるユーザー一覧
  const { data: users } = await supabase
    .from('users')
    .select('id, name, avatar_url, deferred_balance')
    .gt('deferred_balance', 0)
    .order('deferred_balance', { ascending: false });

  // 精算履歴
  const { data: history } = await supabase
    .from('settlements')
    .select('*, user:users!settlements_user_id_fkey(name)')
    .order('created_at', { ascending: false })
    .limit(30);

  return <SettlementClient users={users ?? []} history={history ?? []} />;
}
