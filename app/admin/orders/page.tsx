import { createAdminClient } from '@/lib/supabase/server';
import OrdersClient from './OrdersClient';

export const dynamic = 'force-dynamic';

export default async function AdminOrdersPage() {
  const supabase = createAdminClient();
  const { data: orders } = await supabase
    .from('orders')
    .select('*, user:users!orders_user_id_fkey(name, avatar_url), order_items(item_name, quantity, subtotal, item_price)')
    .order('created_at', { ascending: false })
    .limit(100);

  return <OrdersClient orders={orders ?? []} />;
}
