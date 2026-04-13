import UserLayout from '@/components/layout/UserLayout';
import { createClient } from '@/lib/supabase/server';
import { unstable_noStore as noStore } from 'next/cache';
import { redirect } from 'next/navigation';
import type { Item, Category } from '@/types';
import ItemListClient from './ItemListClient';

export default async function HomePage() {
  noStore();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [
    { data: items, error: itemsError },
    { data: categories, error: categoriesError },
    { data: favoriteItems, error: favoriteItemsError },
  ] =
    await Promise.all([
    supabase
      .from('items')
      .select(
        'id, name, description, price, category_id, image_url, stock, stock_alert_threshold, is_available, popular_override, new_arrival_override, created_at, updated_at'
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
  ]);

  if (itemsError) {
    console.error('failed to load items for home page', itemsError);
  }
  if (categoriesError) {
    console.error('failed to load categories for home page', categoriesError);
  }
  if (favoriteItemsError) {
    console.error('failed to load favorites for home page', favoriteItemsError);
  }

  const categoryMap = new Map(((categories ?? []) as Category[]).map((category) => [category.id, category]));
  const itemList = ((items ?? []) as Item[]).map((item) => ({
    ...item,
    category: item.category_id ? categoryMap.get(item.category_id) : undefined,
  }));
  const favoriteItemIds = (favoriteItems ?? []).map((favorite) => favorite.item_id);

  return (
    <UserLayout>
      <ItemListClient
        items={itemList}
        categories={(categories ?? []) as Category[]}
        initialFavoriteItemIds={favoriteItemIds}
        initialFrequentItemIds={[]}
        initialPopularItemIds={[]}
      />
    </UserLayout>
  );
}
