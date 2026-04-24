import { createAdminClient } from '@/lib/supabase/server';
import AdminAuthGuard from './AdminAuthGuard';
import AdminSidebar from './AdminSidebar';

export const dynamic = 'force-dynamic';

type ChargeCashboxEntry = {
  charge_request_id: string | null;
};

type ChargeIdRow = {
  id: string;
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = createAdminClient();

  const [
    { count: pendingOrders },
    { count: pendingChargeRequests },
    { data: approvedCashCharges },
    { data: chargeCashboxEntries },
    { count: pendingUsers },
    { count: pendingRequests },
    { count: pendingLegacyTransfers },
    { count: pendingReimbursements },
    { data: lowStockItems },
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
      .from('charge_requests')
      .select('id')
      .eq('status', 'approved')
      .eq('method', 'cash'),
    supabase.from('cashbox_entries').select('charge_request_id').not('charge_request_id', 'is', null),
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
    supabase
      .from('items')
      .select('id')
      .eq('is_available', true)
      .filter('stock', 'lte', 'stock_alert_threshold'),
    supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .gt('deferred_balance', 0)
      .eq('is_active', true),
  ]);

  const settledChargeIds = new Set(
    ((chargeCashboxEntries ?? []) as ChargeCashboxEntry[])
      .map((entry: ChargeCashboxEntry) => entry.charge_request_id)
      .filter((value): value is string => Boolean(value))
  );
  const unsettledCashCharges =
    ((approvedCashCharges ?? []) as ChargeIdRow[]).filter(
      (charge: ChargeIdRow) => !settledChargeIds.has(charge.id)
    ).length ?? 0;

  const notifications = {
    items: lowStockItems?.length ?? 0,
    reimbursements: pendingReimbursements ?? 0,
    transactions:
      (pendingOrders ?? 0) +
      (pendingChargeRequests ?? 0) +
      unsettledCashCharges +
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
