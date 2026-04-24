'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { ArrowDownLeft, ArrowUpRight, Calculator, Scale, Wallet } from 'lucide-react';
import toast from 'react-hot-toast';
import { cashboxEntryLabels } from '@/lib/cashbox';

const DENOMINATIONS = [10000, 5000, 1000, 500, 100, 50, 10, 5, 1] as const;

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

type PendingPurchaseRun = {
  id: string;
  total_amount: number;
  vendor: string | null;
  note: string | null;
  created_at: string;
  created_by_user?: { name?: string | null } | null;
  purchase_run_items?: Array<{ item_name: string; quantity: number }>;
};

export default function CashboxClient({
  expectedAmount,
  pendingCashOrderAmount,
  pendingCashOrdersCount,
  deferredReceivableAmount,
  unreimbursedAdvanceAmount,
  unreimbursedPurchaseRuns,
  latestCount,
  entries,
  counts,
}: {
  expectedAmount: number;
  pendingCashOrderAmount: number;
  pendingCashOrdersCount: number;
  deferredReceivableAmount: number;
  unreimbursedAdvanceAmount: number;
  unreimbursedPurchaseRuns: PendingPurchaseRun[];
  latestCount: Count | null;
  entries: Entry[];
  counts: Count[];
}) {
  const router = useRouter();
  const [adjustmentAmount, setAdjustmentAmount] = useState('');
  const [adjustmentNote, setAdjustmentNote] = useState('');
  const [adjustmentDirection, setAdjustmentDirection] = useState<'in' | 'out'>('in');
  const [actualAmount, setActualAmount] = useState('');
  const [countNote, setCountNote] = useState('');
  const [denominationCounts, setDenominationCounts] = useState<Record<string, string>>(
    Object.fromEntries(DENOMINATIONS.map((denomination) => [String(denomination), '']))
  );
  const [loading, setLoading] = useState<'adjustment' | 'count' | `reimburse:${string}` | null>(null);

  const latestDifference = latestCount?.difference_amount ?? 0;
  const denominationTotal = DENOMINATIONS.reduce((sum, denomination) => {
    return sum + denomination * Number(denominationCounts[String(denomination)] || 0);
  }, 0);

  const handleAdjustment = async () => {
    const parsedAmount = Number(adjustmentAmount || 0);
    if (!parsedAmount || parsedAmount <= 0) {
      toast.error('金額を入力してください');
      return;
    }

    setLoading('adjustment');
    try {
      const res = await fetch('/api/admin/cashbox/adjustments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: parsedAmount,
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
    const hasDenominationInput = DENOMINATIONS.some(
      (denomination) => Number(denominationCounts[String(denomination)] || 0) > 0
    );
    const finalActualAmount = hasDenominationInput ? denominationTotal : Number(actualAmount || 0);

    if ((!hasDenominationInput && actualAmount === '') || finalActualAmount < 0) {
      toast.error('実測金額を入力してください');
      return;
    }

    const parsedDenominationCounts = hasDenominationInput
      ? Object.fromEntries(
          DENOMINATIONS.map((denomination) => [
            String(denomination),
            Number(denominationCounts[String(denomination)] || 0),
          ])
        )
      : null;

    setLoading('count');
    try {
      const res = await fetch('/api/admin/cashbox/counts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actual_amount: finalActualAmount,
          denomination_counts: parsedDenominationCounts,
          note: countNote,
        }),
      });

      if (!res.ok) {
        throw new Error((await res.json()).error);
      }

      toast.success('金庫確認を記録しました');
      setActualAmount('');
      setCountNote('');
      setDenominationCounts(
        Object.fromEntries(DENOMINATIONS.map((denomination) => [String(denomination), '']))
      );
      router.refresh();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(null);
    }
  };

  const handleReimburse = async (purchaseRunId: string) => {
    setLoading(`reimburse:${purchaseRunId}`);
    try {
      const res = await fetch(`/api/admin/purchases/${purchaseRunId}/reimburse`, {
        method: 'POST',
      });

      if (!res.ok) {
        throw new Error((await res.json()).error);
      }

      toast.success('立替精算を記録しました');
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
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-5">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center mb-3">
            <Calculator size={20} className="text-emerald-400" />
          </div>
          <p className="text-gray-400 text-xs mb-1">現在金庫にある見込み</p>
          <p className="font-display font-bold text-2xl text-emerald-400">
            ¥{expectedAmount.toLocaleString()}
          </p>
        </div>

        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-5">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center mb-3">
            <Wallet size={20} className="text-blue-400" />
          </div>
          <p className="text-gray-400 text-xs mb-1">未回収の現金注文</p>
          <p className="font-display font-bold text-2xl text-blue-400">
            ¥{pendingCashOrderAmount.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-gray-500">{pendingCashOrdersCount}件</p>
        </div>

        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-5">
          <div className="w-10 h-10 rounded-xl bg-sky-500/10 flex items-center justify-center mb-3">
            <Wallet size={20} className="text-sky-400" />
          </div>
          <p className="text-gray-400 text-xs mb-1">未回収の後払い</p>
          <p className="font-display font-bold text-2xl text-sky-400">
            ¥{deferredReceivableAmount.toLocaleString()}
          </p>
        </div>

        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-5">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center mb-3">
            <Wallet size={20} className="text-cyan-400" />
          </div>
          <p className="text-gray-400 text-xs mb-1">未精算の立替</p>
          <p className="font-display font-bold text-2xl text-cyan-400">
            ¥{unreimbursedAdvanceAmount.toLocaleString()}
          </p>
        </div>

        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-5">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center mb-3">
            <Wallet size={20} className="text-indigo-400" />
          </div>
          <p className="text-gray-400 text-xs mb-1">最新の実測金額</p>
          <p className="font-display font-bold text-2xl text-indigo-400">
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

      <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800">
          <h2 className="font-medium text-white">未精算の立替</h2>
        </div>
        {unreimbursedPurchaseRuns.length === 0 ? (
          <p className="px-5 py-8 text-sm text-gray-500 text-center">未精算の立替はありません</p>
        ) : (
          <div className="divide-y divide-gray-800">
            {unreimbursedPurchaseRuns.map((purchaseRun) => (
              <div key={purchaseRun.id} className="px-5 py-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-white">
                      {purchaseRun.vendor || '購入先未入力'}
                    </p>
                    <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-[11px] font-medium text-sky-300">
                      個人立替
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-gray-400">
                    {(purchaseRun.purchase_run_items ?? [])
                      .map((row) => `${row.item_name} ${row.quantity}個`)
                      .join(' / ') || '明細なし'}
                  </p>
                  <p className="mt-2 text-xs text-gray-500">
                    {format(new Date(purchaseRun.created_at), 'M/d HH:mm', { locale: ja })}
                    {purchaseRun.created_by_user?.name ? ` ・ ${purchaseRun.created_by_user.name}` : ''}
                    {purchaseRun.note ? ` ・ ${purchaseRun.note}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <p className="font-mono text-sm font-bold text-sky-300">
                    ¥{purchaseRun.total_amount.toLocaleString()}
                  </p>
                  <button
                    onClick={() => handleReimburse(purchaseRun.id)}
                    disabled={loading !== null}
                    className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-gray-950 transition-colors hover:bg-gray-100 disabled:opacity-50"
                  >
                    {loading === `reimburse:${purchaseRun.id}` ? '精算中...' : '金庫から精算'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid xl:grid-cols-2 gap-6">
        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-5 space-y-4">
          <div>
            <h2 className="font-medium text-white">手動調整</h2>
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
            onChange={(e) => setAdjustmentAmount(e.target.value)}
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
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {DENOMINATIONS.map((denomination) => (
              <label
                key={denomination}
                className="rounded-xl border border-gray-800 bg-gray-950/40 px-3 py-3 text-sm text-gray-300"
              >
                <span className="mb-2 block text-xs text-gray-500">{denomination.toLocaleString()}円</span>
                <input
                  type="number"
                  min={0}
                  value={denominationCounts[String(denomination)] ?? ''}
                  onChange={(e) =>
                    setDenominationCounts((current) => ({
                      ...current,
                      [String(denomination)]: e.target.value,
                    }))
                  }
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-white/20"
                />
              </label>
            ))}
          </div>

          <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 px-4 py-3">
            <p className="text-xs text-blue-200/80">枚数から計算した合計</p>
            <p className="mt-1 font-display text-2xl font-bold text-blue-300">
              ¥{denominationTotal.toLocaleString()}
            </p>
          </div>

          <input
            type="number"
            min={0}
            value={actualAmount}
            onChange={(e) => setActualAmount(e.target.value)}
            placeholder="実測金額（枚数を使わない場合のみ）"
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
