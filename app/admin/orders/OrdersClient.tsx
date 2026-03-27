'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { CheckCircle, ChevronDown, ChevronUp } from 'lucide-react';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';

const METHOD_LABEL: Record<string, string> = {
  balance: '残高', deferred: '後払い', cash: '現金', stripe: 'クレカ',
};
const STATUS_LABEL: Record<string, string> = {
  pending: '処理中', completed: '完了', cancelled: 'キャンセル', refunded: '返金済み',
};
const STATUS_COLOR: Record<string, string> = {
  pending: 'bg-amber-500/20 text-amber-400',
  completed: 'bg-green-500/20 text-green-400',
  cancelled: 'bg-gray-500/20 text-gray-400',
  refunded: 'bg-red-500/20 text-red-400',
};

export default function OrdersClient({ orders }: { orders: any[] }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all');
  const [loading, setLoading] = useState<string | null>(null);

  const filtered = orders.filter(o => {
    if (filter === 'cash_pending') return o.payment_method === 'cash' && o.payment_status === 'pending';
    if (filter === 'deferred') return o.payment_method === 'deferred';
    return true;
  });

  const handleConfirmCash = async (orderId: string) => {
    setLoading(orderId);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/confirm-cash`, { method: 'POST' });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success('現金受け取りを確認しました');
      router.refresh();
    } catch (e: any) { toast.error(e.message); }
    finally { setLoading(null); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display font-bold text-2xl text-white">注文一覧</h1>
        <p className="text-gray-400 text-sm mt-1">{orders.length}件の注文</p>
      </div>

      {/* フィルタ */}
      <div className="flex gap-2">
        {[
          { id: 'all', label: 'すべて' },
          { id: 'cash_pending', label: '現金 承認待ち' },
          { id: 'deferred', label: '後払い' },
        ].map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setFilter(id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              filter === id
                ? 'bg-white text-gray-950'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 注文テーブル */}
      <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-500">該当する注文がありません</div>
        ) : (
          <div className="divide-y divide-gray-800">
            {filtered.map((order) => (
              <div key={order.id}>
                <div
                  className="flex items-center gap-4 px-5 py-4 hover:bg-gray-800/40 cursor-pointer transition-colors"
                  onClick={() => setExpanded(expanded === order.id ? null : order.id)}
                >
                  {/* ユーザー */}
                  <div className="flex items-center gap-2 w-32 flex-shrink-0">
                    {order.user?.avatar_url ? (
                      <img src={order.user.avatar_url} className="w-7 h-7 rounded-full" alt="" />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-gray-700 flex items-center justify-center text-xs text-gray-300">
                        {order.user?.name?.[0]}
                      </div>
                    )}
                    <span className="text-white text-sm truncate">{order.user?.name}</span>
                  </div>

                  {/* 日時 */}
                  <span className="text-gray-400 text-xs w-24 flex-shrink-0">
                    {format(new Date(order.created_at), 'M/d HH:mm', { locale: ja })}
                  </span>

                  {/* 支払い方法 */}
                  <span className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded-full flex-shrink-0">
                    {METHOD_LABEL[order.payment_method]}
                  </span>

                  {/* ステータス */}
                  <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${STATUS_COLOR[order.payment_status]}`}>
                    {STATUS_LABEL[order.payment_status]}
                  </span>

                  {/* 金額 */}
                  <span className="font-mono text-white ml-auto flex-shrink-0">
                    ¥{order.total_amount.toLocaleString()}
                  </span>

                  {/* 展開アイコン */}
                  <span className="text-gray-500 flex-shrink-0">
                    {expanded === order.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </span>
                </div>

                {/* 展開: 明細 + 承認ボタン */}
                {expanded === order.id && (
                  <div className="px-5 pb-4 bg-gray-800/30 space-y-3">
                    <div className="space-y-1 pt-2">
                      {order.order_items?.map((oi: any, i: number) => (
                        <div key={i} className="flex justify-between text-sm">
                          <span className="text-gray-300">
                            {oi.item_name}
                            <span className="text-gray-500 ml-1">× {oi.quantity}</span>
                          </span>
                          <span className="font-mono text-gray-300">¥{oi.subtotal.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>

                    {order.payment_method === 'cash' && order.payment_status === 'pending' && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleConfirmCash(order.id); }}
                        disabled={loading === order.id}
                        className="flex items-center gap-2 px-4 py-2 bg-green-500/20 text-green-400 hover:bg-green-500/30 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                      >
                        {loading === order.id ? (
                          <span className="animate-spin w-4 h-4 border border-green-400 border-t-transparent rounded-full" />
                        ) : (
                          <CheckCircle size={16} />
                        )}
                        現金受け取りを確認
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
