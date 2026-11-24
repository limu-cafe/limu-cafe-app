import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { moveVisibleItemId } from '@/lib/item-order';

export type ItemOrderSettings = { revision: number; available: boolean; verified: boolean };
type OrderDraft = { ids: string[]; baseline: string[]; revision: number };

export function useItemOrder(ids: string[], settings: ItemOrderSettings | undefined, refresh: () => void) {
  const [draft, setDraft] = useState<OrderDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const savingRef = useRef(false);
  const revision = settings?.revision ?? 0;
  const dirty = Boolean(draft?.ids.some((id, index) => id !== draft.baseline[index]));
  const active = dirty || (draft && draft.revision > revision) ? draft : null;
  const catalogChanged = Boolean(active && (
    active.ids.length !== ids.length || ids.some(id => !active.baseline.includes(id))
  ));
  const enabled = Boolean(settings?.available && settings.verified) && !catalogChanged && !saving;

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  function move(id: string, position: number, visibleIds: string[]) {
    if (!enabled || savingRef.current) return;
    const base = active ?? { ids, baseline: ids, revision };
    const next = moveVisibleItemId(base.ids, visibleIds, id, position);
    if (next === base.ids) return;
    setDraft({ ...base, ids: next });
    setError('');
  }

  function discard() {
    if (savingRef.current || !draft) return;
    setDraft({ ...draft, ids: draft.baseline });
    setError('');
    refresh();
  }

  async function save() {
    if (!dirty || !enabled || !active || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/admin/items/order', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemIds: active.ids, expectedRevision: active.revision }),
      });
      const result = await response.json();
      if (!response.ok) throw Error(result.error ?? '表示順を保存できませんでした');
      if (!Number.isInteger(result.revision) || result.revision <= active.revision) {
        throw Error('保存結果を確認できませんでした。商品一覧を確認してください');
      }
      setDraft({ ids: active.ids, baseline: active.ids, revision: result.revision });
      toast.success('商品表示順を保存しました');
      refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '表示順の保存に失敗しました');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return {
    ids: active?.ids ?? ids, enabled, dirty, saving, move, discard, save,
    error: catalogChanged ? '商品が追加または削除されました。変更を取り消して最新の一覧を表示してください。' : error,
  };
}
