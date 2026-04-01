import UserLayout from '@/components/layout/UserLayout';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Wallet, Clock, ShoppingBag, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import ReorderButton from '@/components/user/ReorderButton';
import LegacyTransferRequestCard from './LegacyTransferRequestCard';

export default async function MyPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [{ data: profile }, { data: orders }, { data: chargeRequests }, { data: favorites }, { data: legacyTransferRequests }] = await Promise.all([
    supabase.from('users').select('*').eq('id', user.id).single(),
    supabase
      .from('orders')
      .select('*, order_items(*, item:items(*, category:categories(*)))')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10),
    supabase
      .from('charge_requests')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('favorite_items')
      .select('item:items(id, name, price, image_url, stock, is_available, stock_alert_threshold, category:categories(*))')
      .eq('user_id', user.id)
      .limit(6),
    supabase
      .from('legacy_transfer_requests')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1),
  ]);

  const paymentMethodLabel: Record<string, string> = {
    balance: '残高払い',
    deferred: '後払い',
    cash: '現金',
    stripe: 'クレカ',
  };

  const statusLabel: Record<string, string> = {
    pending: '処理中',
    completed: '完了',
    cancelled: 'キャンセル',
    refunded: '返金済み',
  };

  return (
    <UserLayout>
      <div className="space-y-6 animate-fade-in">
        {/* ヘッダー */}
        <div className="flex items-center gap-4">
          {profile?.avatar_url ? (
            <img src={profile.avatar_url} alt={profile.name} className="w-14 h-14 rounded-full object-cover" />
          ) : (
            <div className="w-14 h-14 rounded-full bg-espresso flex items-center justify-center text-cream-50 font-display font-bold text-xl">
              {profile?.name?.[0]}
            </div>
          )}
          <div>
            <h1 className="font-display font-bold text-2xl text-espresso">{profile?.name}</h1>
            <p className="text-sm text-espresso-400">{profile?.email}</p>
          </div>
        </div>

        {/* 残高カード */}
        <div className="grid grid-cols-2 gap-4">
          <div className="card bg-espresso text-cream-50 space-y-1">
            <div className="flex items-center gap-2 text-cream-200 text-sm">
              <Wallet size={16} />
              <span>残高</span>
            </div>
            <p className="font-display font-bold text-3xl">
              ¥{profile?.balance?.toLocaleString() ?? 0}
            </p>
            <Link
              href="/charge"
              className="inline-flex items-center gap-1 text-xs text-matcha-light hover:text-matcha transition-colors mt-1"
            >
              チャージする <ChevronRight size={12} />
            </Link>
          </div>
          <div className="card border-amber-cafe/30 space-y-1">
            <div className="flex items-center gap-2 text-espresso-400 text-sm">
              <Clock size={16} />
              <span>後払い残高</span>
            </div>
            <p className="font-display font-bold text-3xl text-espresso">
              ¥{profile?.deferred_balance?.toLocaleString() ?? 0}
            </p>
            <p className="text-xs text-espresso-400">月次精算でお支払い</p>
          </div>
        </div>

        {/* 注文履歴 */}
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-medium text-espresso flex items-center gap-2">
              <ShoppingBag size={18} />
              購入履歴
            </h2>
          </div>

          {!orders || orders.length === 0 ? (
            <p className="text-center py-8 text-espresso-400 text-sm">購入履歴がありません</p>
          ) : (
            <div className="space-y-3">
              {orders.map((order) => (
                <div key={order.id} className="border border-cream-200 rounded-xl p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-espresso-400">
                      {format(new Date(order.created_at), 'M月d日 HH:mm', { locale: ja })}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs bg-cream-100 text-espresso-600 px-2 py-0.5 rounded-full">
                        {paymentMethodLabel[order.payment_method]}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        order.payment_status === 'completed'
                          ? 'bg-green-100 text-green-700'
                          : order.payment_status === 'pending'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-red-100 text-red-700'
                      }`}>
                        {statusLabel[order.payment_status]}
                      </span>
                    </div>
                  </div>
                  <div className="text-sm text-espresso-600">
                    {order.order_items?.map((oi: any) => oi.item_name).join('、')}
                  </div>
                  <div className="flex items-center justify-between">
                    <ReorderButton orderItems={order.order_items ?? []} />
                    <span className="font-display font-bold text-espresso">
                      ¥{order.total_amount.toLocaleString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {favorites && favorites.length > 0 && (
          <div className="card space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-medium text-espresso">お気に入り商品</h2>
              <Link
                href="/"
                className="inline-flex items-center gap-1 text-xs text-espresso-400 transition-colors hover:text-espresso-600"
              >
                商品一覧へ <ChevronRight size={12} />
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {favorites.map((favorite: any) => (
                <div key={favorite.item.id} className="rounded-xl border border-cream-200 p-3">
                  <p className="font-medium text-espresso">{favorite.item.name}</p>
                  <p className="mt-1 text-sm text-espresso-400">
                    ¥{favorite.item.price.toLocaleString()}
                  </p>
                  <p className="mt-2 text-xs text-espresso-400">
                    {favorite.item.is_available && favorite.item.stock > 0
                      ? `在庫 ${favorite.item.stock}個`
                      : '現在は購入不可'}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        <LegacyTransferRequestCard latestRequest={legacyTransferRequests?.[0] ?? null} />

        {/* チャージ申請履歴 */}
        {chargeRequests && chargeRequests.length > 0 && (
          <div className="card space-y-4">
            <h2 className="font-medium text-espresso flex items-center gap-2">
              <Wallet size={18} />
              チャージ履歴
            </h2>
            <div className="space-y-2">
              {chargeRequests.map((req) => (
                <div key={req.id} className="flex items-center justify-between text-sm">
                  <span className="text-espresso-400">
                    {format(new Date(req.created_at), 'M月d日', { locale: ja })}
                    <span className="ml-2 text-xs bg-cream-100 px-2 py-0.5 rounded-full">
                      {req.method === 'cash' ? '現金' : 'クレカ'}
                    </span>
                  </span>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      req.status === 'approved' ? 'bg-green-100 text-green-700' :
                      req.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {req.status === 'approved' ? '承認済み' : req.status === 'pending' ? '申請中' : '却下'}
                    </span>
                    <span className="font-mono font-medium">+¥{req.amount.toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </UserLayout>
  );
}
