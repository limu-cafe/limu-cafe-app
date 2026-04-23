import Link from 'next/link';
import { ClipboardList, ArrowRight, MessageSquare, Sparkles, Users, ScrollText, type LucideIcon } from 'lucide-react';
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
    pendingBotIntroUsersQuery = pendingBotIntroUsersQuery.eq(
      'slack_workspace_id',
      allowedWorkspaceId
    );
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
      <section className="rounded-3xl border border-gray-800 bg-gradient-to-br from-gray-900 via-gray-900 to-gray-950 p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">
          Operations workspace
        </p>
        <h1 className="mt-3 font-display text-3xl font-bold text-white">ユーザー・運営</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-gray-400">
          ユーザー承認、ポイント運用、商品要望、旧データ移行、監査ログをまとめています。
          「人に関する運営作業」はこのまとまりから探すと分かりやすいです。
        </p>
      </section>

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard label="承認待ち" value={`${pendingUsers ?? 0}件`} />
        <MetricCard label="要望の判断待ち" value={`${pendingRequests ?? 0}件`} />
        <MetricCard label="旧データ引き継ぎ" value={`${pendingLegacyTransfers ?? 0}件`} />
        <MetricCard label="今日のポイント履歴" value={`${pointTransactionsToday ?? 0}件`} />
      </div>

      <section className="grid gap-4 xl:grid-cols-4">
        <ActionCard
          href="/admin/users"
          icon={Users}
          title="ユーザー管理"
          description="ユーザー承認、状態確認、残高や利用状況の確認を行います。"
          bullets={['承認待ちの確認', 'ユーザー状態の確認', '残高の確認']}
        />
        <ActionCard
          href="/admin/points"
          icon={Sparkles}
          title="ポイント管理"
          description="付与率、キャンペーン、手動付与/減算などポイント運用を扱います。"
          bullets={['倍率アップ設定', '手動ポイント付与', '履歴の確認']}
        />
        <ActionCard
          href="/admin/requests"
          icon={MessageSquare}
          title="商品要望"
          description="採用・却下の判断やコメント確認を行います。"
          bullets={['要望の確認', '採用/却下', 'コメント確認']}
        />
        <ActionCard
          href="/admin/legacy"
          icon={ClipboardList}
          title="旧データ移行"
          description="旧システムからの引き継ぎ申請を確認して反映します。"
          bullets={['申請の照合', '旧データの反映', '問い合わせ対応']}
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-4">
          <BotIntroBroadcastCard eligibleCount={pendingBotIntroUsers ?? 0} />
          <Link
            href="/admin/audit"
            className="block rounded-2xl border border-gray-800 bg-gray-900 p-5 hover:bg-gray-800/70"
          >
            <div className="flex items-center gap-2">
              <ScrollText size={18} className="text-gray-300" />
              <h2 className="text-lg font-semibold text-white">監査ログ</h2>
            </div>
            <p className="mt-2 text-sm leading-6 text-gray-400">
              管理操作の履歴を時系列で確認できます。何がいつ行われたか振り返るときに使います。
            </p>
            <div className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-gray-300">
              監査ログを開く
              <ArrowRight size={15} />
            </div>
          </Link>
        </div>

        <div className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
          <h2 className="text-lg font-semibold text-white">迷ったらここを見てください</h2>
          <div className="mt-4 space-y-3 text-sm leading-7 text-gray-300">
            <InfoRow label="メンバー承認や利用状況確認">ユーザー管理</InfoRow>
            <InfoRow label="ポイント制度の調整">ポイント管理</InfoRow>
            <InfoRow label="欲しい商品の意見集約">商品要望</InfoRow>
            <InfoRow label="旧喫茶システムの引き継ぎ">旧データ移行</InfoRow>
            <InfoRow label="いつ何を操作したかを見返す">監査ログ</InfoRow>
          </div>
        </div>
      </section>
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

function ActionCard({
  href,
  icon: Icon,
  title,
  description,
  bullets,
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
  bullets: string[];
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
      <ul className="mt-4 space-y-2 text-sm text-gray-300">
        {bullets.map((bullet) => (
          <li key={bullet} className="flex items-start gap-2">
            <span className="mt-2 h-1.5 w-1.5 rounded-full bg-violet-300" />
            <span>{bullet}</span>
          </li>
        ))}
      </ul>
      <div className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-gray-300">
        この画面を開く
        <ArrowRight size={15} />
      </div>
    </Link>
  );
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-950/60 px-4 py-3">
      <p className="text-xs uppercase tracking-[0.18em] text-gray-500">{label}</p>
      <p className="mt-2 text-sm text-white">{children}</p>
    </div>
  );
}
