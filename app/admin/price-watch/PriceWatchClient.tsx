'use client';

import { useState } from 'react';
import { Plus, Trash2, RefreshCw, ExternalLink } from 'lucide-react';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';
import type { PriceWatch } from '@/types';

const PLATFORM_OPTIONS = [
  { value: 'amazon', label: 'Amazon' },
  { value: 'rakuten', label: '楽天' },
  { value: 'yahoo', label: 'Yahoo!' },
  { value: 'other', label: 'その他' },
];

export default function PriceWatchClient({ watches }: { watches: PriceWatch[] }) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const [form, setForm] = useState({
    item_name: '', url: '', platform: 'amazon', target_price: '',
  });

  const handleAdd = async () => {
    if (!form.item_name || !form.url || !form.target_price) {
      toast.error('すべての項目を入力してください');
      return;
    }
    setLoading('add');
    try {
      const res = await fetch('/api/admin/price-watch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, target_price: Number(form.target_price) }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success('価格監視を追加しました');
      setShowForm(false);
      setForm({ item_name: '', url: '', platform: 'amazon', target_price: '' });
      router.refresh();
    } catch (e: any) { toast.error(e.message); }
    finally { setLoading(null); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('削除しますか？')) return;
    await fetch(`/api/admin/price-watch/${id}`, { method: 'DELETE' });
    toast.success('削除しました');
    router.refresh();
  };

  const handleCheck = async (id: string) => {
    setLoading('check' + id);
    try {
      const res = await fetch(`/api/admin/price-watch/${id}/check`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(`現在価格: ¥${data.current_price?.toLocaleString() ?? '取得失敗'}`);
      router.refresh();
    } catch (e: any) { toast.error(e.message); }
    finally { setLoading(null); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display font-bold text-2xl text-white">価格監視</h1>
          <p className="text-gray-400 text-sm mt-1">目標価格を下回ったらSlackに通知します</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 bg-white text-gray-950 px-4 py-2 rounded-lg font-medium text-sm hover:bg-gray-100 transition-all active:scale-95"
        >
          <Plus size={16} /> 追加
        </button>
      </div>

      {/* 追加フォーム */}
      {showForm && (
        <div className="bg-gray-900 border border-gray-700 rounded-2xl p-5 space-y-4">
          <h2 className="font-medium text-white">新しい監視を追加</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-gray-400">商品名</label>
              <input type="text" placeholder="コカコーラ 500ml" value={form.item_name}
                onChange={e => setForm({ ...form, item_name: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-white/20" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-400">プラットフォーム</label>
              <select value={form.platform} onChange={e => setForm({ ...form, platform: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none">
                {PLATFORM_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className="col-span-2 space-y-1">
              <label className="text-xs text-gray-400">商品URL</label>
              <input type="url" placeholder="https://www.amazon.co.jp/..." value={form.url}
                onChange={e => setForm({ ...form, url: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-white/20" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-400">目標価格（円以下で通知）</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">¥</span>
                <input type="number" placeholder="100" value={form.target_price}
                  onChange={e => setForm({ ...form, target_price: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg pl-7 pr-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-white/20" />
              </div>
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setShowForm(false)}
              className="flex-1 py-2.5 rounded-lg border border-gray-700 text-gray-400 hover:bg-gray-800 text-sm transition-colors">
              キャンセル
            </button>
            <button onClick={handleAdd} disabled={loading === 'add'}
              className="flex-1 py-2.5 rounded-lg bg-white text-gray-950 font-medium text-sm hover:bg-gray-100 disabled:opacity-50 transition-colors">
              {loading === 'add' ? '追加中...' : '追加する'}
            </button>
          </div>
        </div>
      )}

      {/* 監視一覧 */}
      {watches.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <p className="text-4xl mb-3">🔍</p>
          <p>価格監視が設定されていません</p>
        </div>
      ) : (
        <div className="space-y-3">
          {watches.map((w) => (
            <div key={w.id} className={`bg-gray-900 border rounded-2xl p-5 ${
              w.current_price && w.current_price <= w.target_price
                ? 'border-green-500/50'
                : 'border-gray-800'
            }`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-white font-medium">{w.item_name}</p>
                    <span className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded-full">
                      {PLATFORM_OPTIONS.find(p => p.value === w.platform)?.label}
                    </span>
                    {!w.is_active && (
                      <span className="text-xs bg-gray-600/30 text-gray-500 px-2 py-0.5 rounded-full">停止中</span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 mt-2">
                    <div>
                      <p className="text-xs text-gray-500">目標価格</p>
                      <p className="font-mono text-amber-400 font-bold">¥{w.target_price.toLocaleString()}</p>
                    </div>
                    {w.current_price && (
                      <div>
                        <p className="text-xs text-gray-500">現在価格</p>
                        <p className={`font-mono font-bold ${
                          w.current_price <= w.target_price ? 'text-green-400' : 'text-gray-300'
                        }`}>
                          ¥{w.current_price.toLocaleString()}
                          {w.current_price <= w.target_price && ' 🎉'}
                        </p>
                      </div>
                    )}
                  </div>
                  {w.last_checked_at && (
                    <p className="text-xs text-gray-600 mt-1">
                      最終確認: {format(new Date(w.last_checked_at), 'M/d HH:mm', { locale: ja })}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <a href={w.url} target="_blank" rel="noopener noreferrer"
                    className="p-1.5 rounded-lg hover:bg-gray-700 text-gray-500 hover:text-gray-300 transition-colors">
                    <ExternalLink size={15} />
                  </a>
                  <button onClick={() => handleCheck(w.id)} disabled={loading === 'check' + w.id}
                    className="p-1.5 rounded-lg hover:bg-gray-700 text-gray-500 hover:text-blue-400 transition-colors"
                    title="今すぐ確認">
                    {loading === 'check' + w.id ? (
                      <span className="animate-spin w-4 h-4 border border-blue-400 border-t-transparent rounded-full block" />
                    ) : <RefreshCw size={15} />}
                  </button>
                  <button onClick={() => handleDelete(w.id)}
                    className="p-1.5 rounded-lg hover:bg-red-500/20 text-gray-500 hover:text-red-400 transition-colors">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
