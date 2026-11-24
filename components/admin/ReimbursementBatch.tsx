'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { money, recordDate } from './ObjectRelatedRecords';
import { reimbursementPayerId, reimbursementTitle, type ReimbursementPerson } from '@/lib/reimbursements';

export type AdvanceReceipt = { operation_id: string; recipient_id: string | null; recipient_name: string; amount: number; created_at?: string; items: { id: string; title: string; amount: number; created_at: string; vendor?: string | null }[] };

export default function ReimbursementBatch({ person, disabled = false, onBusyChange, onRecorded }: {
  person: ReimbursementPerson; disabled?: boolean; onBusyChange: (busy: boolean) => void; onRecorded: (receipt: AdvanceReceipt) => void;
}) {
  const router = useRouter();
  const eligible = person.records.filter(run => reimbursementPayerId(run) === person.id && run.payment_source === 'personal_advance' && run.reimbursement_status === 'pending_reimbursement');
  const [ids, setIds] = useState(() => eligible.map(run => run.id));
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false), [done, setDone] = useState(false), [error, setError] = useState('');
  const busy = useRef(false), operation = useRef<{ signature: string; id: string } | null>(null);
  const selected = eligible.filter(run => ids.includes(run.id));
  const total = selected.reduce((sum, run) => sum + run.total_amount, 0);
  const locked = disabled || loading || done;
  async function submit() {
    if (busy.current || locked || !confirmed || !selected.length || selected.length > 10000) return;
    const runs = selected.map(run => ({ id: run.id, expected_amount: run.total_amount })).sort((a, b) => a.id.localeCompare(b.id));
    const signature = JSON.stringify([person.id, runs]);
    if (operation.current?.signature !== signature) operation.current = { signature, id: crypto.randomUUID() };
    busy.current = true; setLoading(true); onBusyChange(true); setError('');
    try {
      const response = await fetch(`/api/admin/users/${person.id}/reimbursements`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ operation_id: operation.current.id, runs, confirm_cash_paid: true }) });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ok || result.operation_id !== operation.current.id || result.recipient_id !== person.id || result.count !== selected.length || result.amount !== total) throw new Error(result?.error ?? '結果を確認できませんでした。同じ内容で再試行するか、履歴を再読み込みしてください。');
      setDone(true);
      onRecorded({ operation_id: result.operation_id, recipient_id: person.id, recipient_name: person.name, amount: total, created_at: result.created_at,
        items: selected.map(run => ({ id: run.id, title: reimbursementTitle(run), amount: run.total_amount, created_at: run.created_at, vendor: run.vendor })) });
      router.refresh();
    } catch (cause) { setError((cause as Error).message); }
    finally { busy.current = false; setLoading(false); onBusyChange(false); }
  }
  return <section aria-label={`${person.name}への立替精算`} className="space-y-5">
    <header><h2 className="text-xl font-bold text-white">{person.name}</h2><p className="mt-2 text-sm text-gray-400">未精算 {eligible.length}件 · {money(person.total)}</p></header>
      <label className="flex items-center gap-2 text-sm text-gray-300"><input type="checkbox" aria-label={`${person.name}の未精算をすべて選択`} checked={selected.length === eligible.length && selected.length > 0} disabled={locked} onChange={event => { setIds(event.target.checked ? eligible.map(run => run.id) : []); setConfirmed(false); }}/>すべて選択 <span className="text-gray-500">必要な場合だけ対象を外してください</span></label>
      <ul className="max-h-96 divide-y divide-gray-800 overflow-y-auto">{eligible.map(run => <li key={run.id}><label className="flex cursor-pointer items-start gap-3 py-3 text-sm"><input type="checkbox" aria-label={`${reimbursementTitle(run)} ${money(run.total_amount)}を精算対象にする`} checked={ids.includes(run.id)} disabled={locked} onChange={event => { setIds(current => event.target.checked ? [...current, run.id] : current.filter(id => id !== run.id)); setConfirmed(false); }} className="mt-1"/><span className="min-w-0 flex-1"><span className="block wrap-break-word text-white">{reimbursementTitle(run)}</span><small className="mt-1 block leading-relaxed text-gray-400">{run.vendor || '購入先未登録'}<br/>{run.purchased_on?`購入 ${run.purchased_on}`:`購入日不明 · 登録 ${recordDate(run.created_at)}`}</small></span><span className="shrink-0 font-mono text-white">{money(run.total_amount)}</span></label></li>)}</ul>
    <div className="border-t border-gray-700 pt-4"><p className="text-xs text-gray-400">{`選択中 ${selected.length}件 · まとめて返す金額`}</p><p className="mt-2 font-mono text-3xl text-white">{money(total)}</p></div>
    {<label className="flex items-start gap-3 text-sm leading-relaxed text-white"><input type="checkbox" aria-label="合計額の現金を立替者に渡したことを確認" checked={confirmed} disabled={locked} onChange={event => setConfirmed(event.target.checked)} className="mt-1"/>{person.name} に合計 {money(total)} の現金を渡しました</label>}
    {error && <p role="alert" className="text-sm text-amber-300">{error} <button type="button" disabled={locked} onClick={() => router.refresh()} className="underline">履歴を再読み込み</button></p>}
    <button type="button" disabled={locked || !confirmed || !selected.length || selected.length > 10000} onClick={() => void submit()} className="rounded-lg bg-white px-4 py-3 text-sm text-gray-950 disabled:opacity-40">{loading ? '記録中…' : `${money(total)}の精算を記録`}</button>
  </section>;
}
