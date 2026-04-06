import { createAdminClient } from '@/lib/supabase/server';
import RequestsClient from './RequestsClient';

export const dynamic = 'force-dynamic';

export default async function AdminRequestsPage() {
  const supabase = createAdminClient();
  const { data: requests } = await supabase
    .from('item_requests')
    .select('*, user:users!item_requests_user_id_fkey(name, avatar_url), votes:item_request_votes(user_id), comments:item_request_comments(id)')
    .order('created_at', { ascending: false });

  return <RequestsClient requests={requests ?? []} />;
}
