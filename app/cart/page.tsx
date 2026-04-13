'use client';

import UserLayout from '@/components/layout/UserLayout';
import { useCartStore } from '@/lib/store/cart';
import { Minus, Plus, Trash2, ShoppingBag } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { useUserLocale } from '@/components/user/UserLocaleProvider';
import { getItemDisplayName } from '@/lib/item-display';

export default function CartPage() {
  const { locale } = useUserLocale();
  const { items, removeItem, updateQuantity, total, clearCart, hasHydrated } = useCartStore();
  const copy =
    locale === 'en'
      ? {
          loading: 'Loading your cart...',
          emptyTitle: 'Your cart is empty',
          emptyDescription: 'Add some products to get started',
          backToProducts: 'Back to products',
          title: 'Cart',
          subtitle: 'Adjust quantities and continue to checkout smoothly.',
          summary: 'Total',
          clearAll: 'Clear all',
          soldOut: 'Sold out. Please double-check before purchase.',
          lowStock: 'Stock is getting low.',
          subtotal: 'Subtotal',
          checkout: 'Go to checkout',
        }
      : {
          loading: 'カートを読み込んでいます...',
          emptyTitle: 'カートは空です',
          emptyDescription: '商品を追加してみましょう',
          backToProducts: '商品一覧へ',
          title: 'カート',
          subtitle: '数量を調整して、そのままスムーズに購入へ進めます。',
          summary: '合計',
          clearAll: 'すべて削除',
          soldOut: '在庫切れです。購入前に確認してください。',
          lowStock: '在庫が少なくなっています。',
          subtotal: '小計',
          checkout: '購入手続きへ',
        };

  if (!hasHydrated) {
    return (
      <UserLayout>
        <div className="text-center py-24 animate-fade-in">
          <div className="text-6xl mb-4">🛒</div>
          <p className="text-espresso-400">{copy.loading}</p>
        </div>
      </UserLayout>
    );
  }

  if (items.length === 0) {
    return (
      <UserLayout>
        <div className="text-center py-24 animate-fade-in">
          <div className="text-6xl mb-4">🛒</div>
          <h2 className="font-display text-2xl font-bold text-espresso mb-2">
            {copy.emptyTitle}
          </h2>
          <p className="text-espresso-400 mb-6">{copy.emptyDescription}</p>
          <Link href="/" className="btn-primary inline-flex items-center gap-2">
            <ShoppingBag size={18} />
            {copy.backToProducts}
          </Link>
        </div>
      </UserLayout>
    );
  }

  return (
    <UserLayout>
      <div className="mx-auto max-w-3xl animate-fade-in space-y-6">
        <div className="hero-card px-5 py-5 sm:px-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="section-kicker">
                <ShoppingBag size={12} />
                Cart
              </div>
              <h1 className="mt-3 font-display text-4xl font-bold text-espresso">{copy.title}</h1>
              <p className="mt-1 text-sm text-espresso-500">
                {copy.subtitle}
              </p>
            </div>
            <div className="soft-panel bg-white/75 text-sm text-espresso-500">
              {copy.summary} <span className="ml-2 font-display text-2xl font-bold text-espresso">¥{total().toLocaleString()}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <button
            onClick={clearCart}
            className="text-sm text-red-500 hover:text-red-700 flex items-center gap-1 transition-colors"
          >
            <Trash2 size={14} />
            {copy.clearAll}
          </button>
        </div>

        {/* カートアイテム */}
        <div className="space-y-3">
          {items.map(({ item, quantity }) => (
            <div key={item.id} className="card flex items-center gap-4 py-4">
              {/** Keep product names locale-aware while preserving cart item ids and prices. */}
              {(() => {
                const displayName = getItemDisplayName(item, locale);
                return (
                  <>
              {/* 画像 */}
              <div className="w-16 h-16 rounded-lg overflow-hidden bg-cream-100 flex-shrink-0 flex items-center justify-center text-2xl">
                {item.image_url ? (
                  <Image src={item.image_url} alt={displayName} width={64} height={64} className="object-contain p-1" />
                ) : (
                  item.category?.icon ?? '📦'
                )}
              </div>

              {/* 情報 */}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-espresso truncate">{displayName}</p>
                <p className="text-sm text-espresso-400">
                  ¥{item.price.toLocaleString()} × {quantity}
                </p>
                {item.stock <= item.stock_alert_threshold && (
                  <p className={`mt-1 text-xs ${item.stock === 0 ? 'text-red-600' : 'text-amber-600'}`}>
                    {item.stock === 0 ? copy.soldOut : copy.lowStock}
                  </p>
                )}
              </div>

              {/* 数量コントロール */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => updateQuantity(item.id, quantity - 1)}
                  className="w-8 h-8 rounded-full border border-cream-200 flex items-center justify-center hover:bg-cream-100 transition-colors"
                >
                  <Minus size={14} />
                </button>
                <span className="w-6 text-center font-medium font-mono">{quantity}</span>
                <button
                  onClick={() => updateQuantity(item.id, quantity + 1)}
                  disabled={quantity >= item.stock}
                  className="w-8 h-8 rounded-full border border-cream-200 flex items-center justify-center hover:bg-cream-100 transition-colors disabled:opacity-40"
                >
                  <Plus size={14} />
                </button>
                <button
                  onClick={() => removeItem(item.id)}
                  className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-red-50 text-red-400 hover:text-red-600 transition-colors ml-1"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              {/* 小計 */}
              <div className="text-right flex-shrink-0 w-20">
                <p className="font-display font-bold text-espresso">
                  ¥{(item.price * quantity).toLocaleString()}
                </p>
              </div>
                  </>
                );
              })()}
            </div>
          ))}
        </div>

        {/* 合計・購入へ */}
        <div className="rounded-[28px] bg-gradient-to-br from-espresso to-espresso-600 p-6 text-cream-50 shadow-[0_24px_60px_-32px_rgba(44,26,14,0.55)] space-y-4">
          <div className="flex justify-between items-center text-cream-200">
            <span>{copy.subtotal}</span>
            <span className="font-mono">¥{total().toLocaleString()}</span>
          </div>
          <div className="border-t border-espresso-600 pt-4 flex justify-between items-center">
            <span className="font-display font-bold text-xl">{copy.summary}</span>
            <span className="font-display font-bold text-2xl">
              ¥{total().toLocaleString()}
            </span>
          </div>
          <Link
            href="/checkout"
            className="block w-full text-center bg-matcha hover:bg-matcha-dark text-white py-3 rounded-xl font-medium transition-colors"
          >
            {copy.checkout} →
          </Link>
        </div>
      </div>
    </UserLayout>
  );
}
