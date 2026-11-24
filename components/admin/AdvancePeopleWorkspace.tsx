'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import ObjectWorkspace, { useObjectSelection } from './ObjectWorkspace';
import ReimbursementBatch, { type AdvanceReceipt } from './ReimbursementBatch';
import { money, recordDate } from './ObjectRelatedRecords';
import { groupPendingAdvances, reimbursementPayerId, reimbursementTitle, type ReimbursementRecord } from '@/lib/reimbursements';

export default function AdvancePeopleWorkspace({ records, filters, keyword, disabled, onBusyChange, onRecorded, receipt }: {
  records: ReimbursementRecord[]; filters: ReactNode; keyword: string; disabled: boolean;
  onBusyChange: (busy: boolean) => void; onRecorded: (ids: string[]) => void; receipt?: AdvanceReceipt | null;
}) {
  const [personId, choosePerson] = useObjectSelection('person');
  const [runId] = useObjectSelection('run');
  const { people, unassigned } = groupPendingAdvances(records);
  const linked = records.find(run => run.id === runId);
  const [done, setDone] = useState<AdvanceReceipt | null>(null);
  const result = done ?? receipt;
  const selectedId = personId ?? (linked ? reimbursementPayerId(linked) : null) ?? result?.recipient_id;
  const person = people.find(person => person.id === selectedId);
  const visible = people.filter(person => `${person.name} ${person.records.map(run => `${reimbursementTitle(run)} ${run.vendor ?? ''}`).join(' ')}`.toLowerCase().includes(keyword));
  const showResult = result && (selectedId === result.recipient_id || !selectedId);
  const choose = (id: string) => { if (!disabled) { setDone(null); choosePerson(id, { run: null, receipt: null, state: 'pending' }); } };
  return <ObjectWorkspace label="立替者への精算" selected={Boolean(person || showResult)} onClose={() => { if (!disabled) { setDone(null); choosePerson(null, { run: null, receipt: null }); } }} collection={
    <section aria-label="未精算の立替者" className="overflow-hidden rounded-xl border border-gray-800 bg-gray-900">{filters}
      {visible.map(person => <button key={person.id} type="button" aria-label={`${person.name}の立替をまとめて確認`} aria-pressed={selectedId === person.id} disabled={disabled} onClick={() => choose(person.id)} className={`flex w-full items-center gap-4 border-b border-gray-800 px-4 py-4 text-left hover:bg-gray-800 disabled:opacity-40 ${selectedId === person.id ? 'bg-white/5' : ''}`}><span className="min-w-0 flex-1"><span className="block font-semibold text-white">{person.name}</span><small className="mt-2 block wrap-break-word leading-relaxed text-gray-400">{person.records.length}件 · {person.records.slice(0, 2).map(reimbursementTitle).join(' / ')}{person.records.length > 2 ? ' ほか' : ''}</small></span><span className="shrink-0 font-mono text-lg text-white">{money(person.total)}</span></button>)}
      {!visible.length && <p className="p-6 text-sm text-gray-400">{keyword ? '検索条件に合う立替者はいません。' : '未精算の立替はありません。'}</p>}
      {unassigned.length > 0 && <div className="space-y-3 border-t border-gray-700 p-4"><p className="text-sm text-amber-300">立替者の確認が必要な記録 {unassigned.length}件</p>{unassigned.map(run => <Link key={run.id} href={`/admin/reimbursements?state=all&run=${run.id}`} className="block text-sm text-sky-300 underline">{reimbursementTitle(run)} · {money(run.total_amount)}</Link>)}</div>}
    </section>
  } detail={showResult ? <section role="status" className="space-y-4"><h2 className="text-xl font-bold text-white">{result.recipient_name}への精算を記録しました</h2><p className="font-mono text-3xl text-emerald-300">{money(result.amount)}</p><p className="text-sm text-gray-400">{result.items.length}件をまとめて精算済みにしました。{result.created_at && recordDate(result.created_at)}</p><ul className="divide-y divide-gray-800">{result.items.map(item => <li key={item.id} className="flex justify-between gap-4 py-3 text-sm"><Link href={`/admin/reimbursements?state=all&run=${item.id}`} className="min-w-0 wrap-break-word text-sky-300 underline">{item.title}</Link><span className="shrink-0 font-mono text-white">{money(item.amount)}</span></li>)}</ul>{people.length > 0 && <button type="button" onClick={() => choose(people[0].id)} className="rounded-lg border border-gray-600 px-3 py-2 text-sm text-white">次の立替者を確認 →</button>}</section>
    : person && <ReimbursementBatch key={`${person.id}:${person.records.map(run => `${run.id}:${run.total_amount}`).join(',')}`} person={person} disabled={disabled} onBusyChange={onBusyChange} onRecorded={receipt => { choosePerson(person.id, {run:null, receipt:receipt.operation_id, state:'pending'}); setDone(receipt); onRecorded(receipt.items.map(item => item.id)); }}/>} />;
}
