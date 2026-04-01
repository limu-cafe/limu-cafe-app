'use client';

import { useState } from 'react';
import { Plus, Archive } from 'lucide-react';
import toast from 'react-hot-toast';
import { useRouter, useSearchParams } from 'next/navigation';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import type { Item } from '@/types';

interface Props { items: Item[]; history: any[]; }

export default function StockClient({ items, history }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<string | null>(null);
  const [pendingOnly, setPendingOnly] = useState(searchParams.get('pending') === '1');

  const handleRestock = async (item: Item) => {
    const qty = Number(quantities[item.id]);
    if (!qty || qty <= 0) { toast.error('数量を入力してください'); return; }
    setLoading(item.id);
    try {
      const res = await fetch('/api/admin/stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id: item.id, quantity: qty, note: '入荷' }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success(`${item.name} の在庫を ${qty} 個追加しました`);
      setQuantities({ ...quantities, [item.id]: '' });
      router.refresh();
    } catch (e: any) { toast.error(e.message); }
    finally { setLoading(null); }
  };

  const stockColor = (item: Item) => {
    if (item.stock === 0) return 'text-red-400';
    if (item.stock <= item.stock_alert_threshold) return 'text-amber-400';
    return 'text-green-400';
  };

  const visibleItems = pendingOnly
    ? items.filter((item) => item.stock <= item.stock_alert_threshold)
    : items;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display font-bold text-2xl text-white">在庫入力</h1>
        <p className="text-gray-400 text-sm mt-1">入荷時に追加する個数を入力してください</p>
      </div>

      <label className="inline-flex items-center gap-2 text-sm text-gray-300">
        <input
          type="checkbox"
          checked={pendingOnly}
          onChange={(e) => setPendingOnly(e.target.checked)}
          className="rounded border-gray-700 bg-gray-900 text-white"
        />
        要対応の在庫だけ表示
      </label>

      {/* 在庫一覧 */}
      <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800">
              {['商品名', '現在の在庫', 'アラート閾値', '追加数量', ''].map(h => (
                <th key={h} className="px-4 py-3 text-left font-medium text-gray-400">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleItems.map((item) => (
              <tr key={item.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span>{item.category?.icon ?? '📦'}</span>
                    <span className="text-white">{item.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className={`font-mono font-bold text-lg ${stockColor(item)}`}>
                    {item.stock}
                  </span>
                  <span className="text-gray-600 text-xs ml-1">個</span>
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">
                  {item.stock_alert_threshold}個以下でアラート
                </td>
                <td className="px-4 py-3 w-32">
                  <input
                    type="number"
                    min={1}
                    placeholder="個数"
                    value={quantities[item.id] ?? ''}
                    onChange={(e) => setQuantities({ ...quantities, [item.id]: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-white/20 text-sm font-mono"
                  />
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => handleRestock(item)}
                    disabled={loading === item.id || !quantities[item.id]}
                    className="flex items-center gap-1.5 px-3 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-40"
                  >
                    {loading === item.id ? (
                      <span className="animate-spin w-3 h-3 border border-white border-t-transparent rounded-full" />
                    ) : (
                      <Plus size={14} />
                    )}
                    追加
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {visibleItems.length === 0 && (
          <div className="py-8 text-center text-sm text-gray-500">該当する商品はありません</div>
        )}
      </div>

      {/* 入荷履歴 */}
      <div className="bg-gray-900 rounded-2xl border border-gray-800 p-5 space-y-4">
        <h2 className="font-medium text-white flex items-center gap-2">
          <Archive size={16} />
          最近の入荷履歴
        </h2>
        {history.length === 0 ? (
          <p className="text-center py-4 text-gray-500 text-sm">履歴なし</p>
        ) : (
          <div className="space-y-2">
            {history.map((h) => (
              <div key={h.id} className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0 text-sm">
                <div>
                  <span className="text-white">{h.item?.name}</span>
                  <span className="text-gray-500 ml-2 text-xs">
                    {format(new Date(h.created_at), 'M/d HH:mm', { locale: ja })}
                  </span>
                </div>
                <span className="text-green-400 font-mono">+{h.change_amount}個</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
