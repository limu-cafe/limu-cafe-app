'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import type { AdminOrder } from '@/lib/admin-objects';
import { canPayOrderFromBalance, orderCashDue } from '@/lib/order-balance-payment';
import OrderRecord from './OrderRecord';

const yen = (n: number) => `¥${n.toLocaleString()}`;
export default function OrderBalanceCollection({ user, orders, returnTo, disabled = false, onBusyChange }: {
  user: { id: string; name: string; balance?: number }; orders: AdminOrder[]; returnTo: string;
  disabled?: boolean; onBusyChange?: (busy: boolean) => void;
}) {
  const router = useRouter(), busy = useRef(false);
  const operation = useRef<{ signature: string; id: string } | null>(null);
  const [ids, setIds] = useState<string[]>([]), [reviewing, setReviewing] = useState(false);
  const [reason, setReason] = useState(''), [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false), [done, setDone] = useState(false), [error, setError] = useState('');
  const ownOrders = orders.filter(o => o.user_id === user.id);
  const eligible = ownOrders.filter(canPayOrderFromBalance);
  const selected = eligible.filter(o => ids.includes(o.id));
  const total = selected.reduce((sum, o) => sum + orderCashDue(o), 0);
  const balance = user.balance, enough = typeof balance === 'number' && total <= balance;
  const available = typeof balance === 'number' && eligible.length > 0;
  const locked = disabled || loading || done;
  const submit = async () => {
    if (busy.current || locked || !confirmed || !reason.trim() || reason.trim().length>300 || !selected.length || selected.length > 1000 || !enough || total > 2147483647) return;
    const values = { orders: selected.map(o => ({ id: o.id, expected_amount: orderCashDue(o) })).sort((a,b) => a.id.localeCompare(b.id)), expected_balance: balance, confirm_unpaid: true, reason: reason.trim() };
    const signature = JSON.stringify(values);
    if (operation.current?.signature !== signature) operation.current = { signature, id: crypto.randomUUID() };
    busy.current = true; setLoading(true); onBusyChange?.(true); setError('');
    try {
      const response = await fetch(`/api/admin/users/${user.id}/order-balance-payments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...values, operation_id: operation.current.id }) });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ok) throw new Error(result?.error ?? '結果を確認できませんでした。同じ内容で再試行するか、取引を再読み込みしてください');
      setDone(true); toast.success(result.already_paid ? 'この一括精算は完了済みです' : `${selected.length}件を残高から精算しました`); router.refresh();
    } catch (failure: any) { setError(failure.message); }
    finally { busy.current = false; setLoading(false); onBusyChange?.(false); }
  };
  return <section aria-label={`${user.name}の未精算注文`} className="space-y-3 rounded-xl border border-gray-800 p-3 sm:p-4">
    <Link prefetch={false} href={`/admin/users?user=${user.id}&view=orders`} className="text-sm font-semibold text-sky-300 underline underline-offset-4">{user.name}の未精算注文</Link>
    {done ? <p role="status" className="py-4 text-sm text-emerald-300">選択した注文は残高精算済みです。最新の取引を読み込んでいます。</p> : reviewing ? <div className="max-w-lg space-y-4 rounded-xl bg-gray-900 p-4" aria-label="選択した注文の残高精算">
      <h3 className="font-semibold text-white">選択した{selected.length}件を残高から精算</h3>
      <ul className="divide-y divide-gray-800 text-sm">{selected.map(o => <li key={o.id} className="flex items-start justify-between gap-4 py-2"><div className="min-w-0"><p className="break-words text-gray-200">{o.order_items?.map(i => `${i.item_name} × ${i.quantity}`).join(' / ') || '注文'}</p><p className="mt-1 text-xs text-gray-400">{new Date(o.created_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}</p></div><span className="shrink-0 font-mono text-white">{yen(orderCashDue(o))}</span></li>)}</ul>
      <dl className="grid grid-cols-[auto_auto] justify-start gap-x-8 gap-y-2 text-sm"><dt className="text-gray-400">精算合計</dt><dd className="font-mono text-white">{yen(total)}</dd><dt className="text-gray-400">精算前の残高</dt><dd className="font-mono text-white">{yen(balance ?? 0)}</dd><dt className="text-gray-400">精算後の残高</dt><dd className="font-mono text-white">{enough ? yen(balance! - total) : '残高不足'}</dd></dl>
      {selected.some(o=>(o.points_used??0)>0) && <p className="text-sm text-gray-400">精算額は使用済みポイントを差し引いた金額です。</p>}
      <p className="text-sm text-gray-400">現金の受領は記録しません。未払いのチャージ代は要回収に残ります。</p>
      {!enough && <p role="status" className="text-sm text-amber-300">残高が{yen(Math.max(0,total-(balance??0)))}不足しています。</p>}
      <label className="block text-sm text-gray-300">精算理由<textarea aria-label="一括精算の理由" value={reason} maxLength={300} disabled={locked} onChange={e => setReason(e.target.value)} rows={2} className="mt-2 w-full rounded-lg border border-gray-700 bg-gray-950 p-3 text-white"/></label>
      <label className="flex items-start gap-3 text-sm text-gray-300"><input type="checkbox" checked={confirmed} disabled={locked} onChange={e => setConfirmed(e.target.checked)} className="mt-1"/>本人に確認し、選択したすべての注文の現金をまだ受け取っていないことを確認しました</label>
      {error && <p role="alert" className="text-sm text-red-300">{error} <button type="button" onClick={() => router.refresh()} disabled={locked} className="underline">取引を再読み込み</button></p>}
      <div className="flex flex-wrap gap-3"><button type="button" onClick={submit} disabled={locked || !confirmed || !reason.trim() || reason.trim().length>300 || !enough || !selected.length || selected.length>1000 || total>2147483647} className="rounded-lg bg-white px-4 py-3 text-sm text-gray-950 disabled:opacity-40">{loading ? '精算中…' : `${selected.length}件・${yen(total)}を残高から精算する`}</button><button type="button" onClick={() => { setReviewing(false); setConfirmed(false); setError(''); }} disabled={locked} className="px-3 py-2 text-sm text-gray-300">選択に戻る</button></div>
    </div> : <>
      {available && <div className="flex flex-wrap items-center gap-3 text-sm"><label className="flex items-center gap-2 text-gray-300"><input aria-label={`${user.name}の未精算注文をすべて選択`} type="checkbox" checked={eligible.length>0 && selected.length===eligible.length} disabled={locked} onChange={e => setIds(e.target.checked ? eligible.map(o=>o.id) : [])}/>すべて選択</label><span className="text-gray-400">{selected.length}件選択{selected.length>0 ? ` · 合計${yen(total)}` : ''}</span>{selected.length>0 && <button type="button" onClick={() => { setReviewing(true); setConfirmed(false); setError(''); }} disabled={locked || selected.length>1000 || total>2147483647} className="rounded-lg border border-sky-800 px-3 py-2 text-sky-200 disabled:opacity-40">選択した注文を残高から精算</button>}{selected.length>1000 && <p className="text-amber-300">一度に選べる注文は1000件までです。</p>}</div>}
      <div>{ownOrders.map(o => <div key={o.id} className="flex items-center gap-2">{available && <input aria-label={`${new Date(o.created_at).toLocaleDateString('ja-JP', { timeZone:'Asia/Tokyo' })}の注文${orderCashDue(o)}円を選択`} type="checkbox" checked={ids.includes(o.id)} disabled={locked || !canPayOrderFromBalance(o)} onChange={e => setIds(previous => e.target.checked ? Array.from(new Set([...previous,o.id])) : previous.filter(id=>id!==o.id))}/>}<div className="min-w-0 flex-1"><OrderRecord order={o} returnTo={returnTo}/></div></div>)}</div>
    </>}
  </section>;
}
