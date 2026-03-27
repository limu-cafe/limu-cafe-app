'use client';

import { useState } from 'react';
import ItemCard from '@/components/user/ItemCard';
import type { Item, Category } from '@/types';
import { Search } from 'lucide-react';

interface Props {
  items: Item[];
  categories: Category[];
}

export default function ItemListClient({ items, categories }: Props) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const filtered = items.filter((item) => {
    const matchCat = !selectedCategory || item.category_id === selectedCategory;
    const matchQ = !query || item.name.includes(query) || item.description?.includes(query);
    return matchCat && matchQ;
  });

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ヘッダー */}
      <div>
        <h1 className="font-display font-bold text-3xl text-espresso">商品一覧</h1>
        <p className="text-espresso-400 mt-1 text-sm">
          {items.length}件の商品
        </p>
      </div>

      {/* 検索 */}
      <div className="relative">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-espresso-400" />
        <input
          type="text"
          placeholder="商品名で検索..."
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
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtered.map((item, i) => (
            <div
              key={item.id}
              className="animate-slide-up"
              style={{ animationDelay: `${i * 50}ms`, animationFillMode: 'both' }}
            >
              <ItemCard item={item} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
