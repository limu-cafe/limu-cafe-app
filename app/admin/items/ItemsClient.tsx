'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';
import type { Category, Item } from '@/types';
import { isItemLowStock } from '@/lib/item-stock';
import { Product } from '@/lib/domain/product';

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
  const [localItems, setLocalItems] = useState<Item[]>(items);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = localItems.find((item) => item.id === selectedId);
  const busy = useRef(false);
  const detailPanel = useRef<HTMLElement>(null);
  const editDialog = useRef<HTMLDivElement>(null);
  const [stockInputs, setStockInputs] = useState<Record<string, string>>({});

  useEffect(() => {
    setLocalItems(items);
  }, [items]);

  useEffect(() => {
    if (selectedId) detailPanel.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [selectedId]);

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

  const handleAddStock = async (item: Item) => {
    if (item.is_unlimited_stock) {
      toast.error('在庫管理なしの商品には在庫追加できません');
      return;
    }
    const quantity = Number(stockInputs[item.id] || 0);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      toast.error('追加数を入力してください');
      return;
    }

    if (busy.current) return;
    busy.current = true;
    setLoading(`stock:${item.id}`);
    try {
      const res = await fetch('/api/admin/stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_id: item.id,
          quantity,
          note: '在庫追加',
          purchase: null,
        }),
      });

      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? '在庫追加に失敗しました');

      setLocalItems((current) =>
        current.map((currentItem) =>
          currentItem.id === item.id
            ? { ...currentItem, stock: currentItem.stock + quantity }
            : currentItem
        )
      );
      setStockInputs((current) => ({ ...current, [item.id]: '' }));
      toast.success(`${item.name} の在庫を追加しました`);
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
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">商品管理</h1>
        </div>
        <button
          disabled={Boolean(loading)}
          onClick={openCreate}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-gray-950 transition hover:bg-gray-100"
        >
          <Plus size={16} />
          新商品追加
        </button>
      </div>

      {orderEditor}

      <div className="flex flex-col gap-3 rounded-2xl border border-gray-800 bg-gray-900 p-4 md:flex-row md:items-center">
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

      <p className="text-sm text-gray-400">{filteredItems.length} / {localItems.length}商品 · 商品を選ぶと詳細と操作を表示します</p>
      {selected && <section ref={detailPanel} aria-label="選択した商品" className="rounded-2xl border border-gray-600 bg-gray-900 p-5">
        <div className="flex items-start justify-between gap-4">
          <div><h2 className="text-xl font-bold text-white">{selected.name}</h2><p className="mt-1 text-sm text-gray-400">{new Product(selected).status} · ¥{selected.price.toLocaleString()} · {selected.category?.name ?? 'カテゴリ未設定'}</p></div>
          <button type="button" aria-label="商品詳細を閉じる" onClick={() => setSelectedId(null)} className="rounded-lg px-3 py-2 text-gray-300">✕</button>
        </div>
        {selected.description && <p className="mt-3 whitespace-pre-wrap text-sm text-gray-300">{selected.description}</p>}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button disabled={Boolean(loading)} onClick={() => openEdit(selected)} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm text-gray-950 disabled:opacity-50"><Pencil size={15}/>商品情報を編集</button>
          <button disabled={Boolean(loading)} onClick={() => handleToggleAvailability(selected)} className="rounded-xl border border-gray-600 px-4 py-2 text-sm text-white disabled:opacity-50">{selected.is_available ? '非表示にする' : '表示する'}</button>
          {!selected.is_unlimited_stock && <div className="flex flex-wrap items-center gap-2"><span className="text-sm text-gray-300">現在庫 {selected.stock}</span><input aria-label={`${selected.name}の在庫追加数`} type="number" min={1} step={1} value={stockInputs[selected.id] ?? ''} onChange={(event) => setStockInputs((current) => ({ ...current, [selected.id]: event.target.value }))} placeholder="追加数" className="w-24 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white"/><button disabled={Boolean(loading)} onClick={() => handleAddStock(selected)} className="rounded-xl bg-white/10 px-4 py-2 text-sm text-white disabled:opacity-50">在庫追加</button></div>}
        </div>
        <details className="mt-5 text-xs text-gray-400"><summary className="cursor-pointer">その他の操作</summary><p className="my-2">販売を止める場合は「非表示」を利用できます。取引に使った商品は削除できません。</p><button disabled={Boolean(loading)} onClick={() => handleDelete(selected)} className="inline-flex items-center gap-2 rounded-lg border border-red-900 px-3 py-2 text-red-300 disabled:opacity-50"><Trash2 size={14}/>商品を削除</button></details>
      </section>}
      <div className="overflow-x-auto rounded-2xl border border-gray-800 bg-gray-900">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-gray-800 text-left text-xs text-gray-500"><th className="px-4 py-3">商品</th><th className="px-3 py-3">価格</th><th className="px-3 py-3">在庫・状態</th></tr></thead>
          <tbody>{filteredItems.map((item) => <tr key={item.id} className={`border-b border-gray-800/60 ${selectedId === item.id ? 'bg-white/5' : ''}`}>
            <td className="px-4 py-3"><button type="button" aria-pressed={selectedId === item.id} onClick={() => setSelectedId(item.id)} className="text-left font-medium text-white underline decoration-gray-600 underline-offset-4">{item.name}</button><p className="mt-1 text-xs text-gray-500">{item.category?.icon} {item.category?.name ?? '未設定'}</p></td>
            <td className="whitespace-nowrap px-3 py-3 font-mono text-white">¥{item.price.toLocaleString()}</td>
            <td className="px-3 py-3"><p className="font-mono text-white">{item.is_unlimited_stock ? '∞' : item.stock}</p><p className={`text-xs ${isItemLowStock(item) ? 'text-amber-300' : 'text-gray-400'}`}>{new Product(item).status}</p></td>
          </tr>)}</tbody>
        </table>
        {filteredItems.length === 0 && <div className="px-6 py-12 text-center text-sm text-gray-500">条件に合う商品がありません</div>}
      </div>

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
