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
import type { CashChargeSummary } from '@/lib/charge-settlement';
import { countLowStockItems } from '@/lib/item-stock';
import {
  buildCashCollectionEntries,
  describeCashCollectionBreakdown,
  type DeferredCashCollectionRow,
  type PendingCashOrderRow,
  type PendingSubscriptionCashRow,
} from '@/lib/cash-collection';
import BotIntroBroadcastCard from './operations/BotIntroBroadcastCard';

export const dynamic = 'force-dynamic';

type BotIntroUser = {
  id: string;
  name: string | null;
};

type DashboardChargeRow = CashChargeSummary & {
  settled_at?: string | null;
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
    { data: pendingDeferredOrders },
    { count: pendingCashOrders },
    { count: pendingCharges },
    { data: approvedCashCharges },
    { count: pendingSubscriptionCashPayments },
    { data: deferredUsersForCollection },
    { data: pendingCashOrdersForCollection },
    { data: pendingSubscriptionCashForCollection },
    { count: activeSubscriptions },
    { count: pendingUsers },
    { count: pendingRequests },
    { count: pendingLegacyTransfers },
    { data: pendingBotIntroUsers },
  ] = await Promise.all([
    countLowStockItems(supabase),
    supabase
      .from('orders')
      .select('id, deferred_settlement_method, settled_at')
      .eq('payment_method', 'deferred')
      .eq('payment_status', 'completed')
      .or('deferred_settlement_method.is.null,deferred_settlement_method.eq.cash'),
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
      .from('charge_requests')
      .select('id, method, status, settled_at')
      .eq('method', 'cash')
      .eq('status', 'approved'),
    supabase
      .from('subscription_payments')
      .select('*', { count: 'exact', head: true })
      .eq('payment_status', 'pending_cash_settlement'),
    supabase
      .from('users')
      .select('id, name, avatar_url, deferred_balance')
      .gt('deferred_balance', 0)
      .eq('is_active', true),
    supabase
      .from('orders')
      .select('user_id, total_amount, user:users!orders_user_id_fkey(id, name, avatar_url)')
      .eq('payment_method', 'cash')
      .eq('payment_status', 'pending'),
    supabase
      .from('subscription_payments')
      .select(
        'user_id, cash_due_amount, user:users!subscription_payments_user_id_fkey(id, name, avatar_url)'
      )
      .eq('payment_status', 'pending_cash_settlement')
      .gt('cash_due_amount', 0),
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

  const pendingCashChargeCount = ((approvedCashCharges ?? []) as DashboardChargeRow[]).filter(
    (charge) => !charge.settled_at
  ).length;
  const pendingDeferredOrderCount = ((pendingDeferredOrders ?? []) as Array<{
    deferred_settlement_method?: string | null;
    settled_at?: string | null;
  }>).filter((order) => (order.deferred_settlement_method ?? 'cash') === 'cash' && !order.settled_at).length;

  const cashCollectionEntries = buildCashCollectionEntries({
    deferredUsers: (deferredUsersForCollection ?? []) as DeferredCashCollectionRow[],
    pendingCashOrders: (pendingCashOrdersForCollection ?? []) as PendingCashOrderRow[],
    pendingSubscriptionPayments:
      (pendingSubscriptionCashForCollection ?? []) as PendingSubscriptionCashRow[],
  });

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
        pendingDeferredOrderCount +
        (pendingCashOrders ?? 0) +
        pendingCashChargeCount +
        (pendingCharges ?? 0) +
        (pendingSubscriptionCashPayments ?? 0),
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

      <section className="rounded-2xl border border-gray-800 bg-gray-900">
        <div className="flex items-center justify-between border-b border-gray-800 px-5 py-4">
          <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-gray-400">
            要回収一覧
          </h2>
          <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-semibold text-amber-300">
            {cashCollectionEntries.length}人
          </span>
        </div>
        {cashCollectionEntries.length === 0 ? (
          <div className="px-5 py-8 text-sm text-gray-500">要回収のユーザーはいません</div>
        ) : (
          <div className="divide-y divide-gray-800">
            {cashCollectionEntries.map((entry) => (
              <Link
                key={entry.userId}
                href="/admin/users"
                className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-gray-800/40"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-white">{entry.name}</p>
                  <p className="truncate text-xs text-gray-500">
                    {describeCashCollectionBreakdown(entry)}
                  </p>
                </div>
                <p className="font-mono text-sm font-semibold text-amber-300">
                  ¥{entry.totalAmount.toLocaleString()}
                </p>
              </Link>
            ))}
          </div>
        )}
      </section>

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
