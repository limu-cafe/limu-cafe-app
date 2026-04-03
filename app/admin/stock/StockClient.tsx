'use client';

import { Fragment, useState } from 'react';
import { Plus, Archive, Receipt, Wallet } from 'lucide-react';
import toast from 'react-hot-toast';
import { useRouter, useSearchParams } from 'next/navigation';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import type { Item } from '@/types';

interface Props { items: Item[]; history: any[]; }

type PurchaseDraft = {
  enabled: boolean;
  payment_source: 'cashbox' | 'personal_advance';
  unit_price: string;
  vendor: string;
  note: string;
};

export default function StockClient({ items, history }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [purchaseDrafts, setPurchaseDrafts] = useState<Record<string, PurchaseDraft>>({});
  const [loading, setLoading] = useState<string | null>(null);
  const [pendingOnly, setPendingOnly] = useState(searchParams.get('pending') === '1');

  const getDraft = (itemId: string): PurchaseDraft =>
    purchaseDrafts[itemId] ?? {
      enabled: false,
      payment_source: 'cashbox',
      unit_price: '',
      vendor: '',
      note: '',
    };

  const updateDraft = (itemId: string, patch: Partial<PurchaseDraft>) => {
    setPurchaseDrafts((current) => ({
      ...current,
      [itemId]: {
        ...getDraft(itemId),
        ...patch,
      },
    }));
  };

  const handleRestock = async (item: Item) => {
    const qty = Number(quantities[item.id]);
    if (!qty || qty <= 0) { toast.error('数量を入力してください'); return; }
    const draft = getDraft(item.id);
    if (draft.enabled && draft.unit_price === '') {
      toast.error('仕入れ単価を入力してください');
      return;
    }
    setLoading(item.id);
    try {
      const res = await fetch('/api/admin/stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_id: item.id,
          quantity: qty,
          note: '入荷',
          purchase: draft.enabled
            ? {
                record: true,
                payment_source: draft.payment_source,
                unit_price: Number(draft.unit_price),
                vendor: draft.vendor,
                note: draft.note,
              }
            : null,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success(
        draft.enabled
          ? `${item.name} の入荷と仕入れ記録を保存しました`
          : `${item.name} の在庫を ${qty} 個追加しました`
      );
      setQuantities({ ...quantities, [item.id]: '' });
      setPurchaseDrafts((current) => ({
        ...current,
        [item.id]: {
          enabled: false,
          payment_source: 'cashbox',
          unit_price: '',
          vendor: '',
          note: '',
        },
      }));
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
        <p className="text-gray-400 text-sm mt-1">入荷数に加えて、必要なら仕入れ費用と支払い元もその場で記録できます</p>
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
            {visibleItems.map((item) => {
              const draft = getDraft(item.id);
              const qty = Number(quantities[item.id] ?? 0);
              const subtotal = draft.enabled && draft.unit_price !== ''
                ? Number(draft.unit_price) * qty
                : 0;

              return (
                <Fragment key={item.id}>
                  <tr key={item.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span>{item.category?.icon ?? '📦'}</span>
                        <div>
                          <span className="text-white">{item.name}</span>
                          {draft.enabled && (
                            <p className="mt-1 text-[11px] text-gray-500">仕入れ情報も記録します</p>
                          )}
                        </div>
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
                      <div className="flex items-center gap-2">
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
                        <button
                          type="button"
                          onClick={() => updateDraft(item.id, { enabled: !draft.enabled })}
                          className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                            draft.enabled
                              ? 'bg-amber-500/20 text-amber-300'
                              : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                          }`}
                        >
                          <Receipt size={14} />
                          仕入れ記録
                        </button>
                      </div>
                    </td>
                  </tr>
                  {draft.enabled && (
                    <tr className="border-b border-gray-800/50 bg-gray-950/70">
                      <td colSpan={5} className="px-4 py-4">
                        <div className="grid gap-3 lg:grid-cols-[1.2fr_1fr_1fr]">
                          <div className="space-y-2">
                            <label className="text-xs text-gray-400">店舗・購入先</label>
                            <input
                              type="text"
                              placeholder="例: ドラッグストア / コンビニ"
                              value={draft.vendor}
                              onChange={(e) => updateDraft(item.id, { vendor: e.target.value })}
                              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/20"
                            />
                          </div>

                          <div className="space-y-2">
                            <label className="text-xs text-gray-400">1個あたりの仕入れ額</label>
                            <input
                              type="number"
                              min={0}
                              placeholder="例: 120"
                              value={draft.unit_price}
                              onChange={(e) => updateDraft(item.id, { unit_price: e.target.value })}
                              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm font-mono text-white focus:outline-none focus:ring-2 focus:ring-white/20"
                            />
                          </div>

                          <div className="space-y-2">
                            <label className="text-xs text-gray-400">支払い元</label>
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                type="button"
                                onClick={() => updateDraft(item.id, { payment_source: 'cashbox' })}
                                className={`rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                                  draft.payment_source === 'cashbox'
                                    ? 'bg-emerald-500/20 text-emerald-300'
                                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                                }`}
                              >
                                <Wallet size={12} className="mx-auto mb-1" />
                                金庫
                              </button>
                              <button
                                type="button"
                                onClick={() => updateDraft(item.id, { payment_source: 'personal_advance' })}
                                className={`rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                                  draft.payment_source === 'personal_advance'
                                    ? 'bg-sky-500/20 text-sky-300'
                                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                                }`}
                              >
                                <Receipt size={12} className="mx-auto mb-1" />
                                個人立替
                              </button>
                            </div>
                          </div>
                        </div>

                        <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
                          <div className="space-y-2">
                            <label className="text-xs text-gray-400">メモ</label>
                            <input
                              type="text"
                              placeholder="例: 金庫から支出 / 自腹で購入"
                              value={draft.note}
                              onChange={(e) => updateDraft(item.id, { note: e.target.value })}
                              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/20"
                            />
                          </div>
                          <div className="rounded-xl border border-gray-800 bg-gray-900 px-4 py-3">
                            <p className="text-xs text-gray-400">仕入れ合計</p>
                            <p className="mt-1 font-mono text-lg font-bold text-white">
                              ¥{subtotal.toLocaleString()}
                            </p>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
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
