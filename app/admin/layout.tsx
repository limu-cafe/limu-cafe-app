import { createAdminClient } from '@/lib/supabase/server';
import type { CashChargeSummary } from '@/lib/charge-settlement';
import { countLowStockItems } from '@/lib/item-stock';
import AdminAuthGuard from './AdminAuthGuard';
import AdminSidebar from './AdminSidebar';

export const dynamic = 'force-dynamic';

type LayoutChargeRow = CashChargeSummary & {
  settled_at?: string | null;
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = createAdminClient();

  const [
    { data: pendingDeferredOrders },
    { count: pendingOrders },
    { count: pendingChargeRequests },
    { data: approvedCashCharges },
    { count: pendingSubscriptionCashPayments },
    { count: pendingUsers },
    { count: pendingRequests },
    { count: pendingLegacyTransfers },
    { count: pendingReimbursements },
    lowStockCount,
  ] = await Promise.all([
    supabase
      .from('orders')
      .select('id, deferred_settlement_method, settled_at')
      .eq('payment_method', 'deferred')
      .eq('payment_status', 'completed')
      .or('deferred_settlement_method.is.null,deferred_settlement_method.eq.cash'),
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
      .from('purchase_runs')
      .select('*', { count: 'exact', head: true })
      .eq('reimbursement_status', 'pending_reimbursement'),
    countLowStockItems(supabase),
  ]);

  const pendingCashChargeCount = ((approvedCashCharges ?? []) as LayoutChargeRow[]).filter(
    (charge) => !charge.settled_at
  ).length;
  const pendingDeferredOrderCount = ((pendingDeferredOrders ?? []) as Array<{
    deferred_settlement_method?: string | null;
    settled_at?: string | null;
  }>).filter((order) => (order.deferred_settlement_method ?? 'cash') === 'cash' && !order.settled_at).length;

  const notifications = {
    items: lowStockCount ?? 0,
    reimbursements: pendingReimbursements ?? 0,
    transactions:
      pendingDeferredOrderCount +
      (pendingOrders ?? 0) +
      pendingCashChargeCount +
      (pendingChargeRequests ?? 0) +
      (pendingSubscriptionCashPayments ?? 0),
    users: pendingUsers ?? 0,
    points: 0,
    requests: pendingRequests ?? 0,
    legacy: pendingLegacyTransfers ?? 0,
  };

  return (
    <AdminAuthGuard>
      <div className="flex h-screen overflow-hidden bg-gray-950">
        <AdminSidebar notifications={notifications} />
        <main className="h-screen flex-1 overflow-y-auto">
          <div className="mx-auto max-w-7xl p-6">
            {children}
          </div>
        </main>
      </div>
    </AdminAuthGuard>
  );
}
