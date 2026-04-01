'use client';

import { useState } from 'react';
import ItemCard from '@/components/user/ItemCard';
import type { Item, Category } from '@/types';
import { Heart, Search, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import { isQueryMatch } from '@/lib/search';

interface Props {
  items: Item[];
  categories: Category[];
  initialFavoriteItemIds: string[];
  frequentItemIds: string[];
}

export default function ItemListClient({
  items,
  categories,
  initialFavoriteItemIds,
  frequentItemIds,
}: Props) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [favoriteItemIds, setFavoriteItemIds] = useState(initialFavoriteItemIds);

  const filtered = items.filter((item) => {
    const matchCat = !selectedCategory || item.category_id === selectedCategory;
    const matchQ = isQueryMatch(item, query);
    return matchCat && matchQ;
  });

  const favoriteItems = items.filter((item) => favoriteItemIds.includes(item.id));
  const frequentItems = frequentItemIds
    .map((itemId) => items.find((item) => item.id === itemId))
    .filter((item): item is Item => Boolean(item));

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

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ヘッダー */}
      <div>
        <h1 className="font-display font-bold text-3xl text-espresso">商品一覧</h1>
        <p className="text-espresso-400 mt-1 text-sm">
          {items.length}件の商品
        </p>
      </div>

      {(favoriteItems.length > 0 || frequentItems.length > 0) && (
        <div className="grid gap-6 lg:grid-cols-2">
          {favoriteItems.length > 0 && (
            <section className="card space-y-4">
              <div className="flex items-center gap-2 text-espresso">
                <Heart size={18} className="text-red-500" />
                <h2 className="font-medium">お気に入り</h2>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {favoriteItems.slice(0, 4).map((item) => (
                  <ItemCard
                    key={`favorite-${item.id}`}
                    item={item}
                    isFavorite
                    onToggleFavorite={handleToggleFavorite}
                  />
                ))}
              </div>
            </section>
          )}

          {frequentItems.length > 0 && (
            <section className="card space-y-4">
              <div className="flex items-center gap-2 text-espresso">
                <Sparkles size={18} className="text-matcha-dark" />
                <h2 className="font-medium">よく買う商品</h2>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {frequentItems.map((item) => (
                  <ItemCard
                    key={`frequent-${item.id}`}
                    item={item}
                    isFavorite={favoriteItemIds.includes(item.id)}
                    onToggleFavorite={handleToggleFavorite}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* 検索 */}
      <div className="relative">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-espresso-400" />
        <input
          type="text"
          placeholder="商品名で検索（ひらがな・カタカナ・英語ゆれ対応）"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="input pl-10"
        />
      </div>

      {/* カテゴリフィルタ */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        <button
          onClick={() => setSelectedCategory(null)}
          className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
            !selectedCategory
              ? 'bg-espresso text-cream-50'
              : 'bg-cream-100 text-espresso-600 hover:bg-cream-200'
          }`}
        >
          すべて
        </button>
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setSelectedCategory(cat.id === selectedCategory ? null : cat.id)}
            className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
              selectedCategory === cat.id
                ? 'bg-espresso text-cream-50'
                : 'bg-cream-100 text-espresso-600 hover:bg-cream-200'
            }`}
          >
            <span>{cat.icon}</span>
            {cat.name}
          </button>
        ))}
      </div>

      {/* 商品グリッド */}
      {filtered.length === 0 ? (
        <div className="text-center py-20 text-espresso-400">
          <p className="text-4xl mb-4">🔍</p>
          <p className="font-medium">商品が見つかりませんでした</p>
        </div>
      ) : (
        <div className="space-y-3">
          {query && (
            <p className="text-sm text-espresso-400">
              「{query}」の検索結果: <span className="font-medium text-espresso">{filtered.length}件</span>
            </p>
          )}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {filtered.map((item, i) => (
              <div
                key={item.id}
                className="animate-slide-up"
                style={{ animationDelay: `${i * 50}ms`, animationFillMode: 'both' }}
              >
                <ItemCard
                  item={item}
                  isFavorite={favoriteItemIds.includes(item.id)}
                  onToggleFavorite={handleToggleFavorite}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
