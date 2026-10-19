'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import type { AdminOrder } from '@/lib/admin-objects';
import { canPayOrderFromBalance, orderCashDue } from '@/lib/order-balance-payment';

const yen = (value: number) => `¥${value.toLocaleString()}`;
export default function OrderBalancePayment({ order, disabled = false, onBusyChange }: { order: AdminOrder; disabled?: boolean; onBusyChange?: (busy: boolean) => void }) {
  const router = useRouter();
  const busy = useRef(false);
  const [reviewing, setReviewing] = useState(false);
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  if (!canPayOrderFromBalance(order) || typeof order.user?.balance !== 'number') return null;
  const amount = orderCashDue(order), balance = order.user.balance;
  const enough = balance >= amount;
  const submit = async () => {
    if (busy.current || disabled || done || !confirmed || !reason.trim() || reason.trim().length > 300 || !enough) return;
    busy.current = true; setLoading(true); setError(''); onBusyChange?.(true);
    try {
      const response = await fetch(`/api/admin/orders/${order.id}/balance-payment`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expected_amount: amount, expected_balance: balance, confirm_unpaid: confirmed, reason: reason.trim() }) });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) throw new Error(payload?.error ?? '結果を確認できませんでした。注文を再読み込みしてください');
      setDone(true); setReviewing(false); toast.success(payload.already_paid ? 'この注文は残高精算済みです' : '利用者の残高から精算しました'); router.refresh();
    } catch (failure: any) { setError(failure.message); }
    finally { busy.current = false; setLoading(false); onBusyChange?.(false); }
  };
  if (done) return <p role="status" className="mt-4 text-emerald-300">この注文は残高精算済みです。最新の注文情報を読み込んでいます。</p>;
  if (!reviewing) return <button type="button" disabled={disabled} onClick={() => setReviewing(true)} className="mt-4 rounded-xl border border-sky-800 px-4 py-3 text-sm text-sky-200 disabled:opacity-40">利用者の残高から精算</button>;
  return <section aria-label="この注文の残高精算" className="mt-5 max-w-lg rounded-xl border border-sky-900 bg-gray-950 p-4">
    <h3 className="font-semibold text-white">この注文を残高から精算</h3>
    <p className="mt-2 text-sm text-gray-300">{order.user.name}さんの注文代を、チャージ済みの残高から支払います。</p>
    <dl className="mt-4 grid grid-cols-[auto_auto] justify-start gap-x-8 gap-y-2 text-sm"><dt className="text-gray-400">未精算額</dt><dd className="font-mono text-white">{yen(amount)}</dd><dt className="text-gray-400">精算前の残高</dt><dd className="font-mono text-white">{yen(balance)}</dd><dt className="text-gray-400">精算後の残高</dt><dd className="font-mono text-white">{enough ? yen(balance - amount) : '残高不足'}</dd></dl>
    <p className="mt-4 text-sm text-gray-400">現金の受領は記録しません。未払いのチャージ代は引き続き要回収に残ります。</p>
    {!enough && <p role="status" className="mt-3 text-sm text-amber-300">残高が{yen(amount - balance)}不足しています。利用者のチャージ状況を確認してください。</p>}
    <label className="mt-4 block text-sm text-gray-300">精算理由<textarea aria-label="精算理由" value={reason} maxLength={300} disabled={loading || disabled} onChange={e => setReason(e.target.value)} className="mt-2 w-full rounded-lg border border-gray-700 bg-gray-900 p-3 text-white" rows={2}/></label>
    <label className="mt-4 flex items-start gap-3 text-sm text-gray-300"><input type="checkbox" checked={confirmed} disabled={loading || disabled} onChange={e => setConfirmed(e.target.checked)} className="mt-1"/>本人に確認し、この注文の現金をまだ受け取っていないことを確認しました</label>
    {error && <p role="alert" className="mt-3 text-sm text-red-300">{error} <button type="button" disabled={loading} className="underline" onClick={() => router.refresh()}>注文を再読み込み</button></p>}
    <div className="mt-4 flex flex-wrap gap-3"><button type="button" disabled={loading || disabled || !enough || !confirmed || !reason.trim()} onClick={submit} className="rounded-lg bg-white px-4 py-3 text-sm text-gray-950 disabled:opacity-40">{loading ? '精算中…' : `${yen(amount)}を残高から精算する`}</button><button type="button" disabled={loading || disabled} onClick={() => { setReviewing(false); setConfirmed(false); setError(''); }} className="px-3 py-2 text-sm text-gray-300">戻る</button></div>
  </section>;
}
