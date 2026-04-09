import UserLayout from '@/components/layout/UserLayout';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { pickShowcaseItems } from '@/lib/item-highlights';
import { redirect } from 'next/navigation';
import type { Item, Category } from '@/types';
import ItemListClient from './ItemListClient';

export default async function HomePage() {
  const supabase = await createClient();
  const adminSupabase = createAdminClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const popularSince = new Date();
  popularSince.setDate(popularSince.getDate() - 90);

  const [
    { data: items },
    { data: categories },
    { data: favoriteItems },
    { data: recentOrders },
    { data: recentCompletedOrders },
  ] =
    await Promise.all([
    supabase
      .from('items')
      .select(
        'id, name, description, price, category_id, image_url, stock, stock_alert_threshold, is_available, popular_override, new_arrival_override, created_at, updated_at, category:categories(id, name, icon, sort_order, created_at)'
      )
      .eq('is_available', true)
      .order('created_at', { ascending: false }),
    supabase
      .from('categories')
      .select('id, name, icon, sort_order, created_at')
      .order('sort_order'),
    supabase
      .from('favorite_items')
      .select('item_id')
      .eq('user_id', user.id),
    supabase
      .from('orders')
      .select('order_items(item_id)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(12),
    adminSupabase
      .from('orders')
      .select('created_at, order_items(item_id)')
      .eq('payment_status', 'completed')
      .gte('created_at', popularSince.toISOString())
      .order('created_at', { ascending: false })
      .limit(80),
  ]);

  const itemList = ((items ?? []) as any[]).map((item) => ({
    ...item,
    category: Array.isArray(item.category) ? item.category[0] : item.category,
  })) as Item[];
  const completedOrders = (recentCompletedOrders ?? []) as Array<{
    order_items?: Array<{ item_id: string }>;
  }>;
  const favoriteItemIds = (favoriteItems ?? []).map((favorite) => favorite.item_id);
  const frequentCounts = (recentOrders ?? []).reduce<Record<string, number>>((acc, order: any) => {
    for (const orderItem of order.order_items ?? []) {
      acc[orderItem.item_id] = (acc[orderItem.item_id] ?? 0) + 1;
    }
    return acc;
  }, {});
  const frequentItemIds = Object.entries(frequentCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([itemId]) => itemId)
    .filter((itemId) => !favoriteItemIds.includes(itemId))
    .slice(0, 4);

  const popularCounts: Record<string, number> = completedOrders.reduce(
    (acc, order) => {
      for (const orderItem of order.order_items ?? []) {
        acc[orderItem.item_id] = (acc[orderItem.item_id] ?? 0) + 1;
      }
      return acc;
    },
    {} as Record<string, number>
  );

  const popularItemIds = pickShowcaseItems(
    itemList,
    Object.entries(popularCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([itemId]) => itemId),
    'popular',
    4
  ).map((item) => item.id);

  const newArrivalItemIds = pickShowcaseItems(
    itemList,
    [...itemList]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .map((item) => item.id),
    'new_arrival',
    4
  ).map((item) => item.id);

  return (
    <UserLayout>
      <ItemListClient
        items={itemList}
        categories={(categories ?? []) as Category[]}
        initialFavoriteItemIds={favoriteItemIds}
        frequentItemIds={frequentItemIds}
        popularItemIds={popularItemIds}
        newArrivalItemIds={newArrivalItemIds}
      />
    </UserLayout>
  );
}
