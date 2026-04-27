import { createAdminClient } from '@/lib/supabase/server';
import { countLowStockItems } from '@/lib/item-stock';
import AdminAuthGuard from './AdminAuthGuard';
import AdminSidebar from './AdminSidebar';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = createAdminClient();

  const [
    { count: pendingOrders },
    { count: pendingChargeRequests },
    { count: pendingSubscriptionCashPayments },
    { count: pendingUsers },
    { count: pendingRequests },
    { count: pendingLegacyTransfers },
    { count: pendingReimbursements },
    lowStockCount,
    { count: deferredUsers },
  ] = await Promise.all([
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
    supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .gt('deferred_balance', 0)
      .eq('is_active', true),
  ]);

  const notifications = {
    items: lowStockCount ?? 0,
    reimbursements: pendingReimbursements ?? 0,
    transactions:
      (pendingOrders ?? 0) +
      (pendingChargeRequests ?? 0) +
      (pendingSubscriptionCashPayments ?? 0) +
      (deferredUsers ?? 0),
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
