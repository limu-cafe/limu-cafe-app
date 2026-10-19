'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import ObjectWorkspace, { useObjectSelection } from '@/components/admin/ObjectWorkspace';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';

type ItemOption = {
  id: string;
  name: string;
  category?: { name?: string; icon?: string } | null;
};

type PurchaseRunRow = {
  id: string;
  total_amount: number;
  payment_source: 'cashbox' | 'personal_advance';
  reimbursement_status: 'not_needed' | 'pending_reimbursement' | 'reimbursed';
  vendor: string | null;
  note: string | null;
  created_at: string;
  reimbursed_at?: string | null;
  created_by_user?: { name?: string | null } | null;
  purchase_run_items?: Array<{ item_name: string; quantity: number }> | null;
};

export default function ReimbursementsClient({
  items,
  purchaseRuns,
  miscExamples,
}: {
  items: ItemOption[];
  purchaseRuns: PurchaseRunRow[];
  miscExamples: string[];
}) {
  const router = useRouter();
  const query=useSearchParams();
  const [selectedId,select]=useObjectSelection('run');
  const [filter,setFilter]=useObjectSelection('state');
  const [creating,setCreating]=useState(false),[kind,setKind]=useState('product');
  const selected=purchaseRuns.find(run=>run.id===selectedId);
  const visible=purchaseRuns.filter(run=>filter==='pending'?run.reimbursement_status==='pending_reimbursement':filter==='reimbursed'?run.reimbursement_status==='reimbursed':true);
  const runTitle=(run:PurchaseRunRow)=>(run.purchase_run_items??[]).map(item=>`${item.item_name} × ${item.quantity}`).join(' / ')||run.note?.split(' / ')[0]||'立替';

  const [productItemId, setProductItemId] = useState(items[0]?.id ?? '');
  const [productQuantity, setProductQuantity] = useState('');
  const [productAmount, setProductAmount] = useState('');
  const [productVendor, setProductVendor] = useState('');
  const [productNote, setProductNote] = useState('');

  const [miscLabel, setMiscLabel] = useState('');
  const [miscAmount, setMiscAmount] = useState('');
  const [miscVendor, setMiscVendor] = useState('');
  const [miscNote, setMiscNote] = useState('');

  const [loading, setLoading] = useState<string | null>(null);

  const pendingRuns = useMemo(
    () => purchaseRuns.filter((run) => run.reimbursement_status === 'pending_reimbursement'),
    [purchaseRuns]
  );

  const submitProductAdvance = async () => {
    if (!productItemId) {
      toast.error('商品を選択してください');
      return;
    }

    setLoading('product');
    try {
      const res = await fetch('/api/admin/reimbursements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'product',
          item_id: productItemId,
          quantity: Number(productQuantity),
          total_amount: Number(productAmount),
          vendor: productVendor,
          note: productNote,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? '立替記録に失敗しました');

      toast.success('商品の立替を記録しました');
      setProductQuantity('');
      setProductAmount('');
      setProductVendor('');
      setProductNote('');
      router.refresh();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(null);
    }
  };

  const submitMiscAdvance = async () => {
    setLoading('misc');
    try {
      const res = await fetch('/api/admin/reimbursements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'misc',
          label: miscLabel,
          total_amount: Number(miscAmount),
          vendor: miscVendor,
          note: miscNote,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? '立替記録に失敗しました');

      toast.success('雑費の立替を記録しました');
      setMiscLabel('');
      setMiscAmount('');
      setMiscVendor('');
      setMiscNote('');
      router.refresh();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(null);
    }
  };

  const reimburse = async (purchaseRunId: string) => {
    if (!confirm('金庫から精算しますか？')) return;

    setLoading(`reimburse:${purchaseRunId}`);
    try {
      const res = await fetch(`/api/admin/purchases/${purchaseRunId}/reimburse`, {
        method: 'POST',
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? '精算に失敗しました');

      toast.success('精算しました');
      router.refresh();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(null);
    }
  };

  return <div className={`space-y-5 ${selected?'':'mx-auto max-w-3xl'}`}>
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold text-white">立替記録</h1><p className="mt-1 text-sm text-gray-400">未精算 {pendingRuns.length}件 · 記録を選んで明細と精算状況を確認します。</p></div><button type="button" onClick={()=>setCreating(value=>!value)} className="rounded-lg bg-white px-4 py-2 text-sm text-gray-950">{creating?'追加を閉じる':'立替を記録'}</button></header>
    {selectedId&&!selected&&<p role="alert" className="text-sm text-amber-300">指定した立替記録が見つかりません。記録の一覧から確認してください。</p>}
    {query.get('from')==='cashbox'&&<Link href="/admin/cashbox" className="inline-block text-sm text-sky-300 underline">金庫へ戻る →</Link>}
    {creating&&<section className="max-w-2xl"><label className="mb-4 block text-sm text-gray-300">立替の種類<select value={kind} onChange={event=>setKind(event.target.value)} className="ml-3 rounded-lg bg-gray-800 p-2"><option value="product">商品</option><option value="misc">雑費</option></select></label>{kind==='product'?        <section className="rounded-2xl border border-gray-800 bg-gray-900 p-4 space-y-4">
          <h2 className="text-base font-semibold text-white">商品の立替</h2>
          <select
            value={productItemId}
            onChange={(event) => setProductItemId(event.target.value)}
            className="w-full rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-white focus:outline-none"
          >
            <option value="">商品を選択</option>
            {items.map((item) => (
              <option key={item.id} value={item.id}>
                {(item.category?.icon ?? '📦') + ' ' + item.name}
              </option>
            ))}
          </select>
          <div className="grid gap-3 md:grid-cols-2">
            <input
              type="number"
              min={1}
              value={productQuantity}
              onChange={(event) => setProductQuantity(event.target.value)}
              aria-label="個数" placeholder="個数"
              className="rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-white focus:outline-none"
            />
            <input
              type="number"
              min={1}
              value={productAmount}
              onChange={(event) => setProductAmount(event.target.value)}
              aria-label="立替額" placeholder="立替額"
              className="rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-white focus:outline-none"
            />
          </div>
          <input
            type="text"
            value={productVendor}
            onChange={(event) => setProductVendor(event.target.value)}
            aria-label="購入先" placeholder="購入先"
            className="w-full rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-white focus:outline-none"
          />
          <input
            type="text"
            value={productNote}
            onChange={(event) => setProductNote(event.target.value)}
            aria-label="メモ" placeholder="メモ"
            className="w-full rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-white focus:outline-none"
          />
          <button
            onClick={submitProductAdvance}
            disabled={loading === 'product'}
            className="w-full rounded-xl bg-white px-4 py-3 text-sm font-medium text-gray-950 transition hover:bg-gray-100 disabled:opacity-50"
          >
            {loading === 'product' ? '記録中...' : '商品の立替を記録'}
          </button>
        </section>:         <section className="rounded-2xl border border-gray-800 bg-gray-900 p-4 space-y-4">
          <h2 className="text-base font-semibold text-white">雑費の立替</h2>
          <div className="space-y-2">
            <input
              list="reimbursement-misc-examples"
              type="text"
              value={miscLabel}
              onChange={(event) => setMiscLabel(event.target.value)}
              aria-label="立て替えたもの" placeholder="立て替えたもの"
              className="w-full rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-white focus:outline-none"
            />
            <datalist id="reimbursement-misc-examples">
              {miscExamples.map((example) => (
                <option key={example} value={example} />
              ))}
            </datalist>
          </div>
          <input
            type="number"
            min={1}
            value={miscAmount}
            onChange={(event) => setMiscAmount(event.target.value)}
            aria-label="立替額" placeholder="立替額"
            className="w-full rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-white focus:outline-none"
          />
          <input
            type="text"
            value={miscVendor}
            onChange={(event) => setMiscVendor(event.target.value)}
            aria-label="購入先" placeholder="購入先"
            className="w-full rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-white focus:outline-none"
          />
          <input
            type="text"
            value={miscNote}
            onChange={(event) => setMiscNote(event.target.value)}
            aria-label="メモ" placeholder="メモ"
            className="w-full rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-white focus:outline-none"
          />
          <button
            onClick={submitMiscAdvance}
            disabled={loading === 'misc'}
            className="w-full rounded-xl bg-white px-4 py-3 text-sm font-medium text-gray-950 transition hover:bg-gray-100 disabled:opacity-50"
          >
            {loading === 'misc' ? '記録中...' : '雑費の立替を記録'}
          </button>
        </section>}</section>}
    <ObjectWorkspace selected={Boolean(selected)} label="立替の明細" onClose={()=>select(null)} collection={<div className="rounded-xl border border-gray-800 bg-gray-900"><nav aria-label="立替の状態" className="flex gap-2 border-b border-gray-800 p-3">{[{id:null,label:'すべて'},{id:'pending',label:'未精算'},{id:'reimbursed',label:'精算済み'}].map(option=><button key={option.label} type="button" aria-pressed={filter===option.id} onClick={()=>setFilter(option.id)} className={`rounded-lg px-3 py-2 text-sm ${filter===option.id?'bg-white text-gray-950':'text-gray-400'}`}>{option.label}</button>)}</nav>{visible.map(run=><button key={run.id} type="button" aria-pressed={selectedId===run.id} onClick={()=>select(run.id)} className="flex w-full items-center gap-4 border-b border-gray-800 px-4 py-4 text-left hover:bg-gray-800"><span className="min-w-0 flex-1 break-words text-sm text-white">{runTitle(run)}<small className="mt-1 block text-gray-400">{run.created_by_user?.name} · {format(new Date(run.created_at),'M/d HH:mm',{locale:ja})} · {run.reimbursement_status==='reimbursed'?'精算済み':'未精算'}</small></span><span className="font-mono text-white">¥{run.total_amount.toLocaleString()}</span></button>)}{!visible.length&&<p className="p-6 text-sm text-gray-400">この状態の記録はありません</p>}</div>} detail={selected&&<><h2 className="text-lg font-bold text-white">{runTitle(selected)}</h2><p className="mt-2 text-sm text-gray-400">{selected.reimbursement_status==='reimbursed'?'精算済み':'未精算'}</p><dl className="mt-5 grid grid-cols-[7rem_1fr] gap-3 text-sm"><dt className="text-gray-400">立替額</dt><dd className="font-mono text-xl text-white">¥{selected.total_amount.toLocaleString()}</dd><dt className="text-gray-400">立替者</dt><dd className="text-white">{selected.created_by_user?.name??'未登録'}</dd><dt className="text-gray-400">購入先</dt><dd className="text-white">{selected.vendor||'未登録'}</dd><dt className="text-gray-400">記録日時</dt><dd className="text-white">{format(new Date(selected.created_at),'yyyy/M/d HH:mm',{locale:ja})}</dd><dt className="text-gray-400">精算日時</dt><dd className="text-white">{selected.reimbursed_at?format(new Date(selected.reimbursed_at),'yyyy/M/d HH:mm',{locale:ja}):'未精算'}</dd></dl>{selected.note&&<p className="mt-5 whitespace-pre-wrap break-words text-sm text-gray-300">{selected.note}</p>}{selected.reimbursement_status==='pending_reimbursement'&&<div className="mt-6 space-y-3 border-t border-gray-800 pt-5"><Link href="/admin/cashbox" className="block text-sm text-sky-300 underline">金庫の状況を確認 →</Link><button type="button" disabled={Boolean(loading)} onClick={()=>reimburse(selected.id)} className="rounded-lg bg-white px-4 py-3 text-sm text-gray-950 disabled:opacity-40">{loading?'精算中…':'この立替を金庫から精算'}</button></div>}</>}/>
  </div>;
}
