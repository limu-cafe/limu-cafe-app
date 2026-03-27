import { createClient } from '@/lib/supabase/server';
import ChargeClient from './ChargeClient';

export default async function AdminChargePage() {
  const supabase = await createClient();
  const { data: requests } = await supabase
    .from('charge_requests')
    .select('*, user:users(name, avatar_url, balance)')
    .order('created_at', { ascending: false })
    .limit(100);

  return <ChargeClient requests={requests ?? []} />;
}
