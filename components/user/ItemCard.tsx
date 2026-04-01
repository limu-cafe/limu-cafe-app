'use client';

import Image from 'next/image';
import { AlertTriangle, Heart, Plus } from 'lucide-react';
import { useCartStore } from '@/lib/store/cart';
import type { Item } from '@/types';
import toast from 'react-hot-toast';

interface ItemCardProps {
  item: Item;
  isFavorite?: boolean;
  onToggleFavorite?: (itemId: string) => void | Promise<void>;
}

export default function ItemCard({
  item,
  isFavorite = false,
  onToggleFavorite,
}: ItemCardProps) {
  const addItem = useCartStore((s) => s.addItem);

  const handleAdd = () => {
    if (!item.is_available || item.stock === 0) return;
    addItem(item);
    toast.success(`${item.name} をカートに追加しました`);
  };

  const isOutOfStock = item.stock === 0 || !item.is_available;
  const isLowStock = item.stock > 0 && item.stock <= item.stock_alert_threshold;

  return (
    <div className={`card group relative overflow-hidden transition-all duration-300 ${
      isOutOfStock ? 'opacity-60' : 'hover:shadow-lg hover:-translate-y-1'
    }`}>
      {onToggleFavorite && (
        <button
          type="button"
          onClick={() => onToggleFavorite(item.id)}
          className="absolute right-3 top-3 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-espresso shadow-sm transition-colors hover:bg-white"
          aria-label={isFavorite ? 'お気に入りから外す' : 'お気に入りに追加する'}
        >
          <Heart
            size={16}
            className={isFavorite ? 'fill-red-500 text-red-500' : 'text-espresso-500'}
          />
        </button>
      )}

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
        {isLowStock && !isOutOfStock && (
          <div className="absolute left-2 top-2">
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
        <div className="flex flex-wrap gap-2 pt-1">
          {isOutOfStock ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-1 text-[11px] font-medium text-red-700">
              <AlertTriangle size={12} />
              在庫切れ
            </span>
          ) : isLowStock ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-[11px] font-medium text-amber-700">
              <AlertTriangle size={12} />
              残りわずか
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full bg-matcha/10 px-2 py-1 text-[11px] font-medium text-matcha-dark">
              在庫あり
            </span>
          )}
        </div>
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
