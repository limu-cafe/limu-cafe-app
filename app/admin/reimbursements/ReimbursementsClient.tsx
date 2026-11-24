'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import ObjectWorkspace, { useObjectSelection } from '@/components/admin/ObjectWorkspace';
import {isObjectId} from '@/lib/admin-objects';
import AdvancePeopleWorkspace from '@/components/admin/AdvancePeopleWorkspace';
import type { AdvanceReceipt } from '@/components/admin/ReimbursementBatch';
import RecordDialog from '@/components/admin/RecordDialog';
import StockReceiptEditor from '@/components/admin/StockReceiptEditor';
import StockReceiptHistory,{StockIntakeSummary} from '@/components/admin/StockReceiptHistory';
import {emptyIntake,type IntakeDraft,type StockIntakeResult} from '@/lib/stock-intakes';
import {RestockSubmission} from '@/lib/restock';
import {purchaseReturnHref} from '@/lib/purchase-navigation';
import { money, recordDate } from '@/components/admin/ObjectRelatedRecords';
import { reimbursementOwner, reimbursementTitle, type ReimbursementItem, type ReimbursementRecord } from '@/lib/reimbursements';

export default function ReimbursementsClient({ items, purchaseRuns, miscExamples, historyPage = 1, hasMoreHistory = false, receipt,initialDraft }: {
  items: ReimbursementItem[]; purchaseRuns: ReimbursementRecord[]; miscExamples: string[];
  historyPage?: number; hasMoreHistory?: boolean;
  receipt?: AdvanceReceipt | null;initialDraft?:IntakeDraft;
}) {
  const router = useRouter();
  const query = useSearchParams();
  const [selectedId, select] = useObjectSelection('run');
  const [state, setState] = useObjectSelection('state');
  const filter = state === 'all' || state === 'reimbursed' ? state : !state && purchaseRuns.some(run => run.id === selectedId && run.reimbursement_status !== 'pending_reimbursement') ? 'all' : 'pending';
  const [search, setSearch] = useObjectSelection('q');
  const [record,setRecord]=useObjectSelection('record');
  const [collection,setCollection]=useObjectSelection('collection');
  const creating=record==='purchase',history=collection==='purchases';
  const [draft,setDraft]=useState(()=>{const seed=initialDraft??emptyIntake('personal_advance'),p=seed.purchases[0],line={...p.lines[0],itemId:isObjectId(query.get('item'))?query.get('item')!:p.lines[0].itemId,...(query.get('misc')==='1'?{kind:'expense' as const,label:''}:{})};if(items.find(item=>item.id===line.itemId)?.is_unlimited_stock)line.addStock=false;return {purchases:[{...p,source:query.get('source')==='cashbox'?'cashbox' as const:p.source,lines:[line]}]};});
  const [recorded,setRecorded]=useState<StockIntakeResult|null>(null);
  const purchaseRequests=useRef(new RestockSubmission());
  const returnHref=purchaseReturnHref(query.get('returnTo'));
  const [loading, setLoading] = useState<string | null>(null);
  const busy = useRef(false);
  const [completed, setCompleted] = useState<string[]>([]);
  const records = useMemo(() => purchaseRuns.map(run => completed.includes(run.id)
    ? { ...run, reimbursement_status: 'reimbursed' as const } : run), [purchaseRuns, completed]);
  const selected = records.find(run => run.id === selectedId);
  const pending = records.filter(run => run.reimbursement_status === 'pending_reimbursement');
  const pendingAmount = pending.reduce((total, run) => total + run.total_amount, 0);
  const keyword = (search ?? '').trim().toLowerCase();
  const visible = records.filter(run => (filter === 'all' || run.reimbursement_status === (filter === 'pending' ? 'pending_reimbursement' : 'reimbursed'))
    && `${reimbursementTitle(run)} ${reimbursementOwner(run)} ${run.vendor ?? ''} ${run.note ?? ''}`.toLowerCase().includes(keyword));
  const choose = (id: string) => { if (!busy.current) select(id); };
  const historyHref = (page: number) => {
    const params = new URLSearchParams(query.toString());
    params.set('page', String(page)); params.delete('run'); params.delete('person');
    return `/admin/reimbursements?${params}`;
  };
  const closeForm = () => { if (!busy.current) setRecord(null); };
  const statusLabel = (run: ReimbursementRecord) => run.reimbursement_status === 'reimbursed' ? '精算済み' : run.reimbursement_status === 'pending_reimbursement' ? '未精算' : '精算不要';

  const filters = <div className="space-y-3 border-b border-gray-800 p-3">
    <nav aria-label="立替の状態" className="flex flex-wrap gap-2">{[{ id: 'pending', label: `未精算 ${pending.length}` }, { id: 'reimbursed', label: '精算済み' }, { id: 'all', label: 'すべて' }].map(option => <button key={option.id} type="button" aria-pressed={filter === option.id} disabled={Boolean(loading)} onClick={() => setState(option.id, {run:null,person:null})} className={`rounded-lg px-3 py-2 text-sm ${filter === option.id ? 'bg-white text-gray-950' : 'text-gray-400 hover:bg-gray-800'}`}>{option.label}</button>)}</nav>
    <input type="search" aria-label="立替記録を検索" placeholder="立替者・商品名・購入先で検索" value={search ?? ''} onChange={event => setSearch(event.target.value, {}, 'replace')} className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-white"/>
  </div>;
  return <div className="mx-auto max-w-6xl space-y-5">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-2xl font-bold text-white">仕入れ・立替</h1><p className="mt-2 text-sm text-gray-400">未精算 <span className="font-mono text-amber-300">{pending.length}件 · {money(pendingAmount)}</span></p></div>
      <button type="button" disabled={Boolean(loading)} onClick={() => { setRecord('purchase');setRecorded(null); }} className="rounded-lg bg-white px-4 py-2.5 text-sm text-gray-950 disabled:opacity-40">買い物を記録</button>
    </header>
    <nav aria-label="仕入れ・立替の一覧" className="flex gap-5 border-b border-gray-800 text-sm"><button type="button" aria-pressed={!history} disabled={Boolean(loading)} onClick={()=>setCollection(null)} className={`pb-3 ${!history?'border-b-2 border-white text-white':'text-gray-400'}`}>立替</button><button type="button" aria-pressed={history} disabled={Boolean(loading)} onClick={()=>setCollection('purchases')} className={`pb-3 ${history?'border-b-2 border-white text-white':'text-gray-400'}`}>買い物の記録</button></nav>
    {returnHref&&<Link href={returnHref} className="inline-block text-sm text-sky-300 underline">元の画面へ戻る →</Link>}
    {isObjectId(query.get('fromDelivery'))&&<Link href={`/admin/items?collection=deliveries&delivery=${query.get('fromDelivery')}`} className="inline-block text-sm text-sky-300 underline">元の入荷記録へ戻る →</Link>}
    {query.get('from') === 'cashbox' && <Link href="/admin/cashbox" className="inline-block text-sm text-sky-300 underline">金庫へ戻る →</Link>}
    {history?<StockReceiptHistory/>:filter === 'pending' ? <AdvancePeopleWorkspace records={records} filters={filters} keyword={keyword} disabled={Boolean(loading)} receipt={receipt} onBusyChange={value => { busy.current = value; setLoading(value ? 'batch' : null); }} onRecorded={ids => setCompleted(current => [...current, ...ids])}/> : <>
    {selectedId && !selected && <p role="alert" className="text-sm text-amber-300">指定した立替記録が見つかりません。一覧から選び直してください。</p>}
    <ObjectWorkspace selected={Boolean(selected)} label="立替の明細" onClose={() => { if (!busy.current) select(null); }} collection={
      <section className="overflow-hidden rounded-xl border border-gray-800 bg-gray-900" aria-label="立替一覧">{filters}
        {visible.map(run => <button key={run.id} type="button" aria-pressed={selectedId === run.id} disabled={Boolean(loading)} onClick={() => choose(run.id)} className={`flex w-full items-center gap-4 border-b border-gray-800 px-4 py-3 text-left hover:bg-gray-800 ${selectedId === run.id ? 'bg-white/5' : ''}`}>
          <span className="min-w-0 flex-1"><span className="block wrap-break-word text-sm font-medium text-white">{reimbursementTitle(run)}</span><small className="mt-2 block text-gray-400">{reimbursementOwner(run)} · {run.vendor || '購入先未登録'}<br/>{run.purchased_on?`購入 ${run.purchased_on}`:`購入日不明 · 登録 ${recordDate(run.created_at)}`}</small></span>
          <span className="shrink-0 text-right"><span className="block font-mono text-white">{money(run.total_amount)}</span><small className="mt-1 block text-gray-400">{statusLabel(run)}</small></span>
        </button>)}
        {!visible.length && <p className="p-6 text-sm text-gray-400">表示する記録はありません。</p>}
        <div className="space-y-3 p-4 text-xs text-gray-400"><p>過去の記録はページを切り替えて確認できます。検索は表示中の履歴が対象です。</p><nav aria-label="立替の履歴ページ" className="flex items-center justify-between gap-3">{historyPage > 1 ? <Link prefetch={false} href={historyHref(historyPage - 1)} className="text-sky-300 underline">新しい記録へ</Link> : <span/>}<span>{historyPage}ページ</span>{hasMoreHistory ? <Link prefetch={false} href={historyHref(historyPage + 1)} className="text-sky-300 underline">古い記録へ</Link> : <span/>}</nav></div>
      </section>
    } detail={selected && <>
      <h2 className="wrap-break-word text-lg font-bold text-white">{reimbursementTitle(selected)}</h2><p className="mt-2 text-sm text-gray-400">{statusLabel(selected)}</p>
      <p className="mt-4 font-mono text-3xl text-white">{money(selected.total_amount)}</p>
      <dl className="mt-5 grid grid-cols-[5rem_minmax(0,1fr)] gap-3 text-sm"><dt className="text-gray-400">立替者</dt><dd className="wrap-break-word text-white">{reimbursementOwner(selected)}</dd><dt className="text-gray-400">購入先</dt><dd className="wrap-break-word text-white">{selected.vendor || '未登録'}</dd><dt className="text-gray-400">購入日</dt><dd className="text-white">{selected.purchased_on||'不明'}</dd><dt className="text-gray-400">記録日時</dt><dd className="text-white">{recordDate(selected.created_at)}</dd>{selected.reimbursement_status === 'reimbursed' && <><dt className="text-gray-400">精算日時</dt><dd className="text-white">{selected.reimbursed_at ? recordDate(selected.reimbursed_at) : '未登録'}</dd></>}</dl>
      {selected.created_by_user?.name && selected.created_by_user.name !== reimbursementOwner(selected) && <p className="mt-3 text-xs text-gray-400">記録者：{selected.created_by_user.name}</p>}
      {Boolean(selected.purchase_run_items?.length)&&<ul className="mt-5 divide-y divide-gray-800">{selected.purchase_run_items!.map((line,i)=><li key={i} className="flex justify-between gap-4 py-3 text-sm"><span className="text-gray-200">{line.item_name} × {line.quantity}</span><span className="shrink-0 font-mono text-white">{line.subtotal==null?'金額未登録':money(line.subtotal)}</span></li>)}</ul>}
      {selected.note && <p className="mt-5 whitespace-pre-wrap wrap-break-word text-sm text-gray-300">{selected.note}</p>}
      {selected.reimbursement_status === 'pending_reimbursement' && selected.purchased_by && <Link href={`/admin/reimbursements?person=${selected.purchased_by}&state=pending`} className="mt-6 inline-block text-sm text-sky-300 underline">{reimbursementOwner(selected)}の未精算をまとめて確認 →</Link>}
      <Link href="/admin/cashbox?view=ledger" className="mt-5 block text-sm text-sky-300 underline">金庫の出納を見る →</Link>
    </>}/></>}

    {creating && <RecordDialog title={recorded?'登録しました':'買い物を記録'} closeLabel="買い物入力を閉じる" wide busy={Boolean(loading)} onClose={closeForm}>
      {recorded?<StockIntakeSummary intake={recorded}/>:<StockReceiptEditor items={items} miscExamples={miscExamples} draft={draft} onChange={setDraft} onBusyChange={value=>{busy.current=value;setLoading(value?'purchase':null);}} onRecorded={result=>{setRecorded(result);setDraft(emptyIntake('personal_advance'));router.refresh();}} submission={purchaseRequests.current}/>}
    </RecordDialog>}
  </div>;
}
