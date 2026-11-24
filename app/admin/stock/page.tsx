import { requireAdminPage } from '@/lib/admin-page-session';
import { createAdminClient } from '@/lib/supabase/server';
import InventoryClient from './InventoryClient';

export const dynamic = 'force-dynamic';

export default async function AdminStockPage() {
  await requireAdminPage();
  const { data, error } = await createAdminClient().from('items')
    .select('id, name, stock, is_available')
    .or('is_unlimited_stock.is.null,is_unlimited_stock.eq.false')
    .order('name').order('id');
  if (error) throw error;
  return <InventoryClient items={data ?? []}/>;
}
