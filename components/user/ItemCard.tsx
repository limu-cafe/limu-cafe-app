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
  compact?: boolean;
  horizontal?: boolean;
}

export default function ItemCard({
  item,
  isFavorite = false,
  onToggleFavorite,
  compact = false,
  horizontal = false,
}: ItemCardProps) {
  const addItem = useCartStore((s) => s.addItem);

  const handleAdd = () => {
    if (!item.is_available || item.stock === 0) return;
    addItem(item);
    toast.success(`${item.name} をカートに追加しました`);
  };

  const isOutOfStock = item.stock === 0 || !item.is_available;
  const isLowStock = item.stock > 0 && item.stock <= item.stock_alert_threshold;
  const stockStatus = isOutOfStock
    ? {
        label: '在庫なし',
        className: 'bg-red-100 text-red-700',
        detail: '入荷待ちです',
      }
    : isLowStock
      ? {
          label: '少なめ',
          className: 'bg-amber-100 text-amber-700',
          detail: '残りわずかです',
        }
      : {
          label: '在庫あり',
          className: 'bg-matcha/10 text-matcha-dark',
          detail: '購入できます',
        };

  if (horizontal) {
    return (
      <div className={`group relative overflow-hidden rounded-[22px] border border-cream-200 bg-white p-3 shadow-[0_12px_30px_-28px_rgba(44,26,14,0.22)] transition-all duration-300 ${
        isOutOfStock ? 'opacity-70' : 'hover:-translate-y-0.5 hover:shadow-[0_18px_36px_-28px_rgba(44,26,14,0.26)]'
      }`}>
        {onToggleFavorite && (
          <button
            type="button"
            onClick={() => onToggleFavorite(item.id)}
            className="absolute right-2 top-2 z-20 flex h-7 w-7 items-center justify-center rounded-full border border-cream-200 bg-white text-espresso transition-colors hover:bg-cream-50"
            aria-label={isFavorite ? 'お気に入りから外す' : 'お気に入りに追加する'}
          >
            <Heart
              size={13}
              className={isFavorite ? 'fill-red-500 text-red-500' : 'text-espresso-500'}
            />
          </button>
        )}

        <div className="grid grid-cols-[64px,minmax(0,1fr)] gap-3 pr-8">
          <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-[18px] bg-cream-100">
            {item.image_url ? (
              <Image
                src={item.image_url}
                alt={item.name}
                fill
                className="object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-3xl">
                {item.category?.icon ?? '📦'}
              </div>
            )}
          </div>

          <div className="min-w-0 space-y-2">
            <div className="space-y-1">
              <div className="flex items-start justify-between gap-2">
                <p className="line-clamp-2 min-w-0 text-sm font-semibold leading-snug text-espresso">
                  {item.name}
                </p>
                <p className="whitespace-nowrap font-display text-base font-bold text-espresso">
                  ¥{item.price.toLocaleString()}
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                <span className="text-espresso-400">{item.category?.name ?? '商品'}</span>
                <span className={`rounded-full px-2 py-0.5 font-medium ${stockStatus.className}`}>
                  {stockStatus.label}
                </span>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                onClick={handleAdd}
                disabled={isOutOfStock}
                className={`rounded-xl px-3 py-2 text-xs font-medium transition-all duration-200 ${
                  isOutOfStock
                    ? 'cursor-not-allowed bg-cream-200 text-espresso-400'
                    : 'bg-espresso text-cream-50 hover:bg-espresso-600 active:scale-[0.98]'
                }`}
              >
                追加
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`group relative overflow-hidden rounded-[24px] border border-cream-200 bg-white p-3.5 shadow-[0_16px_40px_-34px_rgba(44,26,14,0.2)] transition-all duration-300 ${
      isOutOfStock ? 'opacity-70' : 'hover:-translate-y-1 hover:shadow-[0_24px_56px_-36px_rgba(44,26,14,0.26)]'
    }`}>
      {onToggleFavorite && (
        <button
          type="button"
          onClick={() => onToggleFavorite(item.id)}
          className="absolute right-3 top-3 z-20 flex h-9 w-9 items-center justify-center rounded-full border border-cream-200 bg-white text-espresso transition-colors hover:bg-cream-50"
          aria-label={isFavorite ? 'お気に入りから外す' : 'お気に入りに追加する'}
        >
          <Heart
            size={16}
            className={isFavorite ? 'fill-red-500 text-red-500' : 'text-espresso-500'}
          />
        </button>
      )}

      {/* 画像 */}
      <div className={`relative mb-3 overflow-hidden rounded-[20px] bg-cream-100 ${compact ? 'aspect-[1.05]' : 'aspect-[1.18]'}`}>
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
              残りわずか
            </span>
          </div>
        )}
      </div>

      {/* 情報 */}
      <div className={`relative ${compact ? 'space-y-3' : 'space-y-3'}`}>
        <div className="flex items-start justify-between gap-3">
          {item.category ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-cream-100 px-2.5 py-1 text-[11px] font-semibold text-espresso-500">
              {item.category.icon} {item.category.name}
            </span>
          ) : (
            <span />
          )}
          <p className="whitespace-nowrap font-display text-xl font-bold text-espresso">
            ¥{item.price.toLocaleString()}
          </p>
        </div>
        <h3 className={`leading-snug text-espresso ${compact ? 'text-sm font-semibold' : 'text-base font-semibold'}`}>
          {item.name}
        </h3>
        {item.description && (
          <p className={`line-clamp-2 text-xs text-espresso-400 ${compact ? 'hidden sm:block' : ''}`}>
            {item.description}
          </p>
        )}
        <div className="flex items-center justify-between gap-3">
          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium ${stockStatus.className}`}>
            {isLowStock && !isOutOfStock && <AlertTriangle size={12} />}
            {stockStatus.label}
          </span>
          <p className="text-right text-[11px] text-espresso-400">{stockStatus.detail}</p>
        </div>
        <div className="pt-1">
          <button
            onClick={handleAdd}
            disabled={isOutOfStock}
            className={`flex w-full items-center justify-center gap-2 rounded-2xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
              isOutOfStock
                ? 'cursor-not-allowed bg-cream-200 text-espresso-400'
                : 'bg-espresso text-cream-50 hover:bg-espresso-600 active:scale-[0.98]'
            }`}
          >
            <Plus size={16} />
            {isOutOfStock ? '補充待ち' : 'カートに追加'}
          </button>
        </div>
      </div>
    </div>
  );
}
