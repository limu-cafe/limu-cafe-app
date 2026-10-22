'use client';

import { useState } from 'react';
import Link from 'next/link';
import ObjectDetailNavigation, { useObjectDetailView } from '@/components/admin/ObjectDetailNavigation';
import ObjectWorkspace, { useObjectSelection } from '@/components/admin/ObjectWorkspace';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { ArrowDownLeft, ArrowUpRight, Calculator, Scale, Wallet } from 'lucide-react';
import toast from 'react-hot-toast';
import { cashboxEntryLabels } from '@/lib/cashbox';

const DENOMINATIONS = [10000, 5000, 1000, 500, 100, 50, 10, 5, 1] as const;

type Entry = {
  id: string;
  order_id?:string|null;
  purchase_run_id?:string|null;
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
  totalCashCollectionAmount,
  unreimbursedAdvanceAmount,
  unreimbursedPurchaseRuns,
  latestCount,
  entries,
  counts,
}: {
  expectedAmount: number;
  pendingCashOrderAmount: number;
  pendingCashOrdersCount: number;
  totalCashCollectionAmount: number;
  unreimbursedAdvanceAmount: number;
  unreimbursedPurchaseRuns: PendingPurchaseRun[];
  latestCount: Count | null;
  entries: Entry[];
  counts: Count[];
}) {
  const router = useRouter();
  const [view,setView]=useObjectDetailView(['overview','ledger','counts']);
  const [entryId,selectEntry]=useObjectSelection('entry');
  const [countId,selectCount]=useObjectSelection('count');
  const [addingEntry,setAddingEntry]=useState(false),[addingCount,setAddingCount]=useState(false);
  const [entryKind,setEntryKind]=useState('manual');
  const selectedEntry=entries.find(entry=>entry.id===entryId),selectedCount=counts.find(count=>count.id===countId);
  const [miscExpenseAmount,setMiscExpenseAmount]=useState<number|''>('');
  const [miscExpenseName,setMiscExpenseName]=useState(''),[miscExpenseNote,setMiscExpenseNote]=useState('');

  const [adjustmentAmount, setAdjustmentAmount] = useState('');
  const [adjustmentNote, setAdjustmentNote] = useState('');
  const [adjustmentDirection, setAdjustmentDirection] = useState<'in' | 'out'>('in');
  const [actualAmount, setActualAmount] = useState('');
  const [countNote, setCountNote] = useState('');
  const [denominationCounts, setDenominationCounts] = useState<Record<string, string>>(
    Object.fromEntries(DENOMINATIONS.map((denomination) => [String(denomination), '']))
  );
  const [loading, setLoading] = useState<'adjustment' | 'count' | 'misc' | null>(null);

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

  const handleMiscExpense = async () => {
    if (!miscExpenseAmount || miscExpenseAmount <= 0) {
      toast.error('金額を入力してください');
      return;
    }

    if (!miscExpenseName.trim()) {
      toast.error('雑費名を入力してください');
      return;
    }

    setLoading('misc');
    try {
      const res = await fetch('/api/admin/cashbox/misc-expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: miscExpenseAmount,
          item_name: miscExpenseName,
          note: miscExpenseNote,
        }),
      });

      if (!res.ok) {
        throw new Error((await res.json()).error);
      }

      toast.success('雑費を記録しました');
      setMiscExpenseAmount('');
      setMiscExpenseName('');
      setMiscExpenseNote('');
      router.refresh();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(null);
    }
  };

  return <div className="mx-auto max-w-4xl space-y-5">
    <header><h1 className="text-2xl font-bold text-white">金庫</h1><p className="mt-1 text-sm text-gray-400">金庫の状況、出納記録、確認記録を確認します。</p></header>
    <ObjectDetailNavigation value={view} onChange={setView} options={[{id:'overview',label:'金庫の状況'},{id:'ledger',label:'出納台帳'},{id:'counts',label:'金庫確認'}]}/>
    {view==='overview'&&<div className="space-y-5"><section className="rounded-xl border border-gray-800 bg-gray-900 p-5"><p className="text-sm text-gray-400">台帳上の金庫残高</p><p className="mt-2 font-mono text-3xl text-white">¥{expectedAmount.toLocaleString()}</p><dl className="mt-5 grid grid-cols-2 gap-4 border-t border-gray-800 pt-5"><div><dt className="text-xs text-gray-400">直近の実測</dt><dd className="mt-2 font-mono text-lg text-white">{latestCount?`¥${latestCount.actual_amount.toLocaleString()}`:'未確認'}</dd></div><div><dt className="text-xs text-gray-400">確認時の台帳との差</dt><dd className={`mt-2 font-mono text-lg ${latestDifference===0?'text-emerald-300':'text-amber-300'}`}>{latestCount?`${latestDifference>0?'+':''}¥${latestDifference.toLocaleString()}`:'未確認'}</dd></div></dl>{latestCount&&<p className="mt-3 text-xs text-gray-400">{format(new Date(latestCount.counted_at),'yyyy/M/d HH:mm',{locale:ja})} · {latestCount.counted_by_user?.name??'確認者未登録'}</p>}{(!latestCount||latestDifference!==0)&&<button type="button" onClick={()=>{setView('counts');if(latestCount)selectCount(latestCount.id);}} className="mt-4 text-sm text-sky-300 underline underline-offset-4">{latestCount?'差額のある確認記録を見る →':'金庫の確認記録へ →'}</button>}</section>
      <section className="rounded-xl border border-gray-800 bg-gray-900 p-5"><h2 className="font-semibold text-white">金庫に入る予定・金庫から出る予定</h2><p className="mt-2 text-xs text-gray-400">以下の未回収・未精算額は、現在の金庫残高には加算・減算しません。</p><dl className="mt-4 space-y-4"><div><dt className="text-xs text-gray-400">未回収</dt><dd className="mt-1 font-mono text-white">¥{totalCashCollectionAmount.toLocaleString()}</dd><p className="mt-1 text-xs text-gray-400">うち現金注文 {pendingCashOrdersCount}件 · ¥{pendingCashOrderAmount.toLocaleString()}</p>{totalCashCollectionAmount>0&&<Link href="/admin/transactions?state=pending" className="mt-2 inline-block text-sm text-sky-300 underline">未精算の取引を確認 →</Link>}</div><div><dt className="text-xs text-gray-400">未精算の立替</dt><dd className="mt-1 font-mono text-white">¥{unreimbursedAdvanceAmount.toLocaleString()}</dd>{unreimbursedAdvanceAmount>0&&<Link href="/admin/reimbursements?state=pending&from=cashbox" className="mt-2 inline-block text-sm text-sky-300 underline">未精算の立替記録を確認 →</Link>}</div></dl>{unreimbursedPurchaseRuns.length>0&&<ul className="mt-4 divide-y divide-gray-800 border-t border-gray-800">{unreimbursedPurchaseRuns.map(run=><li key={run.id}><Link href={`/admin/reimbursements?run=${run.id}&from=cashbox`} className="flex items-center gap-4 py-3 text-sm"><span className="min-w-0 flex-1 text-sky-300">{run.vendor||'立替記録'}<small className="mt-1 block text-gray-400">{run.created_by_user?.name} · {(run.purchase_run_items??[]).map(line=>`${line.item_name} × ${line.quantity}`).join(' / ')||run.note}</small></span><span className="font-mono text-white">¥{run.total_amount.toLocaleString()}</span></Link></li>)}</ul>}</section></div>}
    {view==='ledger'&&<div className="space-y-5"><button type="button" onClick={()=>setAddingEntry(value=>!value)} className="rounded-lg bg-white px-4 py-2 text-sm text-gray-950">{addingEntry?'追加を閉じる':'出納記録を追加'}</button>{addingEntry&&<section className="max-w-xl"><label className="mb-3 block text-sm text-gray-300">記録の種類<select value={entryKind} onChange={event=>setEntryKind(event.target.value)} className="ml-3 rounded-lg bg-gray-800 p-2"><option value="manual">手動入金・出金</option><option value="misc">金庫からの雑費</option></select></label>{entryKind==='manual'?        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-5 space-y-4">
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
            aria-label="金額" placeholder="金額"
            className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-4 py-3 focus:outline-hidden focus:ring-2 focus:ring-white/20"
          />
          <textarea
            value={adjustmentNote}
            onChange={(e) => setAdjustmentNote(e.target.value)}
            aria-label="メモ（例: 金庫からつり銭を補充）" placeholder="メモ（例: 金庫からつり銭を補充）"
            rows={3}
            className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-4 py-3 focus:outline-hidden focus:ring-2 focus:ring-white/20 resize-none"
          />
          <button
            onClick={handleAdjustment}
            disabled={loading !== null}
            className="w-full bg-white text-gray-950 py-3 rounded-lg font-medium hover:bg-gray-100 transition-all disabled:opacity-50"
          >
            {loading === 'adjustment' ? '記録中...' : '台帳に記録する'}
          </button>
        </div>:<section className="space-y-4 rounded-xl border border-gray-800 bg-gray-900 p-5"><h2 className="font-semibold text-white">雑費の出金</h2><label className="block text-sm text-gray-300">雑費名<input value={miscExpenseName} onChange={event=>setMiscExpenseName(event.target.value)} className="mt-2 block w-full rounded-lg bg-gray-800 p-3"/></label><label className="block text-sm text-gray-300">金額<input type="number" min={1} value={miscExpenseAmount} onChange={event=>setMiscExpenseAmount(event.target.value?Number(event.target.value):'')} className="mt-2 block w-full rounded-lg bg-gray-800 p-3"/></label><label className="block text-sm text-gray-300">メモ<textarea value={miscExpenseNote} onChange={event=>setMiscExpenseNote(event.target.value)} className="mt-2 block w-full rounded-lg bg-gray-800 p-3"/></label><button type="button" disabled={loading!==null} onClick={handleMiscExpense} className="rounded-lg bg-white px-4 py-2 text-sm text-gray-950">雑費を記録</button></section>}</section>}
      <ObjectWorkspace selected={Boolean(selectedEntry)} label="出納記録の詳細" onClose={()=>selectEntry(null)} collection={<div className="divide-y divide-gray-800 rounded-xl border border-gray-800 bg-gray-900">{entries.map(entry=><button key={entry.id} type="button" aria-pressed={entry.id===entryId} onClick={()=>selectEntry(entry.id)} className="flex w-full items-center gap-4 px-4 py-4 text-left text-sm hover:bg-gray-800"><span className="min-w-0 flex-1 text-white">{cashboxEntryLabels[entry.entry_type]}<small className="mt-1 block text-gray-400">{format(new Date(entry.created_at),'M/d HH:mm',{locale:ja})} · {entry.created_by_user?.name}</small></span><span className={`font-mono ${entry.direction==='in'?'text-emerald-300':'text-gray-200'}`}>{entry.direction==='in'?'+':'−'}¥{entry.amount.toLocaleString()}</span></button>)}{!entries.length&&<p className="p-6 text-sm text-gray-400">記録はまだありません</p>}</div>} detail={selectedEntry&&<><h2 className="text-lg font-semibold text-white">{cashboxEntryLabels[selectedEntry.entry_type]}</h2><p className="mt-3 font-mono text-2xl text-white">{selectedEntry.direction==='in'?'+':'−'}¥{selectedEntry.amount.toLocaleString()}</p><p className="mt-3 text-sm text-gray-400">{format(new Date(selectedEntry.created_at),'yyyy/M/d HH:mm',{locale:ja})} · {selectedEntry.created_by_user?.name}</p><p className="mt-4 whitespace-pre-wrap wrap-break-word text-sm text-gray-300">{selectedEntry.note||'メモなし'}</p>{selectedEntry.order_id&&<Link href={`/admin/orders/${selectedEntry.order_id}?from=${encodeURIComponent(`/admin/cashbox?view=ledger&entry=${selectedEntry.id}`)}`} className="mt-5 block text-sm text-sky-300 underline">この出納の注文を見る →</Link>}{selectedEntry.purchase_run_id&&<Link href={`/admin/reimbursements?run=${selectedEntry.purchase_run_id}&from=cashbox`} className="mt-5 block text-sm text-sky-300 underline">この出納の立替記録を見る →</Link>}</>}/>
    </div>}
    {view==='counts'&&<div className="space-y-5"><button type="button" onClick={()=>setAddingCount(value=>!value)} className="rounded-lg bg-white px-4 py-2 text-sm text-gray-950">{addingCount?'追加を閉じる':'金庫確認を記録'}</button>{addingCount&&<div className="max-w-xl">        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-5 space-y-4">
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
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white focus:outline-hidden focus:ring-2 focus:ring-white/20"
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
            aria-label="実測金額（枚数を使わない場合のみ）" placeholder="実測金額（枚数を使わない場合のみ）"
            className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-4 py-3 focus:outline-hidden focus:ring-2 focus:ring-white/20"
          />
          <textarea
            value={countNote}
            onChange={(e) => setCountNote(e.target.value)}
            aria-label="メモ（例: 月末確認、つり銭補充前）" placeholder="メモ（例: 月末確認、つり銭補充前）"
            rows={3}
            className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-4 py-3 focus:outline-hidden focus:ring-2 focus:ring-white/20 resize-none"
          />
          <button
            onClick={handleCount}
            disabled={loading !== null}
            className="w-full bg-blue-500/20 text-blue-300 py-3 rounded-lg font-medium hover:bg-blue-500/30 transition-all disabled:opacity-50"
          >
            {loading === 'count' ? '記録中...' : '確認結果を保存する'}
          </button>
        </div></div>}<ObjectWorkspace selected={Boolean(selectedCount)} label="金庫確認の詳細" onClose={()=>selectCount(null)} collection={<div className="divide-y divide-gray-800 rounded-xl border border-gray-800 bg-gray-900">{counts.map(count=><button key={count.id} type="button" aria-pressed={count.id===countId} onClick={()=>selectCount(count.id)} className="flex w-full items-center gap-4 px-4 py-4 text-left text-sm hover:bg-gray-800"><span className="flex-1 text-white">{format(new Date(count.counted_at),'yyyy/M/d HH:mm',{locale:ja})}<small className="mt-1 block text-gray-400">{count.counted_by_user?.name}</small></span><span className={`font-mono ${count.difference_amount===0?'text-emerald-300':'text-amber-300'}`}>差額 {count.difference_amount>0?'+':''}¥{count.difference_amount.toLocaleString()}</span></button>)}{!counts.length&&<p className="p-6 text-sm text-gray-400">確認履歴はまだありません</p>}</div>} detail={selectedCount&&<><h2 className="font-semibold text-white">{format(new Date(selectedCount.counted_at),'yyyy/M/d HH:mm',{locale:ja})}の確認</h2><dl className="mt-5 grid grid-cols-[7rem_1fr] gap-3 text-sm"><dt className="text-gray-400">台帳の金額</dt><dd className="font-mono text-white">¥{selectedCount.expected_amount.toLocaleString()}</dd><dt className="text-gray-400">実測金額</dt><dd className="font-mono text-white">¥{selectedCount.actual_amount.toLocaleString()}</dd><dt className="text-gray-400">差額</dt><dd className="font-mono text-amber-300">¥{selectedCount.difference_amount.toLocaleString()}</dd></dl><p className="mt-4 text-sm text-gray-400">{selectedCount.counted_by_user?.name}</p><p className="mt-3 whitespace-pre-wrap wrap-break-word text-sm text-gray-300">{selectedCount.note||'メモなし'}</p></>}/></div>}
  </div>;
}
