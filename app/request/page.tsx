import { redirect } from 'next/navigation';
import UserLayout from '@/components/layout/UserLayout';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { Suspense } from 'react';
import DeferredDataPlaceholder from '@/components/user/DeferredDataPlaceholder';
import RequestPageContent from './RequestPageContent';
import { syncUserProfile } from '@/lib/supabase/sync-user';
import type { User as AuthUser } from '@supabase/supabase-js';

type RequestUser = {
  id: string;
  name: string;
  avatar_url?: string | null;
};

type RequestListRow = {
  id: string;
  user_id: string;
  item_name: string;
  reason?: string | null;
  desired_price?: number | null;
  status: 'pending' | 'approved' | 'rejected';
  admin_note?: string | null;
  created_at: string;
  updated_at: string;
  user?: RequestUser;
  vote_count: number;
  has_voted: boolean;
};

async function RequestPageData({
  user,
}: {
  user: AuthUser;
}) {
  await syncUserProfile(user);
  const adminClient = createAdminClient();

  const { data: requests } = await adminClient
    .from('item_requests')
    .select(
      'id, user_id, item_name, reason, desired_price, status, admin_note, created_at, updated_at, user:users!item_requests_user_id_fkey(id, name, avatar_url)'
    )
    .order('created_at', { ascending: false })
    .limit(24);

  const requestIds = (requests ?? []).map((request: { id: string }) => request.id);

  const { data: votes } = requestIds.length
    ? await adminClient
        .from('item_request_votes')
        .select('request_id, user_id')
        .in('request_id', requestIds)
    : { data: [] };

  const voteMap = new Map<string, { count: number; hasVoted: boolean }>();

  for (const vote of votes ?? []) {
    const current = voteMap.get(vote.request_id) ?? { count: 0, hasVoted: false };
    voteMap.set(vote.request_id, {
      count: current.count + 1,
      hasVoted: current.hasVoted || vote.user_id === user.id,
    });
  }

  const boardRequests = ((requests ?? []) as any[]).map((request) => {
    const voteState = voteMap.get(request.id) ?? { count: 0, hasVoted: false };
    return {
      ...request,
      user: Array.isArray(request.user) ? request.user[0] : request.user,
      vote_count: voteState.count,
      has_voted: voteState.hasVoted,
    };
  }) as RequestListRow[];

  return <RequestPageContent requests={boardRequests} />;
}

export default async function RequestPage() {
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
      <Suspense fallback={<DeferredDataPlaceholder blocks={3} titleWidthClassName="w-44" />}>
        <RequestPageData user={user} />
      </Suspense>
    </UserLayout>
  );
}
