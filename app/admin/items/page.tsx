import { createClient } from '@/lib/supabase/server';
import ItemsClient from './ItemsClient';

export default async function AdminItemsPage() {
  const supabase = await createClient();
  const [{ data: items }, { data: categories }] = await Promise.all([
    supabase.from('items').select('*, category:categories(*)').order('created_at', { ascending: false }),
    supabase.from('categories').select('*').order('sort_order'),
  ]);

  return <ItemsClient items={items ?? []} categories={categories ?? []} />;
}
