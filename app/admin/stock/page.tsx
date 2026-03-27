import { createClient } from '@/lib/supabase/server';
import StockClient from './StockClient';

export default async function StockPage() {
  const supabase = await createClient();
  const { data: items } = await supabase
    .from('items')
    .select('*, category:categories(*)')
    .eq('is_available', true)
    .order('name');

  const { data: history } = await supabase
    .from('stock_history')
    .select('*, item:items(name), created_by_user:users!stock_history_created_by_fkey(name)')
    .eq('reason', 'restock')
    .order('created_at', { ascending: false })
    .limit(20);

  return <StockClient items={items ?? []} history={history ?? []} />;
}
