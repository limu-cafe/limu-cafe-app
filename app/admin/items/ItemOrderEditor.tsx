'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowDown, ArrowUp } from 'lucide-react';
import toast from 'react-hot-toast';
import type { Item } from '@/types';
import { moveItemId } from '@/lib/item-order';

type Props = { items: Item[]; revision: number; available: boolean; verified: boolean };

export default function ItemOrderEditor({ items, revision, available, verified }: Props) {
  const router = useRouter();
  const [draft, setDraft] = useState<{ ids: string[]; revision: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const savingRef = useRef(false);
  const baselineIds = useRef<string[]>([]);
  const itemMap = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const dirty = Boolean(draft && draft.ids.some((id, i) => id !== baselineIds.current[i]));
  const catalogChanged = Boolean(draft && (
    draft.ids.length !== items.length || draft.ids.some((id) => !itemMap.has(id))
  ));

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const startEditing = () => {
    baselineIds.current = items.map((item) => item.id);
    setDraft({ ids: [...baselineIds.current], revision });
    setError('');
  };
  const cancel = () => {
    if (dirty && !window.confirm('保存していない表示順を破棄しますか？')) return;
    setDraft(null);
    setError('');
  };
  const move = (id: string, position: number) => {
    setDraft((current) => current ? { ...current, ids: moveItemId(current.ids, id, position) } : null);
  };
  const save = async () => {
    if (!draft || !dirty || catalogChanged || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/admin/items/order', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemIds: draft.ids, expectedRevision: draft.revision }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? '表示順を保存できませんでした');
      toast.success('商品表示順を保存しました');
      setDraft(null);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '通信に失敗しました。もう一度お試しください');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return <section className="space-y-4 rounded-2xl border border-gray-800 bg-gray-900 p-4" aria-label="商品表示順">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="font-semibold text-white">商品表示順</h2>
        <p className="mt-1 text-sm text-gray-400">利用者の商品一覧・カテゴリ内の表示順を設定します。</p>
      </div>
      {!draft && <button type="button" onClick={startEditing} disabled={!available || !verified || items.length < 2}
        className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-gray-950 disabled:opacity-40">表示順を編集</button>}
    </div>
    {!available ? <p role="status" className="text-sm text-amber-300">表示順の設定を現在利用できません。商品一覧はこれまでの順序で表示されます。</p>
      : !verified && <Link href="/admin/password?next=%2Fadmin%2Fitems" className="text-sm text-sky-300 underline">表示順を変更するには、管理者ログインを更新してください</Link>}
    {draft && <>
      <p className="text-sm text-gray-400">上下ボタンか位置の選択で並び替え、内容を確認して保存してください。非表示の商品は利用者には表示されません。保存後に追加した商品は、並び替え済みの商品の後ろに表示されます。</p>
      {catalogChanged && <p role="alert" className="text-sm text-amber-300">商品が追加または削除されました。変更をキャンセルして、最新の商品一覧からやり直してください。</p>}
      <ol className="max-h-[60vh] space-y-2 overflow-y-auto" aria-label="保存する商品順">
        {draft.ids.map((id, index) => {
          const item = itemMap.get(id);
          return <li key={id} className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-800 bg-gray-950 px-3 py-3">
            <span className="w-8 font-mono text-sm text-gray-500">{index + 1}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-white">{item?.name ?? '削除された商品'}</p>
              <p className="text-xs text-gray-500">{item?.category?.name ?? '未分類'}{item && !item.is_available ? ' ・非表示' : ''}</p>
            </div>
            <div className="flex items-center gap-1">
              <label className="sr-only" htmlFor={`position-${id}`}>{item?.name} の表示位置</label>
              <select id={`position-${id}`} value={index} onChange={(event) => move(id, Number(event.target.value))}
                disabled={saving || catalogChanged} className="rounded-lg border border-gray-700 bg-gray-800 p-2 text-sm text-white">
                {draft.ids.map((_, position) => <option key={position} value={position}>{position + 1}番目</option>)}
              </select>
              <button type="button" aria-label={`${item?.name} を上へ`} onClick={() => move(id, index - 1)}
                disabled={saving || catalogChanged || index === 0} className="rounded-lg p-2 text-white hover:bg-gray-800 disabled:opacity-25"><ArrowUp size={18} /></button>
              <button type="button" aria-label={`${item?.name} を下へ`} onClick={() => move(id, index + 1)}
                disabled={saving || catalogChanged || index === draft.ids.length - 1} className="rounded-lg p-2 text-white hover:bg-gray-800 disabled:opacity-25"><ArrowDown size={18} /></button>
            </div>
          </li>;
        })}
      </ol>
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
      <div className="flex flex-wrap items-center justify-end gap-3">
        {dirty && <span className="text-sm text-amber-300">未保存の変更があります</span>}
        <button type="button" onClick={cancel} disabled={saving} className="rounded-xl border border-gray-700 px-4 py-2 text-sm text-gray-200 disabled:opacity-40">キャンセル</button>
        <button type="button" onClick={save} disabled={saving || !dirty || catalogChanged}
          className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-gray-950 disabled:opacity-40">{saving ? '保存中...' : 'この順序で保存'}</button>
      </div>
    </>}
  </section>;
}
