'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { orderActions, orderStateLabel, paymentLabel, type AdminOrder } from '@/lib/admin-objects';
import { money, recordDate } from '@/components/admin/ObjectRelatedRecords';

export default function OrderDetailClient({ order, returnTo }: { order: AdminOrder; returnTo: string }) {
  const router = useRouter();
  const busy = useRef(false);
  const [loading, setLoading] = useState<string | null>(null);
  const actions = orderActions(order);
  const returnLabel = returnTo.startsWith('/admin/cashbox') ? '金庫の出納記録へ戻る' : returnTo.startsWith('/admin/users') ? '利用者の詳細へ戻る' : returnTo.startsWith('/admin/items') ? '商品の詳細へ戻る' : '取引一覧へ戻る';
  const act = async (action: typeof actions[number]) => {
    if (busy.current) return;
    if (!confirm(`${order.user?.name ?? '利用者'} の ${recordDate(order.created_at)} の注文（${money(order.total_amount)}）を「${action.label}」にしますか？`)) return;
    busy.current = true;
    setLoading(action.id);
    try {
      const response = await fetch(action.endpoint, { method: action.method });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error ?? '更新に失敗しました');
      toast.success(action.success);
      router.refresh();
    } catch (error: any) { toast.error(error.message); }
    finally { busy.current = false; setLoading(null); }
  };
  return <div className="mx-auto max-w-3xl space-y-5">
    <nav className="flex flex-wrap gap-3 text-sm text-sky-300" aria-label="注文のナビゲーション"><Link prefetch={false} href={returnTo} className="underline underline-offset-4">← {returnLabel}</Link><span className="text-gray-600">/</span><span className="text-gray-300">注文詳細</span></nav>
    <header className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="font-display text-2xl font-bold text-white">注文詳細</h1><p className="mt-2 text-sm text-gray-400">{recordDate(order.created_at)}</p></div><span className="rounded-full bg-gray-800 px-4 py-2 text-sm text-gray-200">{orderStateLabel(order)}</span></header>
    <section className="rounded-2xl border border-gray-800 bg-gray-900 p-5" aria-label="注文の内容">
      <div className="flex flex-wrap items-center gap-x-12 gap-y-4"><div><p className="text-xs text-gray-400">購入者</p><Link prefetch={false} href={`/admin/users?user=${order.user_id}&view=orders`} className="mt-2 inline-block text-lg font-semibold text-sky-300 underline underline-offset-4">{order.user?.name ?? '利用者の詳細'} →</Link></div><div className="text-left"><p className="text-xs text-gray-400">注文金額</p><p className="mt-2 font-mono text-2xl text-white">{money(order.total_amount)}</p></div></div>
      <ul className="mt-5 divide-y divide-gray-800 border-y border-gray-800">{order.order_items?.map((item, index) => <li key={item.id ?? index} className="grid max-w-xl grid-cols-[minmax(0,16rem)_auto] justify-start gap-6 py-4"><div className="min-w-0">{item.item_id ? <Link prefetch={false} href={`/admin/items?item=${item.item_id}`} className="text-sky-300 underline underline-offset-4">{item.item_name} →</Link> : <span className="text-gray-200">{item.item_name}</span>}<p className="mt-1 text-sm text-gray-400">{typeof item.item_price === 'number' ? `${money(item.item_price)} × ` : '数量 '}{item.quantity}</p></div>{typeof item.subtotal === 'number' && <span className="shrink-0 font-mono text-white">{money(item.subtotal)}</span>}</li>)}</ul>
      <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2"><div><dt className="text-gray-400">支払い方法</dt><dd className="mt-1 text-white">{paymentLabel(order.payment_method)}{order.deferred_settlement_method ? `（${paymentLabel(order.deferred_settlement_method)}で精算）` : ''}</dd></div><div><dt className="text-gray-400">利用ポイント</dt><dd className="mt-1 text-white">{order.points_used ?? 0}pt</dd></div><div><dt className="text-gray-400">精算日時</dt><dd className="mt-1 text-white">{order.settled_at ? recordDate(order.settled_at) : '—'}</dd></div><div><dt className="text-gray-400">注文ID</dt><dd className="mt-1 break-all font-mono text-xs text-gray-300">{order.id}</dd></div></dl>
      <Link prefetch={false} href={`/admin/transactions?user=${order.user_id}`} className="mt-5 inline-block text-sm text-sky-300 underline underline-offset-4">この利用者の取引・未精算をすべて見る →</Link>
    </section>
    <section className="rounded-2xl border border-gray-800 bg-gray-900 p-5" aria-label="この注文の操作"><h2 className="font-semibold text-white">この注文の操作</h2><p className="mt-2 text-sm text-gray-400">注文内容と実際の受領状況を確認してから操作してください。</p><div className="mt-4 flex flex-wrap gap-3">{actions.map((action) => <button key={action.id} type="button" disabled={Boolean(loading)} onClick={() => act(action)} className={`rounded-xl px-4 py-3 text-sm disabled:opacity-40 ${action.danger ? 'border border-red-900 text-red-300 hover:bg-red-500/10' : 'bg-white text-gray-950 hover:bg-gray-200'}`}>{loading === action.id ? '処理中…' : action.label}</button>)}</div>{actions.length === 0 && <p className="mt-3 text-sm text-gray-400">この状態の注文に対する操作はありません。</p>}</section>
  </div>;
}
