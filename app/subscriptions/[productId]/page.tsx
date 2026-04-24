import { notFound, redirect } from 'next/navigation';
import UserLayout from '@/components/layout/UserLayout';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { syncUserProfile } from '@/lib/supabase/sync-user';
import SubscriptionDetailClient from './SubscriptionDetailClient';

export const dynamic = 'force-dynamic';

export default async function SubscriptionDetailPage({
  params,
}: {
  params: { productId: string };
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  await syncUserProfile(user);

  const adminSupabase = createAdminClient();
  const [{ data: profile }, { data: product }, { data: subscriptions }] = await Promise.all([
    adminSupabase
      .from('users')
      .select('id, name, balance, points_balance')
      .eq('id', user.id)
      .single(),
    adminSupabase
      .from('subscription_products')
      .select('*')
      .eq('id', params.productId)
      .maybeSingle(),
    adminSupabase
      .from('user_subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .eq('subscription_product_id', params.productId)
      .order('created_at', { ascending: false }),
  ]);

  if (!product) {
    notFound();
  }

  const latestSubscription = subscriptions?.[0] ?? null;
  const { data: payments } = latestSubscription
    ? await adminSupabase
        .from('subscription_payments')
        .select('*')
        .eq('user_subscription_id', latestSubscription.id)
        .order('created_at', { ascending: false })
        .limit(10)
    : { data: [] };

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
      <SubscriptionDetailClient
        profile={(profile ?? null) as any}
        product={product as any}
        latestSubscription={latestSubscription as any}
        payments={(payments ?? []) as any[]}
      />
    </UserLayout>
  );
}
