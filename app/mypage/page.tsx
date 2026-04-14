import UserLayout from '@/components/layout/UserLayout';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { syncUserProfile } from '@/lib/supabase/sync-user';
import { redirect } from 'next/navigation';
import MyPageClient from './MyPageClient';
import { Suspense } from 'react';
import DeferredDataPlaceholder from '@/components/user/DeferredDataPlaceholder';
import type { User as AuthUser } from '@supabase/supabase-js';
import {
  isMissingDeferredSettlementMethodColumn,
  ORDERS_SELECT_LEGACY,
  ORDERS_SELECT_WITH_DEFERRED,
} from '@/lib/orders';

const PAGE_SIZE = 3;

async function MyPageContent({ user }: { user: AuthUser }) {
  await syncUserProfile(user);
  const adminClient = createAdminClient();

  let ordersQuery: any = await adminClient
    .from('orders')
    .select(ORDERS_SELECT_WITH_DEFERRED)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE + 1);

  if (isMissingDeferredSettlementMethodColumn(ordersQuery.error)) {
    ordersQuery = await adminClient
      .from('orders')
      .select(ORDERS_SELECT_LEGACY)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE + 1);
  }

  const [
    { data: profile },
    { data: orders },
    { data: chargeRequests },
    { data: favorites },
    { data: legacyTransferRequests },
  ] = await Promise.all([
    adminClient
      .from('users')
      .select('name, email, avatar_url, balance, deferred_balance')
      .eq('id', user.id)
      .single(),
    ordersQuery,
    adminClient
      .from('charge_requests')
      .select('id, amount, method, status, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE + 1),
    adminClient
      .from('favorite_items')
      .select('item:items(id, name, english_name, price, stock, is_available)')
      .eq('user_id', user.id)
      .limit(6),
    adminClient
      .from('legacy_transfer_requests')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1),
  ]);

  const initialOrders = (orders ?? []) as any[];
  const initialCharges = (chargeRequests ?? []) as any[];
  return (
    <MyPageClient
      profile={profile}
      initialOrders={initialOrders.slice(0, PAGE_SIZE)}
      initialCharges={initialCharges.slice(0, PAGE_SIZE)}
      initialHasMoreOrders={initialOrders.length > PAGE_SIZE}
      initialHasMoreCharges={initialCharges.length > PAGE_SIZE}
      favorites={(favorites ?? []) as any}
      latestLegacyTransferRequest={
        legacyTransferRequests?.[0]
          ? {
              ...legacyTransferRequests[0],
              legacy_name: legacyTransferRequests[0].legacy_name ?? null,
              note: legacyTransferRequests[0].note ?? null,
              rejection_reason: legacyTransferRequests[0].rejection_reason ?? null,
            }
          : null
      }
    />
  );
}

export default async function MyPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const layoutUser = {
    id: user.id,
    name: user.user_metadata?.full_name ?? user.user_metadata?.name ?? user.email ?? 'LIMUメンバー',
    balance: 0,
  };

  return (
    <UserLayout initialUser={layoutUser}>
      <Suspense fallback={<DeferredDataPlaceholder blocks={3} titleWidthClassName="w-40" />}>
        <MyPageContent user={user} />
      </Suspense>
    </UserLayout>
  );
}
