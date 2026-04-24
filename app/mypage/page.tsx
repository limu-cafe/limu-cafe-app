import UserLayout from '@/components/layout/UserLayout';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { syncUserProfile } from '@/lib/supabase/sync-user';
import { redirect } from 'next/navigation';
import MyPageClient from './MyPageClient';
import { Suspense } from 'react';
import DeferredDataPlaceholder from '@/components/user/DeferredDataPlaceholder';
import type { User as AuthUser } from '@supabase/supabase-js';
import {
  FAVORITE_ITEM_SELECT_ENHANCED,
  FAVORITE_ITEM_SELECT_LEGACY,
  isMissingItemEnhancementColumns,
} from '@/lib/item-select';

async function MyPageContent({ user }: { user: AuthUser }) {
  await syncUserProfile(user);
  const adminClient = createAdminClient();

  const [
    { data: profile },
    initialFavoritesQuery,
    { data: legacyTransferRequests },
  ] = await Promise.all([
    adminClient
      .from('users')
      .select('name, email, avatar_url, balance, deferred_balance, points_balance')
      .eq('id', user.id)
      .single(),
    adminClient
      .from('favorite_items')
      .select(FAVORITE_ITEM_SELECT_ENHANCED)
      .eq('user_id', user.id)
      .limit(6),
    adminClient
      .from('legacy_transfer_requests')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1),
  ]);

  let favorites = initialFavoritesQuery.data;

  if (isMissingItemEnhancementColumns(initialFavoritesQuery.error)) {
    const legacyFavoritesQuery = await adminClient
      .from('favorite_items')
      .select(FAVORITE_ITEM_SELECT_LEGACY)
      .eq('user_id', user.id)
      .limit(6);

    favorites = legacyFavoritesQuery.data;
  }

  return (
    <MyPageClient
      profile={profile}
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

  const adminClient = createAdminClient();
  const { data: profile } = await adminClient
    .from('users')
    .select('name, balance')
    .eq('id', user.id)
    .single();

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
      <Suspense fallback={<DeferredDataPlaceholder blocks={3} titleWidthClassName="w-40" />}>
        <MyPageContent user={user} />
      </Suspense>
    </UserLayout>
  );
}
