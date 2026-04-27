'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import { Heart, Search, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import ItemCard from '@/components/user/ItemCard';
import InstallPromptCard from '@/components/user/InstallPromptCard';
import { isQueryMatch } from '@/lib/search';
import { isItemLowStock } from '@/lib/item-stock';
import type { Category, Item } from '@/types';
import { useUserLocale } from '@/components/user/UserLocaleProvider';

interface Props {
  items: Item[];
  categories: Category[];
  initialFavoriteItemIds: string[];
}

type BrowseMode = 'all' | 'favorites' | 'low-stock';

export default function ItemListClient({
  items,
  categories,
  initialFavoriteItemIds,
}: Props) {
  const { locale } = useUserLocale();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [browseMode, setBrowseMode] = useState<BrowseMode>('all');
  const [favoriteItemIds, setFavoriteItemIds] = useState(initialFavoriteItemIds);
  const deferredQuery = useDeferredValue(query);
  const favoriteItemIdSet = useMemo(() => new Set(favoriteItemIds), [favoriteItemIds]);

  const favoriteItems = useMemo(
    () => items.filter((item) => favoriteItemIdSet.has(item.id)),
    [favoriteItemIdSet, items]
  );
  const lowStockItems = useMemo(
    () => items.filter((item) => isItemLowStock(item)),
    [items]
  );

  const baseItems = useMemo(() => {
    switch (browseMode) {
      case 'favorites':
        return favoriteItems;
      case 'low-stock':
        return lowStockItems;
      default:
        return items;
    }
  }, [browseMode, favoriteItems, items, lowStockItems]);

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
  const copy =
    locale === 'en'
      ? {
          title: 'Products',
          searchPlaceholder: 'Search by product name',
          all: 'All',
          favorites: 'Favorites',
          lowStock: 'Low stock',
          showing: 'Showing',
          search: 'Search',
          category: 'Category',
          sectionKicker: 'Products',
          emptyTitle: 'No products found',
          emptyDescription: 'Try a different keyword or remove some filters.',
          quickSections: {
            favorites: { title: 'Favorites', subtitle: 'Quick access' },
          },
        }
      : {
          title: '商品一覧',
          searchPlaceholder: '商品名で検索',
          all: 'すべて',
          favorites: 'お気に入り',
          lowStock: '残りわずか',
          showing: '表示中',
          search: '検索',
          category: 'カテゴリ',
          sectionKicker: '商品',
          emptyTitle: '商品が見つかりませんでした',
          emptyDescription: '検索語を変えるか、絞り込みを外してみてください。',
          quickSections: {
            favorites: { title: 'お気に入り', subtitle: 'すぐ追加' },
          },
        };
  const quickBrowseOptions = [
    { id: 'all' as const, label: copy.all, count: items.length },
    { id: 'favorites' as const, label: copy.favorites, count: favoriteItems.length },
    { id: 'low-stock' as const, label: copy.lowStock, count: lowStockItems.length },
  ];
  const quickSections = [
    {
      id: 'favorites',
      title: copy.quickSections.favorites.title,
      subtitle: copy.quickSections.favorites.subtitle,
      icon: Heart,
      items: favoriteItems.slice(0, 2),
    },
  ].filter((section) => section.items.length > 0);

  return (
    <div className="space-y-6 animate-fade-in">
      <section className="space-y-2">
        <h1 className="font-display text-4xl font-bold text-espresso">{copy.title}</h1>
      </section>

      <section className="card space-y-4">
        <div className="relative">
          <Search
            size={18}
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-espresso-400"
          />
          <input
            type="text"
            placeholder={copy.searchPlaceholder}
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
            {copy.all}
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
            <span>{copy.showing} {filtered.length}</span>
            {query && <span>{copy.search}: “{query}”</span>}
            {activeCategoryName && <span>{copy.category}: {activeCategoryName}</span>}
          </div>
        )}
      </section>

      <InstallPromptCard />

      <div className={`grid gap-6 ${quickSections.length > 0 ? 'lg:grid-cols-[minmax(0,3fr)_minmax(0,1fr)]' : ''}`}>
        <div>
          {filtered.length === 0 ? (
            <div className="card py-16 text-center text-espresso-400">
              <p className="mb-4 text-5xl">🔍</p>
              <p className="font-medium text-espresso">{copy.emptyTitle}</p>
              <p className="mt-2 text-sm text-espresso-400">
                {copy.emptyDescription}
              </p>
            </div>
          ) : (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="section-kicker">
                  <Sparkles size={12} />
                  {copy.sectionKicker}
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
                      isFavorite={favoriteItemIdSet.has(item.id)}
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
                        isFavorite={favoriteItemIdSet.has(item.id)}
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
