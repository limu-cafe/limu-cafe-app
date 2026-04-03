import UserLayout from '@/components/layout/UserLayout';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import MyPageClient from './MyPageClient';

const PAGE_SIZE = 3;

export default async function MyPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [
    { data: profile },
    { data: orders },
    { data: chargeRequests },
    { data: favorites },
    { data: legacyTransferRequests },
    { count: orderCount },
    { count: chargeCount },
  ] = await Promise.all([
    supabase
      .from('users')
      .select('name, email, avatar_url, balance, deferred_balance')
      .eq('id', user.id)
      .single(),
    supabase
      .from('orders')
      .select(
        'id, total_amount, payment_method, payment_status, created_at, order_items(item_name, quantity, item:items(id, name, price, stock, is_available, stock_alert_threshold, category_id, image_url, description, popular_override, new_arrival_override, created_at, updated_at))'
      )
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE),
    supabase
      .from('charge_requests')
      .select('id, amount, method, status, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE),
    supabase
      .from('favorite_items')
      .select('item:items(id, name, price, stock, is_available)')
      .eq('user_id', user.id)
      .limit(6),
    supabase
      .from('legacy_transfer_requests')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1),
    supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id),
    supabase
      .from('charge_requests')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id),
  ]);

  return (
    <UserLayout>
      <MyPageClient
        profile={profile}
        initialOrders={(orders ?? []) as any}
        initialCharges={(chargeRequests ?? []) as any}
        orderCount={orderCount ?? 0}
        chargeCount={chargeCount ?? 0}
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
