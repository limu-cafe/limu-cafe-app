'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDown, ArrowUp, GripVertical } from 'lucide-react';
import toast from 'react-hot-toast';
import type { Item } from '@/types';
import { moveItemId } from '@/lib/item-order';

export type ItemOrderSettings = { revision: number; available: boolean; verified: boolean };
type Props = ItemOrderSettings & {
  items: Pick<Item, 'id' | 'name' | 'is_available' | 'category'>[];
  onClose: () => void;
};

export default function ItemOrderEditor({ items, revision, available, verified, onClose }: Props) {
  const router = useRouter();
  const [draft, setDraft] = useState(() => ({ ids: items.map(item => item.id), revision }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const savingRef = useRef(false);
  const baselineIds = useRef(draft.ids);
  const draggedItem = useRef<string | null>(null);
  const itemMap = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const dirty = draft.ids.some((id, i) => id !== baselineIds.current[i]);
  const catalogChanged = draft.ids.length !== items.length || draft.ids.some(id => !itemMap.has(id));
  const locked = saving || catalogChanged || !available || !verified;

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const cancel = () => {
    if (dirty && !window.confirm('保存していない表示順を破棄しますか？')) return;
    onClose();
  };
  const move = (id: string, position: number) => {
    if (locked) return;
    setDraft(current => ({ ...current, ids: moveItemId(current.ids, id, position) }));
  };
  const save = async () => {
    if (!dirty || locked || savingRef.current) return;
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
      onClose();
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '通信に失敗しました。もう一度お試しください');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return <section className="space-y-4 rounded-2xl border border-gray-800 bg-gray-900 p-4" aria-label="商品表示順">
    <div>
      <h2 className="font-semibold text-white">商品表示順</h2>
      <p className="mt-1 text-sm text-gray-400">ドラッグ・上下ボタン・位置指定で並べ替えます。保存すると利用者の商品一覧に反映されます。</p>
    </div>
    {catalogChanged && <p role="alert" className="text-sm text-amber-300">商品が追加または削除されました。変更をキャンセルして、最新の商品一覧からやり直してください。</p>}
    <ol className="divide-y divide-gray-800 rounded-lg border border-gray-800 bg-gray-950" aria-label="保存する商品順">
      {draft.ids.map((id, index) => {
        const item = itemMap.get(id);
        return <li key={id} className="flex flex-wrap items-center gap-3 px-3 py-2"
          onDragOver={event => {
            if (!draggedItem.current || locked) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
          }}
          onDrop={event => {
            if (!draggedItem.current || locked) return;
            event.preventDefault();
            move(draggedItem.current, index);
            draggedItem.current = null;
          }}>
          <span aria-hidden="true" title="ドラッグで移動" draggable={!locked}
            className="hidden cursor-grab touch-none text-gray-400 sm:inline-flex"
            onDragStart={event => {
              draggedItem.current = id;
              event.dataTransfer.effectAllowed = 'move';
              event.dataTransfer.setData('text/plain', id);
            }}
            onDragEnd={() => { draggedItem.current = null; }}>
            <GripVertical size={18} />
          </span>
          <span className="w-7 font-mono text-sm text-gray-500">{index + 1}</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-white">{item?.name ?? '削除された商品'}</p>
            <p className="text-xs text-gray-500">{item?.category?.name ?? '未分類'}{item && !item.is_available ? ' ・非表示' : ''}</p>
          </div>
          <div className="flex items-center gap-1">
            <label className="sr-only" htmlFor={`position-${id}`}>{item?.name} の表示位置</label>
            <select id={`position-${id}`} value={index} onChange={(event) => move(id, Number(event.target.value))}
              disabled={locked} className="rounded-lg border border-gray-700 bg-gray-800 p-2 text-sm text-white">
              {draft.ids.map((_, position) => <option key={position} value={position}>{position + 1}番目</option>)}
            </select>
            <button type="button" aria-label={`${item?.name} を上へ`} onClick={() => move(id, index - 1)}
              disabled={locked || index === 0} className="rounded-lg p-2 text-white hover:bg-gray-800 disabled:opacity-25"><ArrowUp size={18} /></button>
            <button type="button" aria-label={`${item?.name} を下へ`} onClick={() => move(id, index + 1)}
              disabled={locked || index === draft.ids.length - 1} className="rounded-lg p-2 text-white hover:bg-gray-800 disabled:opacity-25"><ArrowDown size={18} /></button>
          </div>
        </li>;
      })}
    </ol>
    {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
    <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-3 border-t border-gray-800 bg-gray-900 py-2">
      {dirty && <span className="text-sm text-amber-300">未保存の変更があります</span>}
      <button type="button" onClick={cancel} disabled={saving} className="rounded-xl border border-gray-700 px-4 py-2 text-sm text-gray-200 disabled:opacity-40">キャンセル</button>
      <button type="button" onClick={save} disabled={locked || !dirty}
        className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-gray-950 disabled:opacity-40">{saving ? '保存中...' : 'この順序で保存'}</button>
    </div>
  </section>;
}
