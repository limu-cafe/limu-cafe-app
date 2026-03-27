'use client';

import Image from 'next/image';
import { Plus, ShoppingCart } from 'lucide-react';
import { useCartStore } from '@/lib/store/cart';
import type { Item } from '@/types';
import toast from 'react-hot-toast';

interface ItemCardProps {
  item: Item;
}

export default function ItemCard({ item }: ItemCardProps) {
  const addItem = useCartStore((s) => s.addItem);

  const handleAdd = () => {
    if (!item.is_available || item.stock === 0) return;
    addItem(item);
    toast.success(`${item.name} をカートに追加しました`);
  };

  const isOutOfStock = item.stock === 0 || !item.is_available;

  return (
    <div className={`card group relative overflow-hidden transition-all duration-300 ${
      isOutOfStock ? 'opacity-60' : 'hover:shadow-lg hover:-translate-y-1'
    }`}>
      {/* 画像 */}
      <div className="aspect-square rounded-xl overflow-hidden bg-cream-100 mb-4 relative">
        {item.image_url ? (
          <Image
            src={item.image_url}
            alt={item.name}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-5xl">
            {item.category?.icon ?? '📦'}
          </div>
        )}
        {isOutOfStock && (
          <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
            <span className="bg-espresso text-cream-50 text-xs font-bold px-3 py-1 rounded-full">
              在庫切れ
            </span>
          </div>
        )}
        {item.stock > 0 && item.stock <= item.stock_alert_threshold && !isOutOfStock && (
          <div className="absolute top-2 right-2">
            <span className="bg-amber-cafe text-white text-xs font-bold px-2 py-0.5 rounded-full">
              残り{item.stock}個
            </span>
          </div>
        )}
      </div>

      {/* 情報 */}
      <div className="space-y-1">
        {item.category && (
          <span className="text-xs text-espresso-400 font-medium">
            {item.category.icon} {item.category.name}
          </span>
        )}
        <h3 className="font-medium text-espresso leading-snug">{item.name}</h3>
        {item.description && (
          <p className="text-xs text-espresso-400 line-clamp-2">{item.description}</p>
        )}
        <div className="flex items-center justify-between pt-2">
          <span className="font-display font-bold text-xl text-espresso">
            ¥{item.price.toLocaleString()}
          </span>
          <button
            onClick={handleAdd}
            disabled={isOutOfStock}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
              isOutOfStock
                ? 'bg-cream-200 text-espresso-400 cursor-not-allowed'
                : 'bg-espresso text-cream-50 hover:bg-espresso-600 active:scale-95'
            }`}
          >
            <Plus size={16} />
            追加
          </button>
        </div>
      </div>
    </div>
  );
}
