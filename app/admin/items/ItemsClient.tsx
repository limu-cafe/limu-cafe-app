'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useRouter, useSearchParams } from 'next/navigation';
import ObjectWorkspace, { useObjectSelection } from '@/components/admin/ObjectWorkspace';
import ProductRestock from '@/components/admin/ProductRestock';
import ObjectRelatedRecords from '@/components/admin/ObjectRelatedRecords';
import ObjectDetailNavigation, { useObjectDetailView } from '@/components/admin/ObjectDetailNavigation';
import type { Category, Item } from '@/types';
import { isItemLowStock } from '@/lib/item-stock';
import { Product } from '@/lib/domain/product';
import { RestockSubmission } from '@/lib/restock';

interface Props {
  items: Item[];
  categories: Category[];
  orderEditor?: ReactNode;
}

type StatusFilter = 'all' | 'visible' | 'low-stock' | 'hidden';

const EMPTY_FORM = {
  name: '',
  english_name: '',
  description: '',
  price: '',
  category_id: '',
  stock_alert_threshold: '3',
  image_url: '',
  is_available: true,
  is_unlimited_stock: false,
};

const FIELD_CLASS =
  'w-full rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:outline-none';

export default function ItemsClient({ items, categories, orderEditor }: Props) {
  const router = useRouter();
  const query=useSearchParams();
  const [localItems, setLocalItems] = useState<Item[]>(items);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(query.get('state')==='low-stock'?'low-stock':'all');
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [selectedId, setSelectedId] = useObjectSelection('item');
  const selected = localItems.find((item) => item.id === selectedId);
  const [detailView, setDetailView] = useObjectDetailView(['overview', 'stock', 'orders']);
  const busy = useRef(false);
  const restockRequests = useRef(new RestockSubmission());
  const prefillName = query.get('prefill');
  const editDialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLocalItems(items);
  }, [items]);

  useEffect(() => {
    if (!showForm) return;
    const previous = document.activeElement as HTMLElement | null;
    const controls = () => editDialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])');
    controls()?.[0]?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy.current) setShowForm(false);
      if (event.key === 'Tab') {
        const elements = controls();
        if (!elements?.length) return;
        const first = elements[0], last = elements[elements.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); previous?.focus(); };
  }, [showForm]);

  const attachCategory = (item: Item) => ({
    ...item,
    category: categories.find((category) => category.id === item.category_id),
  });

  useEffect(()=>{if(prefillName){setEditing(null);setForm({...EMPTY_FORM,name:prefillName});setShowForm(true);}},[prefillName]);
  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  };

  const openEdit = (item: Item) => {
    setEditing(item);
    setForm({
      name: item.name,
      english_name: item.english_name ?? '',
      description: item.description ?? '',
      price: String(item.price),
      category_id: item.category_id ?? '',
      stock_alert_threshold: String(item.stock_alert_threshold),
      image_url: item.image_url ?? '',
      is_available: item.is_available,
      is_unlimited_stock: item.is_unlimited_stock,
    });
    setShowForm(true);
  };

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.price) {
      toast.error('商品名と価格を入力してください');
      return;
    }

    if (busy.current) return;
    busy.current = true;
    setLoading('item-form');
    try {
      const body = {
        name: form.name.trim(),
        english_name: form.english_name.trim() || null,
        description: form.description.trim() || null,
        price: Number(form.price),
        category_id: form.category_id || null,
        ...(editing ? { expected_updated_at: editing.updated_at } : {}),
        stock_alert_threshold: Number(form.stock_alert_threshold || 0),
        image_url: form.image_url.trim() || null,
        is_available: form.is_available,
        is_unlimited_stock: form.is_unlimited_stock,
      };

      const res = await fetch(editing ? `/api/items/${editing.id}` : '/api/items', {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? '保存に失敗しました');

      const savedItem = attachCategory(payload);
      setLocalItems((current) =>
        editing
          ? current.map((item) => (item.id === savedItem.id ? savedItem : item))
          : [savedItem, ...current]
      );
      setShowForm(false);
      toast.success(editing ? '商品情報を更新しました' : '商品を追加しました');
      router.refresh();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      busy.current = false;
      setLoading(null);
    }
  };

  const handleDelete = async (item: Item) => {
    if (!confirm(`「${item.name}」を削除しますか？`)) return;

    if (busy.current) return;
    busy.current = true;
    setLoading(`delete:${item.id}`);
    try {
      const res = await fetch(`/api/items/${item.id}`, { method: 'DELETE' });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error ?? '削除に失敗しました');

      setLocalItems((current) => current.filter((currentItem) => currentItem.id !== item.id));
      toast.success('削除しました');
      router.refresh();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      busy.current = false;
      setLoading(null);
    }
  };

  const handleToggleAvailability = async (item: Item) => {
    if (busy.current) return;
    busy.current = true;
    setLoading(`toggle:${item.id}`);
    try {
      const res = await fetch(`/api/items/${item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_available: !item.is_available, expected_updated_at: item.updated_at }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? '更新に失敗しました');

      const updatedItem = attachCategory(payload);
      setLocalItems((current) =>
        current.map((currentItem) => (currentItem.id === updatedItem.id ? updatedItem : currentItem))
      );
      toast.success(updatedItem.is_available ? '表示しました' : '非表示にしました');
      router.refresh();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      busy.current = false;
      setLoading(null);
    }
  };

  const statusOptions = [
    { id: 'all' as const, label: 'すべて' },
    { id: 'visible' as const, label: '表示中' },
    { id: 'low-stock' as const, label: '要補充' },
    { id: 'hidden' as const, label: '非表示' },
  ];

  const filteredItems = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return localItems.filter((item) => {
      const matchesSearch =
        !keyword ||
        item.name.toLowerCase().includes(keyword) ||
        (item.english_name ?? '').toLowerCase().includes(keyword);

      if (!matchesSearch || (categoryId && item.category_id !== categoryId)) return false;

      switch (statusFilter) {
        case 'visible':
          return item.is_available;
        case 'low-stock':
          return isItemLowStock(item);
        case 'hidden':
          return !item.is_available;
        default:
          return true;
      }
    });
  }, [localItems, search, statusFilter, categoryId]);

  return (
    <div className={`space-y-5 ${selected ? '' : 'mx-auto max-w-3xl'}`}>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">商品</h1>
          <p className="mt-1 text-sm text-gray-400">商品を選ぶと、在庫・履歴・関連注文を確認できます。</p>
        </div>
        <button
          disabled={Boolean(loading)}
          onClick={openCreate}
          className={`${selected ? 'hidden xl:inline-flex' : 'inline-flex'} items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-gray-950 transition hover:bg-gray-100`}
        >
          <Plus size={16} />
          新商品追加
        </button>
      </div>

      {orderEditor && <details className={`${selected ? 'hidden xl:block' : ''} rounded-2xl border border-gray-800 bg-gray-900`}><summary className="cursor-pointer px-4 py-3 text-sm text-gray-300">商品一覧の表示順</summary><div className="p-3 pt-0">{orderEditor}</div></details>}

      <div className={`${selected ? 'hidden xl:flex' : 'flex'} flex-col gap-3 rounded-2xl border border-gray-800 bg-gray-900 p-4 md:flex-row md:items-center`}>
        <input
          type="text"
          aria-label="商品名で検索"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="商品名で検索"
          className="w-full rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:outline-none"
        />
        <select aria-label="カテゴリで絞り込む" value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className="rounded-xl border border-gray-700 bg-gray-800 px-3 py-3 text-sm text-white"><option value="">全カテゴリ</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select>
        <div className="flex shrink-0 flex-wrap gap-2">
          {statusOptions.map((option) => (
            <button
              key={option.id}
              aria-pressed={statusFilter === option.id}
              onClick={() => setStatusFilter(option.id)}
              className={`rounded-full px-3 py-2 text-xs font-medium transition-colors ${
                statusFilter === option.id
                  ? 'bg-white text-gray-950'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <p className={`${selected ? 'hidden xl:block' : ''} text-sm text-gray-400`}>{filteredItems.length} / {localItems.length}商品</p>
      {selectedId && !selected && <p role="status" className="text-sm text-amber-300">この商品は見つかりません。一覧から選び直してください。</p>}
      <ObjectWorkspace selected={Boolean(selected)} label="商品詳細" onClose={() => setSelectedId(null)} detail={selected && <section aria-label="選択した商品">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">{selected.image_url && <img src={selected.image_url} alt="" className="h-16 w-16 shrink-0 rounded-xl bg-gray-800 object-contain"/>}<div><h2 className="break-words text-xl font-bold text-white">{selected.name}</h2><p className="mt-1 text-sm text-gray-400">{new Product(selected).status} · ¥{selected.price.toLocaleString()} · {selected.category?.name ?? 'カテゴリ未設定'}</p></div></div>
        </div>
        <ObjectDetailNavigation value={detailView} onChange={setDetailView} options={[{id:'overview',label:'商品情報'},{id:'stock',label:'在庫・入荷'},{id:'orders',label:'購入履歴'}]}/>
        {detailView === 'overview' && <>
        {selected.description && <p className="mt-3 whitespace-pre-wrap text-sm text-gray-300">{selected.description}</p>}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button disabled={Boolean(loading)} onClick={() => openEdit(selected)} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm text-gray-950 disabled:opacity-50"><Pencil size={15}/>商品情報を編集</button>
          <button disabled={Boolean(loading)} onClick={() => handleToggleAvailability(selected)} className="rounded-xl border border-gray-600 px-4 py-2 text-sm text-white disabled:opacity-50">{selected.is_available ? '非表示にする' : '表示する'}</button>

        </div>
        <section className="mt-5 border-t border-gray-800 pt-4"><h3 className="text-sm text-gray-400">在庫</h3><p className="mt-2 font-mono text-lg text-white">{selected.is_unlimited_stock ? '在庫管理なし' : `${selected.stock} 個`}</p>{isItemLowStock(selected) && <button type="button" onClick={() => setDetailView('stock')} className="mt-3 text-sm text-amber-300 underline underline-offset-4">要補充 · 在庫と入荷記録を確認 →</button>}</section>
        <details className="mt-5 text-xs text-gray-400"><summary className="cursor-pointer">その他の操作</summary><p className="my-2">販売を止める場合は「非表示」を利用できます。取引に使った商品は削除できません。</p><button disabled={Boolean(loading)} onClick={() => handleDelete(selected)} className="inline-flex items-center gap-2 rounded-lg border border-red-900 px-3 py-2 text-red-300 disabled:opacity-50"><Trash2 size={14}/>商品を削除</button></details>
        </>}
        {detailView === 'stock' && <>
          <ProductRestock key={selected.id} item={selected} submission={restockRequests.current}/>
          <ObjectRelatedRecords key={`${selected.id}:stock`} kind="items" id={selected.id} selectedView="stock" revision={selected.updated_at}/>
        </>}
        {detailView === 'orders' && <ObjectRelatedRecords key={`${selected.id}:orders`} kind="items" id={selected.id} selectedView="orders" revision={selected.updated_at}/>}

      </section>} collection={
      <div className="overflow-x-auto rounded-2xl border border-gray-800 bg-gray-900">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-gray-800 text-left text-xs text-gray-500"><th className="px-4 py-3">商品</th><th className="px-3 py-3">価格</th><th className="px-3 py-3">在庫・状態</th></tr></thead>
          <tbody>{filteredItems.map((item) => <tr key={item.id} onClick={(event) => { if (!(event.target as HTMLElement).closest('button, a, input, select')) setSelectedId(item.id); }} className={`cursor-pointer border-b border-gray-800/60 hover:bg-white/5 ${selectedId === item.id ? 'bg-white/5' : ''}`}>
            <td className="px-4 py-3"><div className="flex items-center gap-3">{item.image_url && <img src={item.image_url} alt="" className="h-10 w-10 shrink-0 rounded-lg bg-gray-800 object-contain"/>}<div><button type="button" aria-pressed={selectedId === item.id} onClick={() => setSelectedId(item.id)} className="text-left font-medium text-white underline decoration-gray-600 underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400">{item.name}</button><p className="mt-1 text-xs text-gray-500">{item.category?.icon} {item.category?.name ?? '未設定'}</p></div></div></td>
            <td className="whitespace-nowrap px-3 py-3 font-mono text-white">¥{item.price.toLocaleString()}</td>
            <td className="px-3 py-3"><p className="font-mono text-white">{item.is_unlimited_stock ? '∞' : item.stock}</p><p className={`text-xs ${isItemLowStock(item) ? 'text-amber-300' : 'text-gray-400'}`}>{new Product(item).status}</p></td>
          </tr>)}</tbody>
        </table>
        {filteredItems.length === 0 && <div className="px-6 py-12 text-center text-sm text-gray-500">条件に合う商品がありません</div>}
      </div>
      }/>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div ref={editDialog} role="dialog" aria-modal="true" aria-label={editing ? "商品情報編集" : "新商品追加"} className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-gray-800 bg-gray-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-2xl font-bold text-white">
                {editing ? '商品情報編集' : '新商品追加'}
              </h2>
              <button
                onClick={() => setShowForm(false)}
                className="rounded-full p-2 text-gray-400 transition hover:bg-gray-800 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <Field label="商品名">
                <input
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  className={FIELD_CLASS}
                />
              </Field>
              <Field label="英語名">
                <input
                  value={form.english_name}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, english_name: event.target.value }))
                  }
                  className={FIELD_CLASS}
                />
              </Field>
              <Field label="カテゴリ">
                <select
                  value={form.category_id}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, category_id: event.target.value }))
                  }
                  className={FIELD_CLASS}
                >
                  <option value="">未設定</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.icon ?? '📦'} {category.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="価格">
                <input
                  type="number"
                  min={0}
                  value={form.price}
                  onChange={(event) => setForm((current) => ({ ...current, price: event.target.value }))}
                  className={FIELD_CLASS}
                />
              </Field>
              <Field label="警戒在庫">
                <input
                  type="number"
                  min={0}
                  value={form.stock_alert_threshold}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, stock_alert_threshold: event.target.value }))
                  }
                  disabled={form.is_unlimited_stock}
                  className={`${FIELD_CLASS} disabled:cursor-not-allowed disabled:opacity-40`}
                />
              </Field>
              <Field label="画像URL">
                <input
                  value={form.image_url}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, image_url: event.target.value }))
                  }
                  className={FIELD_CLASS}
                />
              </Field>
              <Field label="説明" className="md:col-span-2">
                <textarea
                  rows={4}
                  value={form.description}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, description: event.target.value }))
                  }
                  className={`${FIELD_CLASS} resize-none`}
                />
              </Field>
              <label className="inline-flex items-center gap-2 text-sm text-gray-300 md:col-span-2">
                <input
                  type="checkbox"
                  checked={form.is_available}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, is_available: event.target.checked }))
                  }
                  className="rounded border-gray-700 bg-gray-900 text-white"
                />
                ユーザー画面に表示する
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-gray-300 md:col-span-2">
                <input
                  type="checkbox"
                  checked={form.is_unlimited_stock}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, is_unlimited_stock: event.target.checked }))
                  }
                  className="rounded border-gray-700 bg-gray-900 text-white"
                />
                在庫を管理しない（無限在庫）
              </label>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                onClick={() => setShowForm(false)}
                className="rounded-xl border border-gray-700 px-4 py-2 text-sm font-medium text-gray-300 transition hover:bg-gray-800"
              >
                キャンセル
              </button>
              <button
                onClick={handleSubmit}
                disabled={loading === 'item-form'}
                className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-gray-950 transition hover:bg-gray-100 disabled:opacity-50"
              >
                {loading === 'item-form' ? '保存中...' : editing ? '更新する' : '追加する'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  children,
  className = '',
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`space-y-2 ${className}`}>
      <span className="block text-sm text-gray-400">{label}</span>
      {children}
    </label>
  );
}
