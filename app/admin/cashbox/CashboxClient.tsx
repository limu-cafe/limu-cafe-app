'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { ArrowDownLeft, ArrowUpRight, Calculator, Scale, Wallet } from 'lucide-react';
import toast from 'react-hot-toast';
import { cashboxEntryLabels } from '@/lib/cashbox';

type Entry = {
  id: string;
  entry_type: keyof typeof cashboxEntryLabels;
  direction: 'in' | 'out';
  amount: number;
  note: string | null;
  created_at: string;
  created_by_user?: { name?: string | null } | null;
};

type Count = {
  id: string;
  actual_amount: number;
  expected_amount: number;
  difference_amount: number;
  note: string | null;
  counted_at: string;
  counted_by_user?: { name?: string | null } | null;
};

type BackfillRun = {
  id: string;
  inserted_orders: number;
  inserted_charges: number;
  inserted_settlements: number;
  note: string | null;
  ran_at: string;
};

export default function CashboxClient({
  expectedAmount,
  latestCount,
  entries,
  counts,
  latestBackfillRun,
  hasLegacyBaseline,
}: {
  expectedAmount: number;
  latestCount: Count | null;
  entries: Entry[];
  counts: Count[];
  latestBackfillRun: BackfillRun | null;
  hasLegacyBaseline: boolean;
}) {
  const router = useRouter();
  const [adjustmentAmount, setAdjustmentAmount] = useState<number | ''>('');
  const [adjustmentNote, setAdjustmentNote] = useState('');
  const [adjustmentDirection, setAdjustmentDirection] = useState<'in' | 'out'>('in');
  const [actualAmount, setActualAmount] = useState<number | ''>('');
  const [countNote, setCountNote] = useState('');
  const [loading, setLoading] = useState<'adjustment' | 'count' | null>(null);

  const latestDifference = latestCount?.difference_amount ?? 0;

  const handleAdjustment = async () => {
    if (!adjustmentAmount || adjustmentAmount <= 0) {
      toast.error('金額を入力してください');
      return;
    }

    setLoading('adjustment');
    try {
      const res = await fetch('/api/admin/cashbox/adjustments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: adjustmentAmount,
          direction: adjustmentDirection,
          note: adjustmentNote,
        }),
      });

      if (!res.ok) {
        throw new Error((await res.json()).error);
      }

      toast.success('金庫台帳を更新しました');
      setAdjustmentAmount('');
      setAdjustmentNote('');
      router.refresh();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(null);
    }
  };

  const handleCount = async () => {
    if (actualAmount === '' || actualAmount < 0) {
      toast.error('実測金額を入力してください');
      return;
    }

    setLoading('count');
    try {
      const res = await fetch('/api/admin/cashbox/counts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actual_amount: actualAmount,
          note: countNote,
        }),
      });

      if (!res.ok) {
        throw new Error((await res.json()).error);
      }

      toast.success('金庫確認を記録しました');
      setActualAmount('');
      setCountNote('');
      router.refresh();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display font-bold text-2xl text-white">金庫管理</h1>
        <p className="text-gray-400 text-sm mt-1">
          現システムの現金履歴と手動調整を合算した理論残高を、実際の金庫内現金と照らし合わせて管理します
        </p>
      </div>

      <div className="grid gap-3">
        {latestBackfillRun ? (
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-5 py-4 text-sm text-emerald-100">
            <p className="font-medium">現システム内の過去現金履歴はバックフィル済みです</p>
            <p className="mt-1 text-emerald-200/80">
              {format(new Date(latestBackfillRun.ran_at), 'yyyy/M/d HH:mm', { locale: ja })} 実行
              ・ 注文 {latestBackfillRun.inserted_orders}件
              ・ チャージ {latestBackfillRun.inserted_charges}件
              ・ 精算 {latestBackfillRun.inserted_settlements}件
            </p>
          </div>
        ) : (
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-5 py-4 text-sm text-amber-100">
            <p className="font-medium">まだ現システム分のバックフィルが実行されていません</p>
            <p className="mt-1 text-amber-200/80">
              <code className="rounded bg-black/20 px-1.5 py-0.5 text-xs">
                supabase/migrations/004_cashbox_backfill.sql
              </code>{' '}
              を SQL Editor で1回実行してください。
            </p>
          </div>
        )}

        {!hasLegacyBaseline && (
          <div className="rounded-2xl border border-sky-500/20 bg-sky-500/10 px-5 py-4 text-sm text-sky-100">
            <p className="font-medium">旧システム分の初期残高はまだ入力されていません</p>
            <p className="mt-1 text-sky-200/80">
              旧システムから引き継ぐ現金がある場合は、下の「手動調整」から1件の初期値として入力してください。
            </p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-5">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center mb-3">
            <Calculator size={20} className="text-emerald-400" />
          </div>
          <p className="text-gray-400 text-xs mb-1">計算上の金庫残高</p>
          <p className="font-display font-bold text-2xl text-emerald-400">
            ¥{expectedAmount.toLocaleString()}
          </p>
        </div>

        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-5">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center mb-3">
            <Wallet size={20} className="text-blue-400" />
          </div>
          <p className="text-gray-400 text-xs mb-1">最新の実測金額</p>
          <p className="font-display font-bold text-2xl text-blue-400">
            ¥{(latestCount?.actual_amount ?? 0).toLocaleString()}
          </p>
        </div>

        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-5">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center mb-3">
            <Scale size={20} className="text-amber-400" />
          </div>
          <p className="text-gray-400 text-xs mb-1">最新差額</p>
          <p className={`font-display font-bold text-2xl ${latestDifference === 0 ? 'text-green-400' : latestDifference > 0 ? 'text-sky-400' : 'text-red-400'}`}>
            {latestDifference > 0 ? '+' : ''}¥{latestDifference.toLocaleString()}
          </p>
        </div>
      </div>

      <div className="grid xl:grid-cols-2 gap-6">
        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-5 space-y-4">
          <div>
            <h2 className="font-medium text-white">手動調整</h2>
            <p className="text-sm text-gray-400 mt-1">
              金庫への入金・出金があった場合に台帳へ記録します
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setAdjustmentDirection('in')}
              className={`rounded-xl px-4 py-3 text-sm font-medium transition-colors ${
                adjustmentDirection === 'in'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'bg-gray-800 text-gray-300 border border-gray-700'
              }`}
            >
              入金
            </button>
            <button
              onClick={() => setAdjustmentDirection('out')}
              className={`rounded-xl px-4 py-3 text-sm font-medium transition-colors ${
                adjustmentDirection === 'out'
                  ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                  : 'bg-gray-800 text-gray-300 border border-gray-700'
              }`}
            >
              出金
            </button>
          </div>

          <input
            type="number"
            min={1}
            value={adjustmentAmount}
            onChange={(e) => setAdjustmentAmount(e.target.value ? Number(e.target.value) : '')}
            placeholder="金額"
            className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-white/20"
          />
          <textarea
            value={adjustmentNote}
            onChange={(e) => setAdjustmentNote(e.target.value)}
            placeholder="メモ（例: 金庫からつり銭を補充）"
            rows={3}
            className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-white/20 resize-none"
          />
          <button
            onClick={handleAdjustment}
            disabled={loading !== null}
            className="w-full bg-white text-gray-950 py-3 rounded-lg font-medium hover:bg-gray-100 transition-all disabled:opacity-50"
          >
            {loading === 'adjustment' ? '記録中...' : '台帳に記録する'}
          </button>
        </div>

        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-5 space-y-4">
          <div>
            <h2 className="font-medium text-white">金庫確認</h2>
            <p className="text-sm text-gray-400 mt-1">
              実際に金庫内を数えて、理論残高との差を残します
            </p>
          </div>

          <input
            type="number"
            min={0}
            value={actualAmount}
            onChange={(e) => setActualAmount(e.target.value ? Number(e.target.value) : '')}
            placeholder="実測金額"
            className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-white/20"
          />
          <textarea
            value={countNote}
            onChange={(e) => setCountNote(e.target.value)}
            placeholder="メモ（例: 月末確認、つり銭補充前）"
            rows={3}
            className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-white/20 resize-none"
          />
          <button
            onClick={handleCount}
            disabled={loading !== null}
            className="w-full bg-blue-500/20 text-blue-300 py-3 rounded-lg font-medium hover:bg-blue-500/30 transition-all disabled:opacity-50"
          >
            {loading === 'count' ? '記録中...' : '確認結果を保存する'}
          </button>
        </div>
      </div>

      <div className="grid xl:grid-cols-2 gap-6">
        <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-800">
            <h2 className="font-medium text-white">金庫台帳</h2>
          </div>
          {entries.length === 0 ? (
            <p className="px-5 py-10 text-sm text-gray-500 text-center">記録はまだありません</p>
          ) : (
            <div className="divide-y divide-gray-800">
              {entries.map((entry) => (
                <div key={entry.id} className="px-5 py-4 flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {entry.direction === 'in' ? (
                        <ArrowUpRight size={16} className="text-emerald-400" />
                      ) : (
                        <ArrowDownLeft size={16} className="text-red-400" />
                      )}
                      <p className="text-sm font-medium text-white">
                        {cashboxEntryLabels[entry.entry_type]}
                      </p>
                    </div>
                    {entry.note && (
                      <p className="text-sm text-gray-400 mt-1">{entry.note}</p>
                    )}
                    <p className="text-xs text-gray-500 mt-2">
                      {format(new Date(entry.created_at), 'M/d HH:mm', { locale: ja })}
                      {entry.created_by_user?.name ? ` ・ ${entry.created_by_user.name}` : ''}
                    </p>
                  </div>
                  <div className={`font-mono font-bold text-sm ${entry.direction === 'in' ? 'text-emerald-400' : 'text-red-400'}`}>
                    {entry.direction === 'in' ? '+' : '-'}¥{entry.amount.toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-800">
            <h2 className="font-medium text-white">確認履歴</h2>
          </div>
          {counts.length === 0 ? (
            <p className="px-5 py-10 text-sm text-gray-500 text-center">確認履歴はまだありません</p>
          ) : (
            <div className="divide-y divide-gray-800">
              {counts.map((count) => (
                <div key={count.id} className="px-5 py-4 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-white">
                      {format(new Date(count.counted_at), 'M/d HH:mm', { locale: ja })}
                    </p>
                    <p className={`font-mono text-sm font-bold ${count.difference_amount === 0 ? 'text-green-400' : count.difference_amount > 0 ? 'text-sky-400' : 'text-red-400'}`}>
                      {count.difference_amount > 0 ? '+' : ''}¥{count.difference_amount.toLocaleString()}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-gray-500">理論</p>
                      <p className="font-mono text-white">¥{count.expected_amount.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">実測</p>
                      <p className="font-mono text-white">¥{count.actual_amount.toLocaleString()}</p>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500">
                    {count.counted_by_user?.name ? `${count.counted_by_user.name} ・ ` : ''}
                    {count.note || 'メモなし'}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
