import { createClient } from '@/lib/supabase/server';
import OrdersClient from './OrdersClient';

export default async function AdminOrdersPage() {
  const supabase = await createClient();
  const { data: orders } = await supabase
    .from('orders')
    .select('*, user:users(name, avatar_url), order_items(item_name, quantity, subtotal, item_price)')
    .order('created_at', { ascending: false })
    .limit(100);

  return <OrdersClient orders={orders ?? []} />;
}
