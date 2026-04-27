'use client';

import { useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';
import type { Category, Item } from '@/types';

interface Props {
  items: Item[];
  categories: Category[];
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
};

const FIELD_CLASS =
  'w-full rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:outline-none';

export default function ItemsClient({ items, categories }: Props) {
  const router = useRouter();
  const [localItems, setLocalItems] = useState<Item[]>(items);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [stockInputs, setStockInputs] = useState<Record<string, string>>({});

  useEffect(() => {
    setLocalItems(items);
  }, [items]);

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
    });
    setShowForm(true);
  };

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.price) {
      toast.error('商品名と価格を入力してください');
      return;
    }

    setLoading('item-form');
    try {
      const body = {
        name: form.name.trim(),
        english_name: form.english_name.trim() || null,
        description: form.description.trim() || null,
        price: Number(form.price),
        category_id: form.category_id || null,
        stock: editing?.stock ?? 0,
        stock_alert_threshold: Number(form.stock_alert_threshold || 0),
        image_url: form.image_url.trim() || null,
        is_available: form.is_available,
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
      setLoading(null);
    }
  };

  const handleDelete = async (item: Item) => {
    if (!confirm(`「${item.name}」を削除しますか？`)) return;

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
      setLoading(null);
    }
  };

  const handleToggleAvailability = async (item: Item) => {
    setLoading(`toggle:${item.id}`);
    try {
      const res = await fetch(`/api/items/${item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_available: !item.is_available }),
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
      setLoading(null);
    }
  };

  const handleAddStock = async (item: Item) => {
    const quantity = Number(stockInputs[item.id] || 0);
    if (!quantity || quantity <= 0) {
      toast.error('追加数を入力してください');
      return;
    }

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

      if (!matchesSearch) return false;

      switch (statusFilter) {
        case 'visible':
          return item.is_available;
        case 'low-stock':
          return item.is_available && item.stock <= item.stock_alert_threshold;
        case 'hidden':
          return !item.is_available;
        default:
          return true;
      }
    });
  }, [localItems, search, statusFilter]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">商品管理</h1>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-gray-950 transition hover:bg-gray-100"
        >
          <Plus size={16} />
          新商品追加
        </button>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-gray-800 bg-gray-900 p-4 md:flex-row md:items-center">
        <input
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="商品名で検索"
          className="w-full rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:outline-none"
        />
        <div className="flex flex-wrap gap-2">
          {statusOptions.map((option) => (
            <button
              key={option.id}
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

      <div className="overflow-hidden rounded-2xl border border-gray-800 bg-gray-900">
        <table className="w-full min-w-[980px] text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-left text-xs text-gray-500">
              <th className="px-4 py-3 font-medium">商品</th>
              <th className="px-4 py-3 font-medium">カテゴリ</th>
              <th className="px-4 py-3 font-medium">価格</th>
              <th className="px-4 py-3 font-medium">在庫</th>
              <th className="px-4 py-3 font-medium">追加</th>
              <th className="px-4 py-3 font-medium">表示</th>
              <th className="px-4 py-3 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.map((item) => {
              const isLowStock = item.stock <= item.stock_alert_threshold;
              return (
                <tr key={item.id} className="border-b border-gray-800/60 align-top">
                  <td className="px-4 py-4">
                    <div className="space-y-1">
                      <p className="font-medium text-white">{item.name}</p>
                      {item.english_name && <p className="text-xs text-gray-500">{item.english_name}</p>}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-gray-300">
                    {item.category?.icon ?? '📦'} {item.category?.name ?? '未設定'}
                  </td>
                  <td className="px-4 py-4 font-mono text-white">¥{item.price.toLocaleString()}</td>
                  <td className="px-4 py-4">
                    <div className="space-y-1">
                      <p
                        className={`font-mono text-lg font-bold ${
                          item.stock === 0
                            ? 'text-red-400'
                            : isLowStock
                              ? 'text-amber-400'
                              : 'text-green-400'
                        }`}
                      >
                        {item.stock}
                      </p>
                      <p className="text-xs text-gray-500">警戒値 {item.stock_alert_threshold}</p>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        value={stockInputs[item.id] ?? ''}
                        onChange={(event) =>
                          setStockInputs((current) => ({
                            ...current,
                            [item.id]: event.target.value,
                          }))
                        }
                        placeholder="個数"
                        className="w-24 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white focus:outline-none"
                      />
                      <button
                        onClick={() => handleAddStock(item)}
                        disabled={loading === `stock:${item.id}`}
                        className="rounded-lg bg-white/10 px-3 py-2 text-xs font-medium text-white transition hover:bg-white/20 disabled:opacity-50"
                      >
                        {loading === `stock:${item.id}` ? '追加中...' : '在庫追加'}
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <button
                      onClick={() => handleToggleAvailability(item)}
                      disabled={loading === `toggle:${item.id}`}
                      className={`rounded-full px-3 py-1 text-xs font-medium ${
                        item.is_available
                          ? 'bg-green-500/15 text-green-300'
                          : 'bg-gray-700 text-gray-300'
                      }`}
                      title={item.is_available ? 'ユーザー画面に表示中' : 'ユーザー画面では非表示'}
                    >
                      {item.is_available ? '表示中' : '非表示'}
                    </button>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openEdit(item)}
                        className="rounded-lg p-2 text-gray-300 transition hover:bg-gray-800 hover:text-white"
                        title="編集"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        onClick={() => handleDelete(item)}
                        disabled={loading === `delete:${item.id}`}
                        className="rounded-lg p-2 text-gray-400 transition hover:bg-red-500/15 hover:text-red-300 disabled:opacity-50"
                        title="削除"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {filteredItems.length === 0 && (
          <div className="px-6 py-16 text-center text-sm text-gray-500">商品がありません</div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-2xl rounded-3xl border border-gray-800 bg-gray-900 p-6 shadow-2xl">
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
                  className={FIELD_CLASS}
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
