import Link from 'next/link';
import { ClipboardList, MessageSquare, Sparkles, Users, type LucideIcon } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/server';
import BotIntroBroadcastCard from './BotIntroBroadcastCard';

export const dynamic = 'force-dynamic';

export default async function AdminOperationsHubPage() {
  const supabase = createAdminClient();
  const allowedWorkspaceId = process.env.ALLOWED_SLACK_WORKSPACE_ID?.trim() || null;
  let pendingBotIntroUsersQuery = supabase
    .from('users')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true)
    .not('slack_user_id', 'is', null)
    .is('bot_intro_sent_at', null);

  if (allowedWorkspaceId) {
    pendingBotIntroUsersQuery = pendingBotIntroUsersQuery.eq('slack_workspace_id', allowedWorkspaceId);
  }

  const [
    { count: pendingUsers },
    { count: pendingRequests },
    { count: pendingLegacyTransfers },
    { count: pointTransactionsToday },
    { count: pendingBotIntroUsers },
  ] = await Promise.all([
    supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('is_approved', false)
      .eq('is_active', true),
    supabase
      .from('item_requests')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending'),
    supabase
      .from('legacy_transfer_requests')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending'),
    supabase
      .from('point_transactions')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', new Date(new Date().setHours(0, 0, 0, 0)).toISOString()),
    pendingBotIntroUsersQuery,
  ]);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-gray-500">Admin Hub</p>
        <h1 className="font-display text-3xl font-bold text-white">ユーザー・運営</h1>
        <p className="mt-2 text-sm text-gray-400">
          ユーザー承認、ポイント運用、要望確認、旧データ引き継ぎをまとめて扱います。
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard label="承認待ち" value={`${pendingUsers ?? 0}件`} />
        <MetricCard label="要望の判断待ち" value={`${pendingRequests ?? 0}件`} />
        <MetricCard label="旧データ引き継ぎ" value={`${pendingLegacyTransfers ?? 0}件`} />
        <MetricCard label="今日のポイント履歴" value={`${pointTransactionsToday ?? 0}件`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        <HubLink href="/admin/users" icon={Users} title="ユーザー管理" description="承認、残高追加、利用状況の確認を行います。" />
        <HubLink href="/admin/points" icon={Sparkles} title="ポイント管理" description="付与率、キャンペーン、手動付与/減算を管理します。" />
        <HubLink href="/admin/requests" icon={MessageSquare} title="商品要望" description="要望の確認、採用判断、コメント確認を行います。" />
        <HubLink href="/admin/legacy" icon={ClipboardList} title="旧データ移行" description="旧システムからの引き継ぎ申請を確認します。" />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <BotIntroBroadcastCard eligibleCount={pendingBotIntroUsers ?? 0} />
        <Link href="/admin/audit" className="rounded-2xl border border-gray-800 bg-gray-900 p-5 hover:bg-gray-800/70">
          <h2 className="text-lg font-semibold text-white">監査ログ</h2>
          <p className="mt-2 text-sm leading-6 text-gray-400">
            管理操作の履歴を時系列で確認できます。何がいつ行われたか振り返るときに使います。
          </p>
        </Link>
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-900 px-5 py-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold text-white">{value}</p>
    </div>
  );
}

function HubLink({
  href,
  icon: Icon,
  title,
  description,
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-2xl border border-gray-800 bg-gray-900 p-5 transition-colors hover:bg-gray-800/70"
    >
      <div className="rounded-xl bg-white/5 p-2 text-white w-fit">
        <Icon size={18} />
      </div>
      <h2 className="mt-4 text-lg font-semibold text-white">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-gray-400">{description}</p>
    </Link>
  );
}
