import { redirect } from 'next/navigation';
import UserLayout from '@/components/layout/UserLayout';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { syncUserProfile } from '@/lib/supabase/sync-user';
import { pickLatestSubscriptionsByProduct } from '@/lib/subscriptions';
import SubscriptionsClient from './SubscriptionsClient';

export const dynamic = 'force-dynamic';

export default async function SubscriptionsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  await syncUserProfile(user);

  const adminSupabase = createAdminClient();
  const [{ data: profile }, { data: subscriptions }] = await Promise.all([
    adminSupabase
      .from('users')
      .select('id, name, balance')
      .eq('id', user.id)
      .single(),
    adminSupabase
      .from('user_subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
  ]);

  const latestByProduct = pickLatestSubscriptionsByProduct((subscriptions ?? []) as any[]);
  const subscribedProductIds = Array.from(latestByProduct.keys());

  const { data: activeProducts } = await adminSupabase
    .from('subscription_products')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: true });

  const { data: subscribedInactiveProducts } =
    subscribedProductIds.length > 0
      ? await adminSupabase
          .from('subscription_products')
          .select('*')
          .in('id', subscribedProductIds)
          .eq('is_active', false)
          .order('created_at', { ascending: true })
      : { data: [] as any[] };

  const mergedProducts = [...(activeProducts ?? []), ...(subscribedInactiveProducts ?? [])].filter(
    (product, index, list) => list.findIndex((candidate) => candidate.id === product.id) === index
  );
  const cards = mergedProducts.map((product: any) => ({
    product,
    latestSubscription: latestByProduct.get(product.id) ?? null,
  }));

  const layoutUser = {
    id: user.id,
    name:
      profile?.name ??
      user.user_metadata?.full_name ??
      user.user_metadata?.name ??
      user.email ??
      'LIMU Member',
    balance: profile?.balance ?? 0,
  };

  return (
    <UserLayout initialUser={layoutUser}>
      <SubscriptionsClient cards={cards as any[]} />
    </UserLayout>
  );
}
