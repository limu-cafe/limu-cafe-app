import UserLayout from '@/components/layout/UserLayout';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { syncUserProfile } from '@/lib/supabase/sync-user';
import { unstable_noStore as noStore } from 'next/cache';
import { redirect } from 'next/navigation';
import type { Item, Category } from '@/types';
import ItemListClient from './ItemListClient';
import { Suspense } from 'react';
import DeferredDataPlaceholder from '@/components/user/DeferredDataPlaceholder';
import type { User as AuthUser } from '@supabase/supabase-js';

async function HomeContent({ userId, authUser }: { userId: string; authUser: AuthUser }) {
  await syncUserProfile(authUser);
  const adminClient = createAdminClient();

  const [
    { data: items, error: itemsError },
    { data: categories, error: categoriesError },
    { data: favoriteItems, error: favoriteItemsError },
  ] = await Promise.all([
    adminClient
      .from('items')
      .select(
        'id, name, english_name, description, price, category_id, image_url, stock, stock_alert_threshold, is_available, popular_override, new_arrival_override, created_at, updated_at'
      )
      .eq('is_available', true)
      .order('created_at', { ascending: false }),
    adminClient
      .from('categories')
      .select('id, name, icon, sort_order, created_at')
      .order('sort_order'),
    adminClient.from('favorite_items').select('item_id').eq('user_id', userId),
  ]);

  if (itemsError) console.error('failed to load items for home page', itemsError);
  if (categoriesError) console.error('failed to load categories for home page', categoriesError);
  if (favoriteItemsError) console.error('failed to load favorites for home page', favoriteItemsError);

  const categoryMap = new Map(((categories ?? []) as Category[]).map((category) => [category.id, category]));
  const itemList = ((items ?? []) as Item[]).map((item) => ({
    ...item,
    category: item.category_id ? categoryMap.get(item.category_id) : undefined,
  }));
  const favoriteItemIds = (favoriteItems ?? []).map((favorite: { item_id: string }) => favorite.item_id);

  return (
    <ItemListClient
      items={itemList}
      categories={(categories ?? []) as Category[]}
      initialFavoriteItemIds={favoriteItemIds}
      initialFrequentItemIds={[]}
      initialPopularItemIds={[]}
    />
  );
}

export default async function HomePage() {
  noStore();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const layoutUser = {
    id: user.id,
    name: user.user_metadata?.full_name ?? user.user_metadata?.name ?? user.email ?? 'LIMUメンバー',
    balance: 0,
  };

  return (
    <UserLayout initialUser={layoutUser}>
      <Suspense fallback={<DeferredDataPlaceholder blocks={4} titleWidthClassName="w-44" />}>
        <HomeContent userId={user.id} authUser={user} />
      </Suspense>
    </UserLayout>
  );
}
