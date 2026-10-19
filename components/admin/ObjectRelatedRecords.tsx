'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { OBJECT_RELATIONS, orderStateLabel, paymentLabel, type ObjectKind, type ObjectRecords } from '@/lib/admin-objects';
import { POINT_REASON_LABELS } from '@/lib/points';

export const recordDate = (value: string) => new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
export const money = (value: number) => `¥${value.toLocaleString()}`;
const linkClass = 'text-sky-300 underline decoration-sky-800 underline-offset-4 hover:text-sky-200';

export default function ObjectRelatedRecords({ kind, id, revision, selectedView }: { kind: ObjectKind; id: string; revision?: string; selectedView?: string }) {
  const [localView, setView] = useState<string>(OBJECT_RELATIONS[kind][0].id);
  const view = selectedView ?? localView;
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ key: string; data?: ObjectRecords; error?: string } | null>(null);
  const key = `${kind}/${id}?view=${view}&page=${page}&revision=${revision ?? ''}&attempt=${attempt}`;
  useEffect(() => {
    const controller = new AbortController();
    let current = true;
    fetch(`/api/admin/objects/${kind}/${id}?view=${encodeURIComponent(view)}&page=${page}`, { signal: controller.signal, cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? '履歴を取得できませんでした');
        if (current) setResult({ key, data: payload });
      })
      .catch((error) => { if (current && error.name !== 'AbortError') setResult({ key, error: error.message }); });
    return () => { current = false; controller.abort(); };
  }, [kind, id, view, page, key]);
  const current = result?.key === key ? result : null;
  const returnTo = `/admin/${kind}?${kind === 'items' ? 'item' : 'user'}=${id}&view=${view}`;
  return <section className="mt-6 border-t border-gray-800 pt-5" aria-label="関連する記録">
    {!selectedView && <div className="flex flex-wrap gap-2" aria-label="表示する記録">
      {OBJECT_RELATIONS[kind].map((option) => <button key={option.id} type="button" aria-pressed={view === option.id} onClick={() => { setView(option.id); setPage(1); }} className={`rounded-lg px-3 py-2 text-sm ${view === option.id ? 'bg-white text-gray-950' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}>{option.label}</button>)}
    </div>}
    <div className="mt-4 flex items-center justify-between gap-2 text-xs text-gray-400"><span>新しい順・20件ずつ</span><button type="button" onClick={() => setAttempt((value) => value + 1)} className="rounded-lg px-2 py-1 text-sky-300 hover:bg-gray-800">再読み込み</button></div>
    {!current && <p role="status" className="py-8 text-sm text-gray-400">記録を読み込み中…</p>}
    {current?.error && <p role="alert" className="py-6 text-sm text-amber-300">{current.error}</p>}
    {current?.data && <>
      {current.data.rows.length === 0 ? <p className="py-8 text-sm text-gray-400">このページに記録はありません</p> : <ul className="mt-2 max-h-[28rem] divide-y divide-gray-800 overflow-y-auto overscroll-contain pr-2">{current.data.rows.map((row) => <li key={row.id} className="space-y-2 py-4 text-sm"><RelatedRecord kind={kind} view={view} row={row} returnTo={returnTo}/></li>)}</ul>}
      <nav className="mt-3 flex items-center justify-between gap-2 text-sm" aria-label="関連記録のページ">
        <button type="button" disabled={page === 1} onClick={() => setPage((value) => value - 1)} className="rounded-lg border border-gray-700 px-3 py-2 text-gray-200 disabled:opacity-30">前へ</button><span className="text-gray-400">{page}ページ</span><button type="button" disabled={!current.data.hasNextPage} onClick={() => setPage((value) => value + 1)} className="rounded-lg border border-gray-700 px-3 py-2 text-gray-200 disabled:opacity-30">次へ</button>
      </nav>
    </>}
  </section>;
}

function RelatedRecord({ kind, view, row, returnTo }: { kind: ObjectKind; view: string; row: Record<string, any>; returnTo: string }) {
  if (view === 'stock') return <>
    <div className="grid grid-cols-[minmax(0,16rem)_auto] justify-start gap-6"><span className="text-gray-200">{({ restock: '入荷', purchase: '購入', adjustment: '調整', discard: '廃棄' } as Record<string, string>)[row.reason] ?? row.reason}</span><span className={`font-mono ${row.change_amount > 0 ? 'text-emerald-300' : 'text-gray-200'}`}>{row.change_amount > 0 ? '+' : ''}{row.change_amount}</span></div>
    <p className="text-xs text-gray-400">{recordDate(row.created_at)}</p>{row.note && <p className="whitespace-pre-wrap break-words text-gray-400">{row.note}</p>}
    {row.order_id && <Link prefetch={false} href={`/admin/orders/${row.order_id}?from=${encodeURIComponent(returnTo)}`} className={linkClass}>この購入の注文を見る →</Link>}
  </>;
  if (view === 'orders') {
    const order = kind === 'items' ? row.order : row;
    if (!order) return <p className="text-gray-400">注文情報を取得できません</p>;
    return <>
      <div className="grid grid-cols-[minmax(0,16rem)_auto] justify-start gap-6"><Link prefetch={false} href={`/admin/orders/${order.id}?from=${encodeURIComponent(returnTo)}`} className={linkClass}>{recordDate(order.created_at)} の注文 →</Link><span className="shrink-0 font-mono text-white">{money(order.total_amount)}</span></div>
      <p className="text-gray-400">{kind === 'items' ? `${row.item_name} × ${row.quantity}` : (row.order_items ?? []).map((item: any) => `${item.item_name} × ${item.quantity}`).join(' / ')}</p>
      <p className="text-xs text-gray-400">{paymentLabel(order.payment_method)} · {order.payment_method==='deferred'&&!('settled_at' in order)?'精算状況は注文詳細で確認':orderStateLabel(order)}</p>
      {order.user && <Link prefetch={false} href={`/admin/users?user=${order.user_id}&view=orders`} className={linkClass}>{order.user.name}</Link>}
    </>;
  }
  if (view === 'points') return <><div className="grid grid-cols-[minmax(0,16rem)_auto] justify-start gap-6"><span className="text-gray-200">{(POINT_REASON_LABELS as Record<string, string>)[row.reason_type] ?? row.reason_type}</span><span className="font-mono text-sky-300">{row.delta > 0 ? '+' : ''}{row.delta}pt</span></div><p className="text-xs text-gray-400">{recordDate(row.created_at)}</p>{row.note && <p className="break-words text-gray-400">{row.note}</p>}</>;
  if (view === 'charges') return <><div className="grid grid-cols-[minmax(0,16rem)_auto] justify-start gap-6"><span className="text-gray-200">{paymentLabel(row.method)}チャージ</span><span className="font-mono text-white">{money(row.amount)}</span></div><p className="text-xs text-gray-400">{recordDate(row.created_at)} · {({ pending: '承認待ち', approved: '反映済み', rejected: '却下', cancelled: '取消', refunded: '返金済み' } as Record<string, string>)[row.status] ?? row.status}</p>{row.note && <p className="break-words text-gray-400">{row.note}</p>}</>;
  return <><p className="font-medium text-white">{row.product?.name ?? 'サブスク契約'}</p><p className="text-gray-300">{({ active: '契約中', cancel_at_period_end: '期間末で解約', expired: '終了' } as Record<string, string>)[row.status] ?? row.status}</p><p className="text-xs text-gray-400">{row.next_billing_at ? `次回請求 ${recordDate(row.next_billing_at)}` : '次回請求なし'} · 終了月 {row.end_month}</p>{row.product?.id&&<Link href={'/admin/subscriptions?product='+row.product.id+'&view=members&member='+row.id} className={linkClass}>この契約を確認・編集 →</Link>}</>;
}
