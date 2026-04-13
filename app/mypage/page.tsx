import UserLayout from '@/components/layout/UserLayout';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { syncUserProfile } from '@/lib/supabase/sync-user';
import { redirect } from 'next/navigation';
import MyPageClient from './MyPageClient';

const PAGE_SIZE = 3;

export default async function MyPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  await syncUserProfile(user);
  const adminClient = createAdminClient();

  const [
    { data: profile },
    { data: orders },
    { data: chargeRequests },
    { data: favorites },
    { data: legacyTransferRequests },
  ] = await Promise.all([
    adminClient
      .from('users')
      .select('name, email, avatar_url, balance, deferred_balance')
      .eq('id', user.id)
      .single(),
    adminClient
      .from('orders')
      .select(
        'id, total_amount, payment_method, payment_status, created_at, order_items(item_name, quantity, item:items(id, name, price, stock, is_available, stock_alert_threshold, category_id, image_url, description, popular_override, new_arrival_override, created_at, updated_at))'
      )
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE + 1),
    adminClient
      .from('charge_requests')
      .select('id, amount, method, status, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE + 1),
    adminClient
      .from('favorite_items')
      .select('item:items(id, name, price, stock, is_available)')
      .eq('user_id', user.id)
      .limit(6),
    adminClient
      .from('legacy_transfer_requests')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1),
  ]);

  const initialOrders = (orders ?? []) as any[];
  const initialCharges = (chargeRequests ?? []) as any[];

  return (
    <UserLayout>
      <MyPageClient
        profile={profile}
        initialOrders={initialOrders.slice(0, PAGE_SIZE)}
        initialCharges={initialCharges.slice(0, PAGE_SIZE)}
        initialHasMoreOrders={initialOrders.length > PAGE_SIZE}
        initialHasMoreCharges={initialCharges.length > PAGE_SIZE}
        favorites={(favorites ?? []) as any}
        latestLegacyTransferRequest={
          legacyTransferRequests?.[0]
            ? {
                ...legacyTransferRequests[0],
                legacy_name: legacyTransferRequests[0].legacy_name ?? null,
                note: legacyTransferRequests[0].note ?? null,
                rejection_reason: legacyTransferRequests[0].rejection_reason ?? null,
              }
            : null
        }
      />
    </UserLayout>
  );
}
