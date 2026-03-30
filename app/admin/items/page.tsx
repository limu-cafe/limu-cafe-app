import { createAdminClient } from '@/lib/supabase/server';
import ItemsClient from './ItemsClient';

export const dynamic = 'force-dynamic';

export default async function AdminItemsPage() {
  const supabase = createAdminClient();
  const [{ data: items }, { data: categories }] = await Promise.all([
    supabase.from('items').select('*, category:categories(*)').order('created_at', { ascending: false }),
    supabase.from('categories').select('*').order('sort_order'),
  ]);

  return <ItemsClient items={items ?? []} categories={categories ?? []} />;
}
