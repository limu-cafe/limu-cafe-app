import { requireAdminPage } from '@/lib/admin-page-session';
import { createAdminClient } from '@/lib/supabase/server';
import SubscriptionsAdminClient from './SubscriptionsAdminClient';

export const dynamic = 'force-dynamic';

export default async function AdminSubscriptionsPage() {
  await requireAdminPage();
  const supabase = createAdminClient();
  const { data: products } = await supabase
    .from('subscription_products')
    .select('*')
    .order('created_at', { ascending: false });

  return <SubscriptionsAdminClient products={(products ?? []) as any[]} />;
}
