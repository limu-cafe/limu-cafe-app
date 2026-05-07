import { createAdminClient } from '@/lib/supabase/server';
import { calculateCashboxBalance } from '@/lib/cashbox';
import {
  buildCashCollectionEntries,
  type DeferredCashCollectionRow,
  type PendingCashOrderRow,
  type PendingSubscriptionCashRow,
} from '@/lib/cash-collection';
import CashboxClient from './CashboxClient';

export const dynamic = 'force-dynamic';

type BalanceRow = {
  amount: number;
  direction: 'in' | 'out';
};

export default async function CashboxPage() {
  const supabase = createAdminClient();

  const [
    { data: balanceRows },
    { data: entries },
    { data: counts },
    { count: pendingCashOrdersCount },
    { data: pendingCashOrders },
    { data: usersWithDeferred },
    { data: pendingSubscriptionCashPayments },
    { data: unreimbursedPurchaseRuns },
  ] = await Promise.all([
    supabase
      .from('cashbox_entries')
      .select('amount, direction'),
    supabase
      .from('cashbox_entries')
      .select('*, created_by_user:users!cashbox_entries_created_by_fkey(name)')
      .order('created_at', { ascending: false })
      .limit(30),
    supabase
      .from('cashbox_counts')
      .select('*, counted_by_user:users!cashbox_counts_counted_by_fkey(name)')
      .order('counted_at', { ascending: false })
      .limit(20),
    supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('payment_method', 'cash')
      .eq('payment_status', 'pending'),
    supabase
      .from('orders')
      .select('total_amount')
      .eq('payment_method', 'cash')
      .eq('payment_status', 'pending'),
    supabase
      .from('users')
      .select('id, name, avatar_url, deferred_balance')
      .gt('deferred_balance', 0)
      .eq('is_active', true),
    supabase
      .from('subscription_payments')
      .select(
        'user_id, cash_due_amount, user:users!subscription_payments_user_id_fkey(id, name, avatar_url)'
      )
      .eq('payment_status', 'pending_cash_settlement')
      .gt('cash_due_amount', 0),
    supabase
      .from('purchase_runs')
      .select('id, total_amount, vendor, note, created_at, created_by_user:users!purchase_runs_created_by_fkey(name), purchase_run_items(item_name, quantity)')
      .eq('reimbursement_status', 'pending_reimbursement')
      .order('created_at', { ascending: false })
      .limit(10),
  ]);

  const expectedAmount = calculateCashboxBalance((balanceRows ?? []) as BalanceRow[]);
  const latestCount = counts?.[0] ?? null;
  const pendingCashOrderAmount = (pendingCashOrders ?? []).reduce(
    (sum: number, order: { total_amount: number }) => sum + order.total_amount,
    0
  );
  const cashCollectionEntries = buildCashCollectionEntries({
    deferredUsers: (usersWithDeferred ?? []) as DeferredCashCollectionRow[],
    pendingCashOrders: ((pendingCashOrders ?? []).map((order: { total_amount: number }) => ({
      ...order,
      user: null,
    })) ?? []) as PendingCashOrderRow[],
    pendingSubscriptionPayments:
      (pendingSubscriptionCashPayments ?? []) as PendingSubscriptionCashRow[],
  });
  const totalCashCollectionAmount = cashCollectionEntries.reduce(
    (sum, entry) => sum + entry.totalAmount,
    0
  );
  const unreimbursedAdvanceAmount = (unreimbursedPurchaseRuns ?? []).reduce(
    (sum: number, purchaseRun: { total_amount: number }) => sum + purchaseRun.total_amount,
    0
  );

  return (
    <CashboxClient
      expectedAmount={expectedAmount}
      pendingCashOrderAmount={pendingCashOrderAmount}
      pendingCashOrdersCount={pendingCashOrdersCount ?? 0}
      totalCashCollectionAmount={totalCashCollectionAmount}
      unreimbursedAdvanceAmount={unreimbursedAdvanceAmount}
      unreimbursedPurchaseRuns={unreimbursedPurchaseRuns ?? []}
      latestCount={latestCount}
      entries={entries ?? []}
      counts={counts ?? []}
    />
  );
}
