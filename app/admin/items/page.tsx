import { requireAdminPage } from '@/lib/admin-page-session';
import { createAdminClient } from '@/lib/supabase/server';
import ItemsClient from './ItemsClient';
import ItemOrderEditor from './ItemOrderEditor';
import { loadItemDisplayOrder } from '@/lib/item-order-server';
import { sortItemsByDisplayOrder } from '@/lib/item-order';
import { requireVerifiedAdminSession } from '@/lib/admin-session';
import type { Item } from '@/types';

export const dynamic = 'force-dynamic';

export default async function AdminItemsPage() {
  await requireAdminPage();
  const supabase = createAdminClient();
  const [itemsQuery, categoriesQuery, displayOrder, session] = await Promise.all([
    supabase.from('items').select('*, category:categories(*)').order('created_at', { ascending: false }),
    supabase.from('categories').select('*').order('sort_order'),
    loadItemDisplayOrder(supabase),
    requireVerifiedAdminSession(),
  ]);
  if (itemsQuery.error) throw itemsQuery.error;
  if (categoriesQuery.error) throw categoriesQuery.error;
  const items = sortItemsByDisplayOrder((itemsQuery.data ?? []) as Item[], displayOrder.itemIds);
  return <ItemsClient items={items} categories={categoriesQuery.data ?? []}
    orderEditor={<ItemOrderEditor items={items} revision={displayOrder.revision} available={displayOrder.available} verified={!session.error} />} />;
}
