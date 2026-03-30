'use client';

import { useState } from 'react';
import { Plus, Trash2, RefreshCw, ExternalLink } from 'lucide-react';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import toast from 'react-hot-toast';
import type { PriceWatch } from '@/types';

const PLATFORM_OPTIONS = [
  { value: 'amazon', label: 'Amazon' },
  { value: 'rakuten', label: '楽天' },
  { value: 'yahoo', label: 'Yahoo!' },
  { value: 'other', label: 'その他' },
];

export default function PriceWatchClient({ watches }: { watches: PriceWatch[] }) {
  const [form, setForm] = useState({
    item_name: '', url: '', platform: 'amazon', target_price: '',
  });

  const notifyComingSoon = () => {
    toast('価格監視機能は現在開発中です');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display font-bold text-2xl text-white">価格監視</h1>
          <p className="text-gray-400 text-sm mt-1">Keepa 連携による自動価格チェックは現在開発中です</p>
        </div>
        <button
          onClick={notifyComingSoon}
          className="flex items-center gap-2 rounded-lg bg-white/80 px-4 py-2 text-sm font-medium text-gray-950 opacity-80"
        >
          <Plus size={16} /> 追加予定
        </button>
      </div>

      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-amber-200">現在開発中</p>
            <p className="mt-1 text-sm text-amber-100/80">
              Amazon の価格自動取得と Slack 通知は、Keepa 利用方針の整理後に有効化予定です。
            </p>
          </div>
          <span className="rounded-full bg-amber-200/15 px-2 py-1 text-xs font-medium text-amber-200">
            Coming Soon
          </span>
        </div>
      </div>

      {/* 追加フォームの枠だけ表示 */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-4 opacity-70">
        <h2 className="font-medium text-white">新しい監視を追加</h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs text-gray-400">商品名</label>
            <input type="text" placeholder="コカコーラ 500ml" value={form.item_name}
              onChange={e => setForm({ ...form, item_name: e.target.value })}
              className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none"
              disabled />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-gray-400">プラットフォーム</label>
            <select value={form.platform} onChange={e => setForm({ ...form, platform: e.target.value })}
              className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none"
              disabled>
              {PLATFORM_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="col-span-2 space-y-1">
            <label className="text-xs text-gray-400">商品URL</label>
            <input type="url" placeholder="https://www.amazon.co.jp/..." value={form.url}
              onChange={e => setForm({ ...form, url: e.target.value })}
              className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none"
              disabled />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-gray-400">目標価格（円以下で通知）</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">¥</span>
              <input type="number" placeholder="100" value={form.target_price}
                onChange={e => setForm({ ...form, target_price: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg pl-7 pr-3 py-2 text-sm font-mono focus:outline-none"
                disabled />
            </div>
          </div>
        </div>
        <button
          onClick={notifyComingSoon}
          className="w-full rounded-lg border border-dashed border-gray-600 py-2.5 text-sm font-medium text-gray-400"
        >
          価格監視の追加は準備中です
        </button>
      </div>

      {/* 監視一覧 */}
      {watches.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <p className="text-4xl mb-3">🔍</p>
          <p>価格監視の正式導入はこれからです</p>
        </div>
      ) : (
        <div className="space-y-3">
          {watches.map((w) => (
            <div key={w.id} className="bg-gray-900 border border-gray-800 rounded-2xl p-5 opacity-75">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-white font-medium">{w.item_name}</p>
                    <span className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded-full">
                      {PLATFORM_OPTIONS.find(p => p.value === w.platform)?.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 mt-2">
                    <div>
                      <p className="text-xs text-gray-500">目標価格</p>
                      <p className="font-mono text-amber-400 font-bold">¥{w.target_price.toLocaleString()}</p>
                    </div>
                    {w.current_price && (
                      <div>
                        <p className="text-xs text-gray-500">現在価格</p>
                        <p className="font-mono font-bold text-gray-300">
                          ¥{w.current_price.toLocaleString()}
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
                  <button
                    onClick={notifyComingSoon}
                    className="p-1.5 rounded-lg text-gray-500"
                    title="今すぐ確認"
                  >
                    <RefreshCw size={15} />
                  </button>
                  <button
                    onClick={notifyComingSoon}
                    className="p-1.5 rounded-lg text-gray-500"
                  >
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
