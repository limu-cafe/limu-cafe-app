'use client';

import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import type { User } from '@/types';
import { describeCashCollectionBreakdown, type CashCollectionEntry } from '@/lib/cash-collection';
import ObjectWorkspace, { useObjectSelection } from '@/components/admin/ObjectWorkspace';
import ObjectRelatedRecords, { money, recordDate } from '@/components/admin/ObjectRelatedRecords';
import UserPointAdjustment from '@/components/admin/UserPointAdjustment';
import ObjectDetailNavigation, { useObjectDetailView } from '@/components/admin/ObjectDetailNavigation';

type Status = 'all' | 'active' | 'pending' | 'inactive';
const statusOf = (user: User) => !user.is_active ? 'inactive' : !user.is_approved ? 'pending' : 'active';
const labels = { all: 'すべて', active: '承認済み', pending: '承認待ち', inactive: '無効化済み' };
const buttonClass = 'rounded-lg border border-gray-700 px-3 py-2 text-sm text-gray-200 hover:bg-gray-800 disabled:opacity-40';

export default function UsersClient({ users, cashCollectionsByUserId }: { users: User[]; cashCollectionsByUserId: Record<string, CashCollectionEntry> }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedId, select] = useObjectSelection('user');
  const [detailView, setDetailView] = useObjectDetailView(['overview', 'orders', 'charges', 'points', 'subscriptions']);
  const [loading, setLoading] = useState(false);
  const busy = useRef(false);
  const [addingBalance, setAddingBalance] = useState(false);
  const [adjustingPoints, setAdjustingPoints] = useState(false);
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState<Status>(searchParams.get('pending') === '1' ? 'pending' : 'all');
  const [search, setSearch] = useState('');
  const selected = users.find((user) => user.id === selectedId);
  const collection = selected ? cashCollectionsByUserId[selected.id] : null;
  const visible = users.filter((user) => (status === 'all' || statusOf(user) === status) && `${user.name} ${user.email ?? ''}`.toLowerCase().includes(search.trim().toLowerCase()));
  useEffect(() => { setAddingBalance(false); setAdjustingPoints(false); setAmount(''); }, [selectedId, detailView]);

  const run = async (request: () => Promise<Response>, success: string) => {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    try {
      const response = await request();
      if (!response.ok) throw new Error((await response.json()).error ?? '更新できませんでした');
      toast.success(success);
      setAddingBalance(false);
      setAmount('');
      router.refresh();
    } catch (error: any) { toast.error(error.message); }
    finally { busy.current = false; setLoading(false); }
  };
  const addBalance = () => {
    if (!selected || !amount || Number(amount) <= 0) { toast.error('金額を入力してください'); return; }
    const value = Number(amount);
    if (!confirm(`${selected.name} の残高に ${money(value)} を追加しますか？`)) return;
    return run(() => fetch(`/api/admin/users/${selected.id}/balance`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: value }) }), `${money(value)} を追加しました`);
  };

  return <div className={`space-y-5 ${selected ? '' : 'mx-auto max-w-3xl'}`}>
    <header><h1 className="font-display text-2xl font-bold text-white">利用者</h1><p className="mt-1 text-sm text-gray-400">利用者を選ぶと、残高・取引・ポイント・契約を確認できます。</p></header>
    <div className={`${selected ? 'hidden xl:flex' : 'flex'} flex-wrap items-center gap-3 rounded-2xl border border-gray-800 bg-gray-900 p-4`}>
      <input aria-label="ユーザーを検索" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="名前・メールで検索" className="min-w-0 flex-1 rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-sm text-white"/>
      <div className="flex flex-wrap gap-2">{(['all', 'active', 'pending', 'inactive'] as const).map((value) => <button key={value} type="button" aria-pressed={status === value} onClick={() => setStatus(value)} className={`rounded-full px-3 py-2 text-xs ${status === value ? 'bg-white text-gray-950' : 'bg-gray-800 text-gray-300'}`}>{labels[value]} {users.filter((user) => value === 'all' || statusOf(user) === value).length}</button>)}</div>
    </div>
    <p className={`${selected ? 'hidden xl:block' : ''} text-sm text-gray-400`}>{visible.length} / {users.length}人</p>
    {selectedId && !selected && <p role="status" className="text-sm text-amber-300">この利用者は見つかりません。一覧から選び直してください。</p>}
    <ObjectWorkspace label="利用者詳細" selected={Boolean(selected)} onClose={() => select(null)} collection={
      <div className="overflow-x-auto rounded-2xl border border-gray-800 bg-gray-900"><table className="w-full text-sm">
        <thead><tr className="border-b border-gray-800 text-left text-xs text-gray-400"><th className="px-4 py-3">利用者</th><th className="px-3 py-3">残高</th><th className="px-3 py-3">要回収</th></tr></thead>
        <tbody>{visible.map((user) => <tr key={user.id} onClick={(event) => { if (!loading && !(event.target as HTMLElement).closest('button, a, input, select')) select(user.id); }} className={`cursor-pointer border-b border-gray-800/60 hover:bg-white/5 ${selectedId === user.id ? 'bg-white/5' : ''}`}>
          <td className="px-4 py-4"><div className="flex items-center gap-3">{user.avatar_url && <img src={user.avatar_url} alt="" className="h-8 w-8 shrink-0 rounded-full"/>}<div><button type="button" aria-pressed={selectedId === user.id} disabled={loading} onClick={() => select(user.id)} className="text-left font-medium text-white underline decoration-gray-600 underline-offset-4 disabled:opacity-50 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-sky-400">{user.name}</button><p className={`mt-1 text-xs ${statusOf(user) === 'pending' ? 'text-amber-300' : 'text-gray-400'}`}>{labels[statusOf(user)]}</p></div></div></td>
          <td className="whitespace-nowrap px-3 py-3 font-mono text-emerald-300">{money(user.balance)}</td><td className="whitespace-nowrap px-3 py-3 font-mono text-amber-300">{cashCollectionsByUserId[user.id] ? money(cashCollectionsByUserId[user.id].totalAmount) : '—'}</td>
        </tr>)}</tbody>
      </table>{visible.length === 0 && <p className="p-8 text-center text-sm text-gray-400">条件に合う利用者がいません</p>}</div>
    } detail={selected && <>
      <div className="flex items-center gap-3">{selected.avatar_url && <img src={selected.avatar_url} alt="" className="h-12 w-12 rounded-full"/>}<div className="min-w-0"><h2 className="wrap-break-word text-xl font-bold text-white">{selected.name}</h2><p className="mt-1 text-xs text-gray-400">{labels[statusOf(selected)]} · {selected.role === 'admin' ? '管理者' : 'メンバー'}</p></div></div>
      <ObjectDetailNavigation value={detailView} onChange={setDetailView} options={[{id:'overview',label:'基本情報'},{id:'orders',label:'注文'},{id:'charges',label:'残高・チャージ'},{id:'points',label:'ポイント'},{id:'subscriptions',label:'契約'}]}/>
      {detailView === 'overview' && <>
        <p className="mt-4 break-all text-sm text-gray-400">{selected.email ?? 'メール未登録'}</p><p className="mt-1 text-xs text-gray-400">登録 {recordDate(selected.created_at)}</p>
        <dl className="mt-5 grid grid-cols-2 gap-4"><div><dt className="text-xs text-gray-400">前払い残高</dt><dd className="mt-2"><button type="button" onClick={() => setDetailView('charges')} className="font-mono text-emerald-300 underline underline-offset-4">{money(selected.balance)}</button></dd></div><div><dt className="text-xs text-gray-400">ポイント</dt><dd className="mt-2"><button type="button" onClick={() => setDetailView('points')} className="font-mono text-sky-300 underline underline-offset-4">{selected.points_balance.toLocaleString()}pt</button></dd></div></dl>
        {collection && collection.totalAmount > 0 && <section className="mt-5 border-l-2 border-amber-500 bg-amber-500/5 px-4 py-3" aria-label="この利用者の未精算"><p className="text-sm text-amber-200">要回収 {money(collection.totalAmount)}</p><p className="mt-1 text-xs leading-relaxed text-gray-400">{describeCashCollectionBreakdown(collection)}</p><Link prefetch={false} href={`/admin/transactions?user=${selected.id}&state=pending`} className="mt-3 inline-block text-sm text-amber-300 underline underline-offset-4">この人の未精算取引を確認 →</Link></section>}
        {!selected.is_approved && selected.is_active && <button disabled={loading} onClick={() => run(() => fetch(`/api/admin/users/${selected.id}/approve`, { method: 'POST' }), '承認しました')} className={`mt-4 ${buttonClass}`}>この利用者を承認する</button>}
      {selected.is_active && <details className="mt-4 text-xs text-gray-400"><summary className="cursor-pointer">その他の操作</summary><button disabled={loading} onClick={() => { if (confirm(`${selected.name} を無効化しますか？（退会・卒業処理）`)) void run(() => fetch(`/api/admin/users/${selected.id}/deactivate`, { method: 'POST' }), '無効化しました'); }} className="mt-3 rounded-lg border border-red-900 px-3 py-2 text-red-300 disabled:opacity-40">利用者を無効化</button></details>}
      </>}
      {detailView === 'charges' && <section className="mt-5" aria-label="この利用者の残高"><p className="text-xs text-gray-400">前払い残高</p><p className="mt-2 font-mono text-2xl text-emerald-300">{money(selected.balance)}</p><button type="button" disabled={loading} onClick={() => setAddingBalance(value => !value)} className={`mt-4 ${buttonClass}`}>残高を追加</button>
      {addingBalance && <form onSubmit={(event) => { event.preventDefault(); void addBalance(); }} className="mt-3 rounded-xl border border-gray-700 p-3"><label htmlFor="user-balance-amount" className="text-sm text-gray-300">{selected.name} の残高への追加額</label><div className="mt-2 flex gap-2"><input id="user-balance-amount" type="number" min={1} step={1} required disabled={loading} value={amount} onChange={(event) => setAmount(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white"/><button disabled={loading} className="rounded-lg bg-white px-3 py-2 text-sm text-gray-950 disabled:opacity-40">追加する</button></div></form>}
      <ObjectRelatedRecords key={`${selected.id}:charges`} kind="users" id={selected.id} selectedView="charges" revision={selected.updated_at}/></section>}
      {detailView === 'orders' && <><Link prefetch={false} href={`/admin/transactions?user=${selected.id}`} className="mt-5 inline-block text-sm text-sky-300 underline underline-offset-4">この人の注文・チャージを横断して見る →</Link><ObjectRelatedRecords key={`${selected.id}:orders`} kind="users" id={selected.id} selectedView="orders" revision={selected.updated_at}/></>}
      {detailView === 'points' && <><p className="mt-5 text-sm text-gray-400">現在のポイント <b className="ml-2 font-mono text-sky-300">{selected.points_balance.toLocaleString()}pt</b></p><button type="button" onClick={()=>setAdjustingPoints(value=>!value)} className={`mt-4 ${buttonClass}`}>{adjustingPoints?'調整を閉じる':'ポイントを調整'}</button>{adjustingPoints && <UserPointAdjustment key={selected.id} user={selected}/>}<ObjectRelatedRecords key={`${selected.id}:points`} kind="users" id={selected.id} selectedView="points" revision={selected.updated_at}/></>}
      {detailView === 'subscriptions' && <ObjectRelatedRecords key={`${selected.id}:subscriptions`} kind="users" id={selected.id} selectedView="subscriptions" revision={selected.updated_at}/>}

    </>}/>
  </div>;
}
