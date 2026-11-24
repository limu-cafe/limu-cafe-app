'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import ObjectWorkspace, { useObjectSelection } from '@/components/admin/ObjectWorkspace';
import { recordDate } from '@/components/admin/ObjectRelatedRecords';
import type { StocktakeResult, StocktakeSummary } from '@/lib/stocktake';

const number = (value: number) => value.toLocaleString('ja-JP');
export function stockDifference(value: number) {
  return value === 0 ? '±0' : `${value < 0 ? '−' : '＋'}${number(Math.abs(value))}`;
}

export function StocktakeReceipt({ record }: { record: StocktakeResult }) {
  return <section aria-label="棚卸の記録" className="space-y-3">
    <div>
      <h2 className="text-base font-semibold text-white">{recordDate(record.created_at)} の棚卸</h2>
      <p className="mt-1 text-xs text-gray-400">{record.actor_name} · {record.item_count}商品 · 差あり {record.changed_count}</p>
    </div>
    {record.note && <p className="whitespace-pre-wrap wrap-break-word text-sm text-gray-300">{record.note}</p>}
    <ul className="divide-y divide-gray-800 border-t border-gray-800">
      {record.entries.map(row => <li key={row.item_id} className="space-y-1.5 py-3 text-sm">
        <div className="flex flex-wrap justify-between gap-2">
          <Link prefetch={false} href={`/admin/items?item=${row.item_id}&view=stock`}
            className="wrap-break-word font-medium text-sky-300 underline underline-offset-4">{row.item_name}</Link>
          <span className="tabular-nums text-white">{number(row.stock_before)} → {number(row.stock_after)}
            <span className="ml-2 text-gray-400">({stockDifference(row.stock_after - row.stock_before)})</span>
          </span>
        </div>
      </li>)}
    </ul>
  </section>;
}

async function readHistory(path: string, signal: AbortSignal) {
  const response = await fetch(path, { signal, cache: 'no-store' });
  const payload = await response.json();
  if (!response.ok) throw Error(payload.error ?? '棚卸の記録を取得できませんでした');
  return payload;
}

export default function StocktakeHistory() {
  const query = useSearchParams();
  const value = Number(query.get('historyPage') ?? 1);
  const page = Number.isSafeInteger(value) && value >= 1 && value <= 10_000 ? value : 1;
  const [, selectPage] = useObjectSelection('historyPage');
  const [selected, select] = useObjectSelection('record');
  const [list, setList] = useState<{ page: number; rows: StocktakeSummary[]; hasMore: boolean } | null>(null);
  const [record, setRecord] = useState<StocktakeResult | null>(null);
  const [listError, setListError] = useState('');
  const [detailError, setDetailError] = useState('');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const request = new AbortController();
    setListError('');
    setList(null);
    readHistory(`/api/admin/stocktakes?page=${page}`, request.signal).then(data => {
      if (!request.signal.aborted) setList({ page, rows: data.records, hasMore: data.hasMore });
    }).catch(error => { if (!request.signal.aborted) setListError(error.message); });
    return () => request.abort();
  }, [page, retry]);

  useEffect(() => {
    setRecord(null);
    setDetailError('');
    if (!selected) return;
    const request = new AbortController();
    readHistory(`/api/admin/stocktakes?id=${encodeURIComponent(selected)}`, request.signal).then(data => {
      if (!request.signal.aborted) setRecord(data.record);
    }).catch(error => { if (!request.signal.aborted) setDetailError(error.message); });
    return () => request.abort();
  }, [selected, retry]);

  const errorMessage = (error: string) => <p role="alert" className="p-3 text-sm text-amber-300">
    {error} <button type="button" onClick={() => setRetry(previous => previous + 1)} className="underline">再読み込み</button>
  </p>;
  const shown = list?.page === page ? list : null;
  return <ObjectWorkspace label="棚卸の明細" selected={selected !== null} onClose={() => select(null)}
    collection={<section aria-label="棚卸履歴" className="overflow-hidden rounded-xl border border-gray-700 bg-gray-900">
      {listError ? errorMessage(listError) : !shown ? <p className="p-4 text-sm text-gray-400">棚卸履歴を読み込み中…</p> : <>
        <ul className="divide-y divide-gray-800">{shown.rows.map(row => <li key={row.request_id}>
          <button type="button" aria-pressed={selected === row.request_id} onClick={() => select(row.request_id)}
            className="flex w-full flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3 text-left hover:bg-gray-800">
            <span className="text-sm text-white">{recordDate(row.created_at)}</span>
            <span className="text-xs text-gray-400">{row.actor_name} · {row.item_count}商品 · 差あり {row.changed_count}</span>
          </button>
        </li>)}</ul>
        {!shown.rows.length && <p className="p-4 text-sm text-gray-400">棚卸の記録はまだありません。</p>}
        {(page > 1 || shown.hasMore) && <nav aria-label="棚卸履歴のページ" className="flex justify-between border-t border-gray-800 px-4 py-3 text-xs text-gray-300">
          <button type="button" className="disabled:invisible" disabled={page <= 1} onClick={() => selectPage(String(page - 1), { record: null })}>新しい記録へ</button>
          <span>{page}ページ</span>
          <button type="button" className="disabled:invisible" disabled={!shown.hasMore} onClick={() => selectPage(String(page + 1), { record: null })}>古い記録へ</button>
        </nav>}
      </>}
    </section>}
    detail={detailError ? errorMessage(detailError) : record?.request_id === selected ? <StocktakeReceipt record={record}/>
      : <p className="text-sm text-gray-400">棚卸の明細を読み込み中…</p>}/>
}
