import { createAdminClient } from '@/lib/supabase/server';
import ChargeClient from './ChargeClient';

export const dynamic = 'force-dynamic';

export default async function AdminChargePage() {
  const supabase = createAdminClient();
  const { data: requests } = await supabase
    .from('charge_requests')
    .select('*, user:users!charge_requests_user_id_fkey(name, avatar_url, balance)')
    .order('created_at', { ascending: false })
    .limit(100);

  return <ChargeClient requests={requests ?? []} />;
}
