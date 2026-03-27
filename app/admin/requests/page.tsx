import { createClient } from '@/lib/supabase/server';
import RequestsClient from './RequestsClient';

export default async function AdminRequestsPage() {
  const supabase = await createClient();
  const { data: requests } = await supabase
    .from('item_requests')
    .select('*, user:users(name, avatar_url)')
    .order('created_at', { ascending: false });

  return <RequestsClient requests={requests ?? []} />;
}
