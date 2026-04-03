'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import { Flame, Heart, Search, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import ItemCard from '@/components/user/ItemCard';
import InstallPromptCard from '@/components/user/InstallPromptCard';
import { isQueryMatch } from '@/lib/search';
import type { Category, Item } from '@/types';

interface Props {
  items: Item[];
  categories: Category[];
  initialFavoriteItemIds: string[];
  frequentItemIds: string[];
  popularItemIds: string[];
  newArrivalItemIds: string[];
}

type BrowseMode = 'all' | 'favorites' | 'frequent' | 'low-stock' | 'popular' | 'new-arrivals';

export default function ItemListClient({
  items,
  categories,
  initialFavoriteItemIds,
  frequentItemIds,
  popularItemIds,
  newArrivalItemIds,
}: Props) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [browseMode, setBrowseMode] = useState<BrowseMode>('all');
  const [favoriteItemIds, setFavoriteItemIds] = useState(initialFavoriteItemIds);
  const deferredQuery = useDeferredValue(query);

  const favoriteItems = useMemo(
    () => items.filter((item) => favoriteItemIds.includes(item.id)),
    [favoriteItemIds, items]
  );
  const frequentItems = useMemo(
    () =>
      frequentItemIds
        .map((itemId) => items.find((item) => item.id === itemId))
        .filter((item): item is Item => Boolean(item)),
    [frequentItemIds, items]
  );
  const lowStockItems = useMemo(
    () =>
      items.filter(
        (item) => item.is_available && item.stock > 0 && item.stock <= item.stock_alert_threshold
      ),
    [items]
  );
  const popularItems = useMemo(
    () =>
      popularItemIds
        .map((itemId) => items.find((item) => item.id === itemId))
        .filter((item): item is Item => Boolean(item)),
    [items, popularItemIds]
  );
  const newArrivalItems = useMemo(
    () =>
      newArrivalItemIds
        .map((itemId) => items.find((item) => item.id === itemId))
        .filter((item): item is Item => Boolean(item)),
    [items, newArrivalItemIds]
  );

  const baseItems = useMemo(() => {
    switch (browseMode) {
      case 'popular':
        return popularItems;
      case 'new-arrivals':
        return newArrivalItems;
      case 'favorites':
        return favoriteItems;
      case 'frequent':
        return frequentItems;
      case 'low-stock':
        return lowStockItems;
      default:
        return items;
    }
  }, [browseMode, favoriteItems, frequentItems, items, lowStockItems, newArrivalItems, popularItems]);

  const filtered = useMemo(
    () =>
      baseItems.filter((item) => {
        const matchCategory = !selectedCategory || item.category_id === selectedCategory;
        const matchQuery = isQueryMatch(item, deferredQuery);
        return matchCategory && matchQuery;
      }),
    [baseItems, deferredQuery, selectedCategory]
  );

  const handleToggleFavorite = async (itemId: string) => {
    const isFavorite = favoriteItemIds.includes(itemId);
    setFavoriteItemIds((current) =>
      isFavorite ? current.filter((id) => id !== itemId) : [...current, itemId]
    );

    try {
      const res = await fetch('/api/favorites', {
        method: isFavorite ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id: itemId }),
      });

      if (!res.ok) {
        throw new Error((await res.json()).error ?? 'お気に入りの更新に失敗しました');
      }
    } catch (error: any) {
      setFavoriteItemIds((current) =>
        isFavorite ? [...current, itemId] : current.filter((id) => id !== itemId)
      );
      toast.error(error.message);
    }
  };

  const activeCategoryName = categories.find((category) => category.id === selectedCategory)?.name;
  const quickBrowseOptions = [
    { id: 'all' as const, label: 'すべて', count: items.length },
    { id: 'popular' as const, label: '人気', count: popularItems.length },
    { id: 'new-arrivals' as const, label: '新入荷', count: newArrivalItems.length },
    { id: 'favorites' as const, label: 'お気に入り', count: favoriteItems.length },
    { id: 'frequent' as const, label: 'よく買う', count: frequentItems.length },
    { id: 'low-stock' as const, label: '残りわずか', count: lowStockItems.length },
  ];
  const quickSections = [
    {
      id: 'popular',
      title: '人気の商品',
      subtitle: '最近よく選ばれています',
      icon: Flame,
      items: popularItems.slice(0, 2),
    },
    {
      id: 'new-arrivals',
      title: '新入荷',
      subtitle: '新しく追加されました',
      icon: Sparkles,
      items: newArrivalItems.slice(0, 2),
    },
    {
      id: 'frequent',
      title: 'よく買う商品',
      subtitle: '直近の履歴',
      icon: Flame,
      items: frequentItems.slice(0, 2),
    },
    {
      id: 'favorites',
      title: 'お気に入り',
      subtitle: 'すぐ追加',
      icon: Heart,
      items: favoriteItems.slice(0, 2),
    },
  ].filter((section) => section.items.length > 0);

  return (
    <div className="space-y-6 animate-fade-in">
      <section className="space-y-2">
        <h1 className="font-display text-4xl font-bold text-espresso">商品一覧</h1>
      </section>

      <section className="card space-y-4">
        <div className="relative">
          <Search
            size={18}
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-espresso-400"
          />
          <input
            type="text"
            placeholder="商品名で検索"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="input pl-11"
          />
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 hide-scrollbar">
          {quickBrowseOptions.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setBrowseMode(option.id)}
              className={`chip-filter whitespace-nowrap ${browseMode === option.id ? 'chip-filter-active' : ''}`}
            >
              {option.label}
              <span className={browseMode === option.id ? 'text-cream-200' : 'text-espresso-400'}>
                {option.count}
              </span>
            </button>
          ))}
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 hide-scrollbar">
          <button
            type="button"
            onClick={() => setSelectedCategory(null)}
            className={`chip-filter whitespace-nowrap ${!selectedCategory ? 'chip-filter-active' : ''}`}
          >
            すべて
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedCategory(cat.id === selectedCategory ? null : cat.id)}
              className={`chip-filter whitespace-nowrap ${selectedCategory === cat.id ? 'chip-filter-active' : ''}`}
            >
              <span>{cat.icon}</span>
              {cat.name}
            </button>
          ))}
        </div>

        {(query || activeCategoryName || browseMode !== 'all') && (
          <div className="flex flex-wrap gap-2 text-sm text-espresso-500">
            <span>表示中 {filtered.length}件</span>
            {query && <span>検索: 「{query}」</span>}
            {activeCategoryName && <span>カテゴリ: {activeCategoryName}</span>}
          </div>
        )}
      </section>

      <InstallPromptCard />

      <div className={`grid gap-6 ${quickSections.length > 0 ? 'lg:grid-cols-[minmax(0,3fr)_minmax(0,1fr)]' : ''}`}>
        <div>
          {filtered.length === 0 ? (
            <div className="card py-16 text-center text-espresso-400">
              <p className="mb-4 text-5xl">🔍</p>
              <p className="font-medium text-espresso">商品が見つかりませんでした</p>
              <p className="mt-2 text-sm text-espresso-400">
                検索語を変えるか、絞り込みを外してみてください。
              </p>
            </div>
          ) : (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="section-kicker">
                  <Sparkles size={12} />
                  商品
                </div>
                <p className="text-sm text-espresso-400">{filtered.length}件</p>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {filtered.map((item, i) => (
                  <div
                    key={item.id}
                    className="animate-slide-up"
                    style={{ animationDelay: `${i * 40}ms`, animationFillMode: 'both' }}
                  >
                    <ItemCard
                      item={item}
                      isFavorite={favoriteItemIds.includes(item.id)}
                      onToggleFavorite={handleToggleFavorite}
                    />
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {quickSections.length > 0 && (
          <aside className="space-y-3 lg:sticky lg:top-24 lg:self-start">
            {quickSections.map((section) => {
              const Icon = section.icon;
              return (
                <section key={section.id} className="card space-y-3 p-3.5">
                  <div className="space-y-1">
                    <div className="section-kicker">
                      <Icon size={12} />
                      {section.title}
                    </div>
                    <p className="text-xs text-espresso-400">{section.subtitle}</p>
                  </div>
                  <div className="space-y-2">
                    {section.items.map((item) => (
                      <ItemCard
                        key={`${section.id}-${item.id}`}
                        item={item}
                        isFavorite={favoriteItemIds.includes(item.id)}
                        onToggleFavorite={handleToggleFavorite}
                        compact
                        horizontal
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </aside>
        )}
      </div>
    </div>
  );
}
