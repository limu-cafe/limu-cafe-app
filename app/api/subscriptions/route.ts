import { NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { syncUserProfile } from '@/lib/supabase/sync-user';
import { pickLatestSubscriptionsByProduct } from '@/lib/subscriptions';

export async function GET() {
  const supabase = await createClient();
  const adminSupabase = createAdminClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await syncUserProfile(user);

  const { data: subscriptions, error: subscriptionsError } = await adminSupabase
    .from('user_subscriptions')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  const latestSubscriptions = pickLatestSubscriptionsByProduct((subscriptions ?? []) as any[]);
  const subscribedProductIds = Array.from(latestSubscriptions.keys());

  const [{ data: activeProducts, error: activeProductsError }, { data: subscribedInactiveProducts, error: inactiveProductsError }] =
    await Promise.all([
      adminSupabase
        .from('subscription_products')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: true }),
      subscribedProductIds.length > 0
        ? adminSupabase
            .from('subscription_products')
            .select('*')
            .in('id', subscribedProductIds)
            .eq('is_active', false)
            .order('created_at', { ascending: true })
        : Promise.resolve({ data: [], error: null }),
    ]);

  if (activeProductsError || inactiveProductsError || subscriptionsError) {
    return NextResponse.json(
      {
        error:
          activeProductsError?.message ??
          inactiveProductsError?.message ??
          subscriptionsError?.message ??
          'サブスク一覧の取得に失敗しました',
      },
      { status: 500 }
    );
  }

  const products = [...(activeProducts ?? []), ...(subscribedInactiveProducts ?? [])].filter(
    (product, index, list) => list.findIndex((candidate) => candidate.id === product.id) === index
  );

  return NextResponse.json({
    products,
    latestSubscriptionsByProduct: Object.fromEntries(latestSubscriptions.entries()),
  });
}
