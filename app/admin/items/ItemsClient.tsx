'use client';

import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';
import type { Item, Category, ItemShowcaseOverride } from '@/types';

interface Props { items: Item[]; categories: Category[]; }
type StatusFilter = 'all' | 'selling' | 'sold-out' | 'stopped' | 'low-stock';

const EMPTY_FORM = {
  name: '', english_name: '', description: '', price: '', category_id: '',
  stock: '', stock_alert_threshold: '3', image_url: '', is_available: true,
  popular_override: 'auto' as ItemShowcaseOverride,
  new_arrival_override: 'auto' as ItemShowcaseOverride,
};

const OVERRIDE_OPTIONS: { value: ItemShowcaseOverride; label: string }[] = [
  { value: 'auto', label: '自動' },
  { value: 'show', label: '表示' },
  { value: 'hide', label: '非表示' },
];

export default function ItemsClient({ items, categories }: Props) {
  const router = useRouter();
  const [localItems, setLocalItems] = useState<Item[]>(items);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  useEffect(() => {
    setLocalItems(items);
  }, [items]);

  const attachCategory = (item: Item) => ({
    ...item,
    category: categories.find((category) => category.id === item.category_id),
  });

  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); setShowForm(true); };
  const openEdit = (item: Item) => {
    setEditing(item);
    setForm({
      name: item.name, english_name: item.english_name ?? '', description: item.description ?? '',
      price: String(item.price), category_id: item.category_id ?? '',
      stock: String(item.stock), stock_alert_threshold: String(item.stock_alert_threshold),
      image_url: item.image_url ?? '', is_available: item.is_available,
      popular_override: item.popular_override,
      new_arrival_override: item.new_arrival_override,
    });
    setShowForm(true);
  };

  const handleSubmit = async () => {
    if (!form.name || !form.price) { toast.error('商品名と価格は必須です'); return; }
    setLoading(true);
    try {
      const body = {
        ...form,
        price: Number(form.price),
        stock: Number(form.stock),
        stock_alert_threshold: Number(form.stock_alert_threshold),
        category_id: form.category_id || null,
        image_url: form.image_url || null,
        english_name: form.english_name || null,
        description: form.description || null,
      };
      const res = await fetch(editing ? `/api/items/${editing.id}` : '/api/items', {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      const savedItem = attachCategory(await res.json());

      setLocalItems((current) => {
        if (editing) {
          return current.map((item) => (item.id === savedItem.id ? savedItem : item));
        }
        return [savedItem, ...current];
      });

      toast.success(editing ? '商品を更新しました' : '商品を登録しました');
      setShowForm(false);
      router.refresh();
    } catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`「${name}」を削除しますか？`)) return;
    const res = await fetch(`/api/items/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setLocalItems((current) => current.filter((item) => item.id !== id));
      toast.success('削除しました');
      router.refresh();
    }
    else toast.error('削除に失敗しました');
  };

  const handleToggle = async (item: Item) => {
    const res = await fetch(`/api/items/${item.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_available: !item.is_available }),
    });
    if (res.ok) {
      const updatedItem = attachCategory(await res.json());
      setLocalItems((current) => current.map((currentItem) => (
        currentItem.id === updatedItem.id ? updatedItem : currentItem
      )));
      router.refresh();
    }
  };

  const handleQuickUpdate = async (
    item: Item,
    patch: Partial<Item>,
    successMessage: string
  ) => {
    const res = await fetch(`/api/items/${item.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });

    if (!res.ok) {
      toast.error('商品の更新に失敗しました');
      return;
    }

    const updatedItem = attachCategory(await res.json());
    setLocalItems((current) =>
      current.map((currentItem) => (currentItem.id === updatedItem.id ? updatedItem : currentItem))
    );
    toast.success(successMessage);
    router.refresh();
  };

  const handleShowcaseOverride = async (
    item: Item,
    key: 'popular_override' | 'new_arrival_override',
    value: ItemShowcaseOverride
  ) => {
    const res = await fetch(`/api/items/${item.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [key]: value }),
    });

    if (!res.ok) {
      toast.error('表示設定の更新に失敗しました');
      return;
    }

    const updatedItem = attachCategory(await res.json());
    setLocalItems((current) =>
      current.map((currentItem) => (currentItem.id === updatedItem.id ? updatedItem : currentItem))
    );
    toast.success('表示設定を更新しました');
    router.refresh();
  };

  const getStatusMeta = (item: Item) => {
    if (!item.is_available) {
      return {
        label: '販売停止',
        className: 'bg-gray-500/20 text-gray-300',
      };
    }

    if (item.stock === 0) {
      return {
        label: '売り切れ',
        className: 'bg-red-500/20 text-red-300',
      };
    }

    if (item.stock <= item.stock_alert_threshold) {
      return {
        label: '残り少なめ',
        className: 'bg-amber-500/20 text-amber-300',
      };
    }

    return {
      label: '販売中',
      className: 'bg-green-500/20 text-green-300',
    };
  };

  const filteredItems = localItems.filter((item) => {
    switch (statusFilter) {
      case 'selling':
        return item.is_available && item.stock > 0;
      case 'sold-out':
        return item.is_available && item.stock === 0;
      case 'stopped':
        return !item.is_available;
      case 'low-stock':
        return item.is_available && item.stock > 0 && item.stock <= item.stock_alert_threshold;
      default:
        return true;
    }
  });

  const statusOptions = [
    { key: 'all' as const, label: 'すべて', count: localItems.length },
    { key: 'selling' as const, label: '販売中', count: localItems.filter((item) => item.is_available && item.stock > 0).length },
    { key: 'sold-out' as const, label: '売り切れ', count: localItems.filter((item) => item.is_available && item.stock === 0).length },
    { key: 'stopped' as const, label: '販売停止', count: localItems.filter((item) => !item.is_available).length },
    { key: 'low-stock' as const, label: '要補充', count: localItems.filter((item) => item.is_available && item.stock > 0 && item.stock <= item.stock_alert_threshold).length },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display font-bold text-2xl text-white">商品管理</h1>
          <p className="text-gray-400 text-sm mt-1">{localItems.length}件の商品</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 bg-white text-gray-950 px-4 py-2 rounded-lg font-medium text-sm hover:bg-gray-100 active:scale-95 transition-all">
          <Plus size={16} /> 商品を追加
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {statusOptions.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => setStatusFilter(option.key)}
            className={`rounded-full px-3 py-2 text-xs font-medium transition-colors ${
              statusFilter === option.key
                ? 'bg-white text-gray-950'
                : 'bg-gray-900 text-gray-300 hover:bg-gray-800'
            }`}
          >
            {option.label} {option.count}
          </button>
        ))}
      </div>

      {/* 商品テーブル */}
      <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800">
              {['商品名', 'カテゴリ', '価格', '在庫', '状態', '販売操作', '人気表示', '新入荷表示', '編集'].map(h => (
                <th key={h} className="px-4 py-3 text-left font-medium text-gray-400">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredItems.map((item) => {
              const statusMeta = getStatusMeta(item);

              return (
              <tr key={item.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{item.category?.icon ?? '📦'}</span>
                    <div>
                      <span className="text-white font-medium">{item.name}</span>
                      {item.english_name ? (
                        <p className="text-xs text-gray-500">{item.english_name}</p>
                      ) : null}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-400">{item.category?.name ?? '-'}</td>
                <td className="px-4 py-3 text-white font-mono">¥{item.price.toLocaleString()}</td>
                <td className="px-4 py-3">
                  <span className={`font-mono ${
                    item.stock === 0 ? 'text-red-400' :
                    item.stock <= item.stock_alert_threshold ? 'text-amber-400' : 'text-green-400'
                  }`}>
                    {item.stock}
                  </span>
                  <span className="text-gray-600 text-xs ml-1">/ アラート{item.stock_alert_threshold}</span>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${statusMeta.className}`}>
                    {statusMeta.label}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    {item.is_available ? (
                      <button
                        onClick={() => handleToggle(item)}
                        className="rounded-lg bg-gray-800 px-2.5 py-1.5 text-xs font-medium text-gray-200 transition-colors hover:bg-gray-700"
                      >
                        販売停止
                      </button>
                    ) : (
                      <button
                        onClick={() => handleToggle(item)}
                        className="rounded-lg bg-emerald-500/20 px-2.5 py-1.5 text-xs font-medium text-emerald-300 transition-colors hover:bg-emerald-500/30"
                      >
                        販売再開
                      </button>
                    )}
                    {item.stock > 0 && (
                      <button
                        onClick={() => handleQuickUpdate(item, { stock: 0 }, '売り切れ状態にしました')}
                        className="rounded-lg bg-red-500/20 px-2.5 py-1.5 text-xs font-medium text-red-300 transition-colors hover:bg-red-500/30"
                      >
                        売り切れにする
                      </button>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="inline-flex rounded-lg border border-gray-800 bg-gray-950 p-1">
                    {OVERRIDE_OPTIONS.map((option) => (
                      <button
                        key={`popular-${option.value}`}
                        onClick={() => handleShowcaseOverride(item, 'popular_override', option.value)}
                        className={`rounded-md px-2 py-1 text-xs transition-colors ${
                          item.popular_override === option.value
                            ? 'bg-white text-gray-950'
                            : 'text-gray-400 hover:text-white'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="inline-flex rounded-lg border border-gray-800 bg-gray-950 p-1">
                    {OVERRIDE_OPTIONS.map((option) => (
                      <button
                        key={`new-${option.value}`}
                        onClick={() => handleShowcaseOverride(item, 'new_arrival_override', option.value)}
                        className={`rounded-md px-2 py-1 text-xs transition-colors ${
                          item.new_arrival_override === option.value
                            ? 'bg-white text-gray-950'
                            : 'text-gray-400 hover:text-white'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <button onClick={() => openEdit(item)} className="p-1.5 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-white transition-colors">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => handleDelete(item.id, item.name)} className="p-1.5 rounded-lg hover:bg-red-500/20 text-gray-400 hover:text-red-400 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            )})}
          </tbody>
        </table>
        {filteredItems.length === 0 && (
          <div className="text-center py-12 text-gray-500">該当する商品がありません</div>
        )}
      </div>

      {/* フォームモーダル */}
      {showForm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-2xl border border-gray-700 w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <h2 className="font-display font-bold text-xl text-white">
              {editing ? '商品を編集' : '商品を追加'}
            </h2>

            {[
              { label: '商品名 *', key: 'name', type: 'text', placeholder: '例: コカコーラ' },
              { label: '英語名', key: 'english_name', type: 'text', placeholder: 'Example: Coca-Cola' },
              { label: '説明', key: 'description', type: 'text', placeholder: '任意' },
              { label: '価格（円） *', key: 'price', type: 'number', placeholder: '150' },
              { label: '在庫数', key: 'stock', type: 'number', placeholder: '10' },
              { label: 'アラート閾値', key: 'stock_alert_threshold', type: 'number', placeholder: '3' },
              { label: '画像URL', key: 'image_url', type: 'text', placeholder: 'https://...' },
            ].map(({ label, key, type, placeholder }) => (
              <div key={key} className="space-y-1">
                <label className="text-sm text-gray-400">{label}</label>
                <input
                  type={type}
                  placeholder={placeholder}
                  value={(form as any)[key]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-white/20 placeholder:text-gray-600"
                />
              </div>
            ))}

            <div className="space-y-1">
              <label className="text-sm text-gray-400">カテゴリ</label>
              <select
                value={form.category_id}
                onChange={(e) => setForm({ ...form, category_id: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2.5 focus:outline-none"
              >
                <option value="">未分類</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm text-gray-400">人気商品への表示</label>
                <select
                  value={form.popular_override}
                  onChange={(e) =>
                    setForm({ ...form, popular_override: e.target.value as ItemShowcaseOverride })
                  }
                  className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2.5 focus:outline-none"
                >
                  {OVERRIDE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-sm text-gray-400">新入荷への表示</label>
                <select
                  value={form.new_arrival_override}
                  onChange={(e) =>
                    setForm({ ...form, new_arrival_override: e.target.value as ItemShowcaseOverride })
                  }
                  className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2.5 focus:outline-none"
                >
                  {OVERRIDE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="is_available"
                checked={form.is_available}
                onChange={(e) => setForm({ ...form, is_available: e.target.checked })}
                className="w-4 h-4"
              />
              <label htmlFor="is_available" className="text-sm text-gray-300">販売中</label>
            </div>

            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowForm(false)} className="flex-1 py-2.5 rounded-lg border border-gray-700 text-gray-300 hover:bg-gray-800 transition-colors">
                キャンセル
              </button>
              <button onClick={handleSubmit} disabled={loading} className="flex-1 py-2.5 rounded-lg bg-white text-gray-950 font-medium hover:bg-gray-100 disabled:opacity-50 transition-colors">
                {loading ? '保存中...' : editing ? '更新' : '追加'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
