import { createAdminClient } from '@/lib/supabase/server';
import { calculateCashboxBalance } from '@/lib/cashbox';
import CashboxClient from './CashboxClient';

export const dynamic = 'force-dynamic';

export default async function CashboxPage() {
  const supabase = createAdminClient();

  const [
    { data: balanceRows },
    { data: entries },
    { data: counts },
    { data: backfillRuns },
    { count: manualEntryCount },
    { count: pendingCashOrdersCount },
    { data: pendingCashOrders },
    { data: usersWithDeferred },
    { data: pendingCashCharges },
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
      .from('cashbox_backfill_runs')
      .select('*')
      .order('ran_at', { ascending: false })
      .limit(1),
    supabase
      .from('cashbox_entries')
      .select('*', { count: 'exact', head: true })
      .in('entry_type', ['manual_in', 'manual_out']),
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
      .select('deferred_balance')
      .gt('deferred_balance', 0)
      .eq('is_active', true),
    supabase
      .from('charge_requests')
      .select('amount')
      .eq('method', 'cash')
      .eq('status', 'pending'),
  ]);

  const expectedAmount = calculateCashboxBalance((balanceRows ?? []) as { amount: number; direction: 'in' | 'out' }[]);
  const latestCount = counts?.[0] ?? null;
  const latestBackfillRun = backfillRuns?.[0] ?? null;
  const pendingCashOrderAmount = (pendingCashOrders ?? []).reduce(
    (sum: number, order: { total_amount: number }) => sum + order.total_amount,
    0
  );
  const deferredReceivableAmount = (usersWithDeferred ?? []).reduce(
    (sum: number, user: { deferred_balance: number }) => sum + user.deferred_balance,
    0
  );
  const pendingCashChargeAmount = (pendingCashCharges ?? []).reduce(
    (sum: number, request: { amount: number }) => sum + request.amount,
    0
  );
  const projectedAmount = expectedAmount + pendingCashOrderAmount + deferredReceivableAmount;

  return (
    <CashboxClient
      expectedAmount={expectedAmount}
      projectedAmount={projectedAmount}
      pendingCashOrderAmount={pendingCashOrderAmount}
      pendingCashOrdersCount={pendingCashOrdersCount ?? 0}
      deferredReceivableAmount={deferredReceivableAmount}
      pendingCashChargeAmount={pendingCashChargeAmount}
      latestCount={latestCount}
      entries={entries ?? []}
      counts={counts ?? []}
      latestBackfillRun={latestBackfillRun}
      hasLegacyBaseline={Boolean((manualEntryCount ?? 0) > 0)}
    />
  );
}
