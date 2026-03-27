import { createClient } from '@/lib/supabase/server';
import { ShoppingBag, Users, AlertTriangle, Wallet, TrendingUp, Clock } from 'lucide-react';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { ja } from 'date-fns/locale';
import Link from 'next/link';

export default async function AdminDashboard() {
  const supabase = await createClient();
  const now = new Date();
  const monthStart = startOfMonth(now).toISOString();
  const monthEnd = endOfMonth(now).toISOString();

  const [
    { count: pendingOrders },
    { count: pendingCharges },
    { count: pendingUsers },
    { data: lowStockItems },
    { data: recentOrders },
    { data: monthlyOrders },
  ] = await Promise.all([
    supabase.from('orders').select('*', { count: 'exact', head: true })
      .eq('payment_status', 'pending').eq('payment_method', 'cash'),
    supabase.from('charge_requests').select('*', { count: 'exact', head: true })
      .eq('status', 'pending'),
    supabase.from('users').select('*', { count: 'exact', head: true })
      .eq('is_approved', false),
    supabase.from('items').select('*')
      .eq('is_available', true)
      .filter('stock', 'lte', 'stock_alert_threshold'),
    supabase.from('orders')
      .select('*, user:users(name), order_items(item_name, quantity, subtotal)')
      .order('created_at', { ascending: false })
      .limit(5),
    supabase.from('orders')
      .select('total_amount, payment_method')
      .gte('created_at', monthStart)
      .lte('created_at', monthEnd)
      .eq('payment_status', 'completed'),
  ]);

  const monthlyRevenue = monthlyOrders?.reduce((sum, o) => sum + o.total_amount, 0) ?? 0;

  const stats = [
    { label: '今月の売上', value: `¥${monthlyRevenue.toLocaleString()}`, icon: TrendingUp, color: 'text-green-400', bg: 'bg-green-400/10' },
    { label: '現金承認待ち', value: `${pendingOrders ?? 0}件`, icon: Wallet, color: 'text-amber-400', bg: 'bg-amber-400/10', href: '/admin/orders' },
    { label: 'チャージ承認待ち', value: `${pendingCharges ?? 0}件`, icon: Clock, color: 'text-blue-400', bg: 'bg-blue-400/10', href: '/admin/charge' },
    { label: '承認待ちユーザー', value: `${pendingUsers ?? 0}人`, icon: Users, color: 'text-purple-400', bg: 'bg-purple-400/10', href: '/admin/users' },
  ];

  const paymentMethodLabel: Record<string, string> = {
    balance: '残高', deferred: '後払い', cash: '現金', stripe: 'クレカ',
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="font-display font-bold text-2xl text-white">ダッシュボード</h1>
        <p className="text-gray-400 text-sm mt-1">
          {format(now, 'M月d日（E）', { locale: ja })}
        </p>
      </div>

      {/* サマリーカード */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(({ label, value, icon: Icon, color, bg, href }) => (
          <div key={label} className={href ? 'cursor-pointer' : ''}>
            {href ? (
              <Link href={href} className="block bg-gray-900 rounded-2xl border border-gray-800 p-5 hover:border-gray-600 transition-colors">
                <div className={`w-10 h-10 ${bg} rounded-xl flex items-center justify-center mb-3`}>
                  <Icon size={20} className={color} />
                </div>
                <p className="text-gray-400 text-xs mb-1">{label}</p>
                <p className={`font-display font-bold text-2xl ${color}`}>{value}</p>
              </Link>
            ) : (
              <div className="bg-gray-900 rounded-2xl border border-gray-800 p-5">
                <div className={`w-10 h-10 ${bg} rounded-xl flex items-center justify-center mb-3`}>
                  <Icon size={20} className={color} />
                </div>
                <p className="text-gray-400 text-xs mb-1">{label}</p>
                <p className={`font-display font-bold text-2xl ${color}`}>{value}</p>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* 最近の注文 */}
        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-medium text-white flex items-center gap-2">
              <ShoppingBag size={16} />
              最近の注文
            </h2>
            <Link href="/admin/orders" className="text-xs text-gray-400 hover:text-white transition-colors">
              すべて見る →
            </Link>
          </div>
          {!recentOrders || recentOrders.length === 0 ? (
            <p className="text-center py-6 text-gray-500 text-sm">注文なし</p>
          ) : (
            <div className="space-y-2">
              {recentOrders.map((order) => (
                <div key={order.id} className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
                  <div>
                    <p className="text-sm text-white">{(order.user as any)?.name}</p>
                    <p className="text-xs text-gray-500">
                      {order.order_items?.map((i: any) => i.item_name).join('、')}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-mono text-white">¥{order.total_amount.toLocaleString()}</p>
                    <p className="text-xs text-gray-500">{paymentMethodLabel[order.payment_method]}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 在庫アラート */}
        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-medium text-white flex items-center gap-2">
              <AlertTriangle size={16} className="text-amber-400" />
              在庫アラート
            </h2>
            <Link href="/admin/stock" className="text-xs text-gray-400 hover:text-white transition-colors">
              在庫入力 →
            </Link>
          </div>
          {!lowStockItems || lowStockItems.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-green-400 text-sm">✓ すべての在庫は十分です</p>
            </div>
          ) : (
            <div className="space-y-2">
              {lowStockItems.map((item) => (
                <div key={item.id} className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
                  <p className="text-sm text-white">{item.name}</p>
                  <div className="flex items-center gap-2">
                    <div className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      item.stock === 0 ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/20 text-amber-400'
                    }`}>
                      {item.stock === 0 ? '在庫切れ' : `残り${item.stock}個`}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
