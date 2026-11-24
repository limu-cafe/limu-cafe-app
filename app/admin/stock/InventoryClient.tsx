'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useObjectSelection } from '@/components/admin/ObjectWorkspace';
import { matchesStocktake, parseStocktake, readStockCount,
  type StocktakeInput, type StocktakeItem, type StocktakeResult } from '@/lib/stocktake';
import { RestockSubmission } from '@/lib/restock';
import { normalizeIntegerInput } from '@/lib/numeric-input';
import StocktakeHistory, { StocktakeReceipt, stockDifference } from './StocktakeHistory';

type CountDraft = { expectedStock: number; value: string };
const columns = 'sm:grid-cols-[minmax(0,1fr)_5rem_6rem_4rem]';
const fieldClass = 'w-full min-w-0 rounded-md border border-gray-700 bg-gray-800 px-2 py-2 text-center text-sm tabular-nums text-white focus:border-sky-400 focus:outline-hidden disabled:opacity-50';
const primary = 'rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-gray-950 disabled:opacity-40';
const secondary = 'rounded-lg border border-gray-700 px-3 py-2 text-sm text-gray-200 hover:bg-gray-800 disabled:opacity-40';
const formatNumber = (value: number) => value.toLocaleString('ja-JP');

export default function InventoryClient({ items }: { items: StocktakeItem[] }) {
  const router = useRouter();
  const selectedItem = useSearchParams().get('item');
  const [view, selectView] = useObjectSelection('view');
  const [search, setSearch] = useState('');
  const [drafts, setDrafts] = useState<Record<string, CountDraft>>({});
  const [review, setReview] = useState<StocktakeInput | null>(null);
  const [saved, setSaved] = useState<StocktakeResult | null>(null);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState('');
  const busy = useRef(false);
  const requests = useRef(new RestockSubmission());
  const rowsRef = useRef<HTMLUListElement>(null);
  const targetInput = useRef<HTMLInputElement>(null);
  const locked = loading || uncertain;

  useEffect(() => { targetInput.current?.focus(); }, [selectedItem]);

  const rows = items.map(item => {
    const draft = drafts[item.id];
    const value = draft?.value ?? '';
    const actual = readStockCount(value);
    return { item, draft, value, actual, stale: draft !== undefined && draft.expectedStock !== item.stock };
  });
  const completed = rows.filter(row => typeof row.actual === 'number');
  const changed = completed.filter(row => row.actual !== row.item.stock);
  const missing = Object.keys(drafts).filter(id => !items.some(item => item.id === id));
  const invalid = rows.filter(row => row.actual === null).length;
  const visible = rows.filter(({ item }) => item.name.toLowerCase().includes(search.trim().toLowerCase()));

  function edit(item: StocktakeItem, value: string) {
    if (busy.current || uncertain) return;
    setDrafts(current => {
      const previous = current[item.id];
      const next = { ...current };
      if (!value.trim()) delete next[item.id];
      else next[item.id] = { expectedStock: previous?.expectedStock ?? item.stock, value };
      return next;
    });
    setError('');
  }

  function reset(ids: string[]) {
    if (busy.current || uncertain) return;
    setDrafts(current => {
      const next = { ...current };
      for (const id of ids) delete next[id];
      return next;
    });
    setError('');
  }

  function nextField(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
    const inputs = Array.from(rowsRef.current?.querySelectorAll<HTMLInputElement>('[data-count-field]:not(:disabled)') ?? []);
    event.preventDefault();
    const next = inputs[inputs.indexOf(event.currentTarget) + 1];
    next?.focus();
    next?.select();
  }

  function showReview() {
    if (missing.length) { setError('棚卸の対象外になった商品の入力を確認してください'); return; }
    const invalidRow = rows.find(row => row.actual === null);
    if (invalidRow) { setError(`${invalidRow.item.name}の実数は0以上の整数を入力してください`); return; }
    const stale = rows.find(row => row.stale);
    if (stale) { setError(`${stale.item.name}の在庫が変わりました。実物を数え直してください`); return; }
    try {
      setReview(parseStocktake({
        note,
        entries: completed.flatMap(({ item, draft, actual }) => typeof actual === 'number' && draft
          ? [{ item_id: item.id, expected_stock: draft.expectedStock, actual_count: actual }] : []),
      }));
      setError('');
    } catch (cause) { setError((cause as Error).message); }
  }

  async function save() {
    if (!review || busy.current) return;
    const input = { ...review, note: note.trim() };
    const requestId = requests.current.requestId(input);
    busy.current = true;
    setLoading(true);
    setError('');
    let status = 0;
    try {
      const response = await fetch('/api/admin/stocktakes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...input, request_id: requestId }),
      });
      status = response.status;
      const result = await response.json().catch(() => null);
      if (!response.ok || !matchesStocktake(result, input, requestId)) {
        throw Error(result?.error ?? '棚卸の結果を確認できませんでした。同じ内容で再試行できます');
      }
      requests.current.complete(input);
      setSaved(result);
      setReview(null);
      setDrafts({});
      setNote('');
      setUncertain(false);
      router.refresh();
    } catch (cause) {
      if (uncertain || status === 0 || status < 400 || status >= 500 && status !== 503) setUncertain(true);
      else if (status === 409) { setReview(null); router.refresh(); }
      setError((cause as Error).message);
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }

  return <div className="mx-auto max-w-2xl space-y-4">
    <header><h1 className="font-display text-2xl font-bold text-white">在庫・棚卸</h1></header>
    <nav aria-label="在庫の表示" className="flex gap-5 border-b border-gray-800 text-sm">
      {([{ id: null, label: '在庫一覧' }, { id: 'history', label: '棚卸履歴' }] as const).map(tab =>
        <button key={tab.label} type="button" aria-pressed={(view === 'history' ? view : null) === tab.id}
          disabled={loading} onClick={() => selectView(tab.id, { record: null, historyPage: null })}
          className={`border-b-2 px-1 py-3 ${(view === 'history' ? view : null) === tab.id ? 'border-sky-300 text-white' : 'border-transparent text-gray-400'}`}>
          {tab.label}
        </button>)}
    </nav>
    {view === 'history' ? <StocktakeHistory/> : saved ? <div className="max-w-2xl space-y-4 rounded-xl border border-gray-700 bg-gray-900 p-5">
      <p role="status" className="text-sm text-emerald-300">棚卸を記録しました</p>
      <StocktakeReceipt record={saved}/>
      <button type="button" className={secondary} onClick={() => setSaved(null)}>在庫一覧へ戻る</button>
    </div> : review ? <section aria-label="棚卸の確認" className="max-w-2xl space-y-4 rounded-xl border border-gray-700 bg-gray-900 p-5">
      <div><h2 className="text-lg font-semibold text-white">棚卸の確認</h2>
        <p className="mt-1 text-sm text-gray-400">{review.entries.length}商品を記録し、差がある在庫を実数に合わせます。</p></div>
      <ul className="divide-y divide-gray-800 border-y border-gray-800">{review.entries.map(row => {
        const actual = row.actual_count;
        return <li key={row.item_id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm text-white">
          <span>{items.find(item => item.id === row.item_id)?.name}</span>
          <span className="tabular-nums">{formatNumber(row.expected_stock)} → {formatNumber(actual)} <span className="ml-2 text-gray-400">({stockDifference(actual - row.expected_stock)})</span></span>
        </li>;
      })}</ul>
      <label className="block text-sm text-gray-300">棚卸メモ（任意）
        <textarea rows={2} maxLength={2000} className="mt-2 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white"
          placeholder="理由や確認したこと" value={note} disabled={locked} onChange={event => setNote(event.target.value)}/>
      </label>
      {error && <p role="alert" className="text-sm text-amber-300">{error}</p>}
      <div className="flex flex-wrap gap-3">
        <button type="button" className={secondary} disabled={locked} onClick={() => { setReview(null); setError(''); }}>入力に戻る</button>
        <button type="button" className={primary} disabled={loading} onClick={() => void save()}>
          {loading ? '記録中…' : uncertain ? '同じ内容で再試行' : '棚卸を記録する'}
        </button>
      </div>
    </section> : <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <input type="search" aria-label="商品名で検索" placeholder="商品名で検索" value={search} onChange={event => setSearch(event.target.value)}
          className="w-full max-w-xs rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white"/>
        <p className="text-xs text-gray-400">販売単位で数えた個数を入力。空欄は対象外です。</p>
      </div>
      {missing.length > 0 && <p className="flex flex-wrap items-center gap-2 text-sm text-amber-300">
        棚卸対象から外れた商品が{missing.length}件あります。
        <button type="button" className="underline" onClick={() => reset(missing)}>対象外の入力を取り消す</button>
      </p>}
      <section aria-label="商品の在庫と実数" className="overflow-hidden rounded-xl border border-gray-700 bg-gray-900">
        <div aria-hidden className={`hidden gap-3 border-b border-gray-700 bg-gray-950/50 px-4 py-3 text-xs font-medium text-gray-400 sm:grid ${columns}`}>
          <span>商品</span><span className="text-right">帳簿在庫</span><span>実数（個）</span><span className="text-right">差（個）</span>
        </div>
        <ul ref={rowsRef} className="divide-y divide-gray-800">
          {visible.map(({ item, value, actual, stale }) => <li key={item.id}
            className={`grid grid-cols-3 items-start gap-x-3 gap-y-3 px-4 py-3 ${columns} ${item.id === selectedItem ? 'bg-sky-950/25' : ''}`}>
            <div className="col-span-3 min-w-0 py-1 sm:col-span-1">
              <Link prefetch={false} className="wrap-break-word text-sm font-semibold text-white underline decoration-gray-600 underline-offset-4 hover:text-sky-300"
                href={`/admin/items?item=${item.id}&view=stock`}>{item.name}</Link>
              {!item.is_available && <p className="mt-1 text-xs text-gray-400">非表示</p>}
            </div>
            <div className="order-1 py-1 text-right text-sm tabular-nums text-gray-300 sm:order-0 sm:py-2">
              <span className="block text-xs text-gray-400 sm:sr-only">帳簿在庫</span>{formatNumber(item.stock)}
            </div>
            <label className="order-2 min-w-0 sm:order-0">
              <span className="mb-1 block text-xs text-gray-400 sm:sr-only">実数（個）</span>
              <input ref={item.id === selectedItem ? targetInput : undefined} type="text" autoComplete="off" inputMode="numeric" data-count-field
                aria-label={`${item.name}の実数`} aria-invalid={actual === null || undefined} value={value} placeholder="—" disabled={stale}
                onFocus={event => event.currentTarget.select()} onKeyDown={nextField}
                onChange={event => edit(item, event.target.value)}
                onBlur={event => {
                  const normalized = normalizeIntegerInput(event.target.value);
                  if (normalized !== value) edit(item, normalized);
                }} className={`${fieldClass} aria-invalid:border-amber-300`}/>
            </label>
            <div className={`order-3 py-1 text-right text-sm tabular-nums sm:order-0 sm:py-2 ${typeof actual === 'number' && !stale && actual !== item.stock ? 'font-semibold text-amber-300' : 'text-gray-400'}`}>
              <span className="block text-xs text-gray-400 sm:sr-only">差（個）</span>
              <output aria-label={`${item.name}の差`}>{typeof actual !== 'number' || stale ? '—' : stockDifference(actual - item.stock)}</output>
            </div>
            {stale && <div className="order-last col-span-full flex flex-wrap items-center gap-2 text-xs text-amber-300">
              帳簿在庫が変わりました。<button type="button" className="underline" onClick={() => reset([item.id])}>この商品を数え直す</button>
            </div>}
          </li>)}
        </ul>
        {!visible.length && <p className="p-5 text-sm text-gray-400">該当する商品はありません。</p>}
      </section>
      <footer className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t border-gray-700 bg-gray-950 py-3">
        <div>{error && <p role="alert" className="mb-1 text-sm text-amber-300">{error}</p>}
          <p className="text-sm text-gray-300">入力済み {completed.length}商品 <span className="ml-2 text-gray-400">差あり {changed.length}{invalid > 0 && ` · 要確認 ${invalid}`}</span></p>
        </div>
        <button type="button" className={primary} disabled={completed.length === 0 && invalid === 0} onClick={showReview}>棚卸内容を確認</button>
      </footer>
    </>}
  </div>;
}
