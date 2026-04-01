import UserLayout from '@/components/layout/UserLayout';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import type { Item, Category } from '@/types';
import ItemListClient from './ItemListClient';

export default async function HomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [{ data: items }, { data: categories }, { data: favoriteItems }, { data: recentOrders }] =
    await Promise.all([
    supabase
      .from('items')
      .select('*, category:categories(*)')
      .eq('is_available', true)
      .order('created_at', { ascending: false }),
    supabase
      .from('categories')
      .select('*')
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
      .limit(20),
  ]);

  const favoriteItemIds = (favoriteItems ?? []).map((favorite) => favorite.item_id);
  const frequentItemIds = Object.entries(
    (recentOrders ?? []).reduce<Record<string, number>>((acc, order: any) => {
      for (const orderItem of order.order_items ?? []) {
        acc[orderItem.item_id] = (acc[orderItem.item_id] ?? 0) + 1;
      }
      return acc;
    }, {})
  )
    .sort((a, b) => b[1] - a[1])
    .map(([itemId]) => itemId)
    .filter((itemId) => !favoriteItemIds.includes(itemId))
    .slice(0, 4);

  return (
    <UserLayout>
      <ItemListClient
        items={(items ?? []) as Item[]}
        categories={(categories ?? []) as Category[]}
        initialFavoriteItemIds={favoriteItemIds}
        frequentItemIds={frequentItemIds}
      />
    </UserLayout>
  );
}
