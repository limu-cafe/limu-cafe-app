import Link from 'next/link';
import {
  ClipboardList,
  Coins,
  MessageSquare,
  Package,
  Repeat2,
  Receipt,
  ScrollText,
  Users,
  Vault,
  type LucideIcon,
} from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/server';
import { countLowStockItems } from '@/lib/item-stock';
import BotIntroBroadcastCard from './operations/BotIntroBroadcastCard';

export const dynamic = 'force-dynamic';

type BotIntroUser = {
  id: string;
  name: string | null;
};

export default async function AdminDashboard() {
  const supabase = createAdminClient();
  const allowedWorkspaceId = process.env.ALLOWED_SLACK_WORKSPACE_ID?.trim() || null;

  let pendingBotIntroUsersQuery = supabase
    .from('users')
    .select('id, name')
    .eq('is_active', true)
    .not('slack_user_id', 'is', null)
    .is('bot_intro_sent_at', null)
    .order('name', { ascending: true });

  if (allowedWorkspaceId) {
    pendingBotIntroUsersQuery = pendingBotIntroUsersQuery.eq(
      'slack_workspace_id',
      allowedWorkspaceId
    );
  }

  const [
    lowStockCount,
    { count: pendingReimbursements },
    { count: pendingCashOrders },
    { count: pendingCharges },
    { count: pendingSubscriptionCashPayments },
    { count: deferredUsers },
    { count: activeSubscriptions },
    { count: pendingUsers },
    { count: pendingRequests },
    { count: pendingLegacyTransfers },
    { data: pendingBotIntroUsers },
  ] = await Promise.all([
    countLowStockItems(supabase),
    supabase
      .from('purchase_runs')
      .select('*', { count: 'exact', head: true })
      .eq('reimbursement_status', 'pending_reimbursement'),
    supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('payment_method', 'cash')
      .eq('payment_status', 'pending'),
    supabase
      .from('charge_requests')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending'),
    supabase
      .from('subscription_payments')
      .select('*', { count: 'exact', head: true })
      .eq('payment_status', 'pending_cash_settlement'),
    supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .gt('deferred_balance', 0)
      .eq('is_active', true),
    supabase
      .from('user_subscriptions')
      .select('*', { count: 'exact', head: true })
      .in('status', ['active', 'cancel_at_period_end']),
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
    pendingBotIntroUsersQuery,
  ]);

  const cards: Array<{
    href: string;
    icon: LucideIcon;
    title: string;
    count?: number;
  }> = [
    {
      href: '/admin/items',
      icon: Package,
      title: '商品管理',
      count: lowStockCount ?? 0,
    },
    {
      href: '/admin/subscriptions',
      icon: Repeat2,
      title: 'サブスク管理',
      count: activeSubscriptions ?? 0,
    },
    {
      href: '/admin/reimbursements',
      icon: ClipboardList,
      title: '立替管理',
      count: pendingReimbursements ?? 0,
    },
    {
      href: '/admin/transactions',
      icon: Receipt,
      title: '取引履歴',
      count:
        (pendingCashOrders ?? 0) +
        (pendingCharges ?? 0) +
        (pendingSubscriptionCashPayments ?? 0) +
        (deferredUsers ?? 0),
    },
    {
      href: '/admin/cashbox',
      icon: Vault,
      title: '金庫確認',
    },
    {
      href: '/admin/users',
      icon: Users,
      title: 'ユーザー管理',
      count: pendingUsers ?? 0,
    },
    {
      href: '/admin/points',
      icon: Coins,
      title: 'ポイント管理',
    },
    {
      href: '/admin/requests',
      icon: MessageSquare,
      title: '商品要望',
      count: pendingRequests ?? 0,
    },
    {
      href: '/admin/legacy',
      icon: ClipboardList,
      title: '旧データ移行',
      count: pendingLegacyTransfers ?? 0,
    },
    {
      href: '/admin/audit',
      icon: ScrollText,
      title: '監査ログ',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-white">管理トップ</h1>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {cards.map(({ href, icon: Icon, title, count }) => (
          <Link
            key={href}
            href={href}
            className="rounded-2xl border border-gray-800 bg-gray-900 p-4 transition-colors hover:bg-gray-800/70"
          >
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-white">
                <Icon size={16} />
                <span className="font-medium">{title}</span>
              </div>
              {(count ?? 0) > 0 && (
                <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-semibold text-amber-300">
                  {count}
                </span>
              )}
            </div>
          </Link>
        ))}
      </div>

      <BotIntroBroadcastCard
        eligibleCount={(pendingBotIntroUsers ?? []).length}
        eligibleUsers={((pendingBotIntroUsers ?? []) as BotIntroUser[]).map((user) => ({
          id: user.id,
          name: user.name,
        }))}
      />
    </div>
  );
}
