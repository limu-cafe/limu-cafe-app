import UserLayout from '@/components/layout/UserLayout';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import type { Item, Category } from '@/types';
import ItemListClient from './ItemListClient';

export default async function HomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [
    { data: items },
    { data: categories },
    { data: favoriteItems },
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
  ]);

  const itemList = ((items ?? []) as any[]).map((item) => ({
    ...item,
    category: Array.isArray(item.category) ? item.category[0] : item.category,
  })) as Item[];
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
