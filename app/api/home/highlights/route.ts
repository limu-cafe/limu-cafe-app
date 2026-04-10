import { NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase/server';

type OrderItemRow = { item_id: string };
type OrderRow = { order_items?: OrderItemRow[] | null };

export async function GET() {
  const supabase = await createClient();
  const adminSupabase = createAdminClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const popularSince = new Date();
  popularSince.setDate(popularSince.getDate() - 90);

  const [{ data: recentOrders }, { data: recentCompletedOrders }] = await Promise.all([
    supabase
      .from('orders')
      .select('order_items(item_id)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(8),
    adminSupabase
      .from('orders')
      .select('order_items(item_id)')
      .eq('payment_status', 'completed')
      .gte('created_at', popularSince.toISOString())
      .order('created_at', { ascending: false })
      .limit(40),
  ]);

  const frequentCounts = ((recentOrders ?? []) as OrderRow[]).reduce(
    (acc: Record<string, number>, order) => {
      for (const orderItem of order.order_items ?? []) {
        acc[orderItem.item_id] = (acc[orderItem.item_id] ?? 0) + 1;
      }
      return acc;
    },
    {}
  );

  const popularCounts = ((recentCompletedOrders ?? []) as OrderRow[]).reduce(
    (acc: Record<string, number>, order) => {
      for (const orderItem of order.order_items ?? []) {
        acc[orderItem.item_id] = (acc[orderItem.item_id] ?? 0) + 1;
      }
      return acc;
    },
    {}
  );

  return NextResponse.json({
    frequentItemIds: Object.entries(frequentCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([itemId]) => itemId)
      .slice(0, 4),
    popularItemIds: Object.entries(popularCounts)
      .sort((a: [string, number], b: [string, number]) => b[1] - a[1])
      .map(([itemId]) => itemId)
      .slice(0, 8),
  });
}
