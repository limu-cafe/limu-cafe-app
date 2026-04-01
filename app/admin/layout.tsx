import { createAdminClient } from '@/lib/supabase/server';
import AdminAuthGuard from './AdminAuthGuard';
import AdminSidebar from './AdminSidebar';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = createAdminClient();

  const [
    { count: pendingOrders },
    { count: pendingCharges },
    { count: pendingUsers },
    { count: pendingRequests },
    { data: lowStockItems },
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
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('is_approved', false)
      .eq('is_active', true),
    supabase
      .from('item_requests')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending'),
    supabase
      .from('items')
      .select('id')
      .eq('is_available', true)
      .filter('stock', 'lte', 'stock_alert_threshold'),
  ]);

  const notifications = {
    stock: lowStockItems?.length ?? 0,
    orders: pendingOrders ?? 0,
    charge: pendingCharges ?? 0,
    users: pendingUsers ?? 0,
    requests: pendingRequests ?? 0,
  };

  return (
    <AdminAuthGuard>
      <div className="min-h-screen flex bg-gray-950">
        <AdminSidebar notifications={notifications} />
        <main className="flex-1 overflow-auto">
          <div className="p-6 max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </AdminAuthGuard>
  );
}
