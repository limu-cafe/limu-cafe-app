'use client';

import { RotateCcw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { useCartStore } from '@/lib/store/cart';
import type { Item } from '@/types';
import { useUserLocale } from './UserLocaleProvider';
import { getItemDisplayName } from '@/lib/item-display';

type ReorderableOrderItem = {
  item_name: string;
  quantity: number;
  item?: Item | null;
};

export default function ReorderButton({
  orderItems,
}: {
  orderItems: ReorderableOrderItem[];
}) {
  const router = useRouter();
  const addItem = useCartStore((state) => state.addItem);
  const { locale } = useUserLocale();
  const copy =
    locale === 'en'
      ? {
          insufficientStock: 'low stock',
          noneAvailable: 'No items were available to reorder',
          partialAdded: 'Added to cart',
          partialNote: 'Some items were skipped',
          added: 'Added the same items to your cart again',
          action: 'Order again',
          separator: ', ',
        }
      : {
          insufficientStock: '在庫不足',
          noneAvailable: '再注文できる商品がありませんでした',
          partialAdded: 'カートに追加しました',
          partialNote: '一部未追加',
          added: '前回と同じ内容をカートに追加しました',
          action: 'もう一度注文',
          separator: '、',
        };

  const handleReorder = () => {
    let addedCount = 0;
    const skippedItems: string[] = [];

    for (const orderItem of orderItems) {
      const item = orderItem.item;
      const itemName = item ? getItemDisplayName(item, locale) : orderItem.item_name;
      if (!item || !item.is_available || item.stock <= 0) {
        skippedItems.push(itemName);
        continue;
      }

      const purchasableQuantity = Math.min(orderItem.quantity, item.stock);
      for (let index = 0; index < purchasableQuantity; index += 1) {
        addItem(item);
      }
      addedCount += purchasableQuantity;

      if (purchasableQuantity < orderItem.quantity) {
        skippedItems.push(
          locale === 'en'
            ? `${itemName} (${copy.insufficientStock})`
            : `${itemName}（${copy.insufficientStock}）`
        );
      }
    }

    if (addedCount === 0) {
      toast.error(copy.noneAvailable);
      return;
    }

    if (skippedItems.length > 0) {
      toast.success(
        locale === 'en'
          ? `${copy.partialAdded} (${copy.partialNote}: ${skippedItems.join(copy.separator)})`
          : `${copy.partialAdded}（${copy.partialNote}: ${skippedItems.join(copy.separator)}）`,
        {
        duration: 3500,
        }
      );
    } else {
      toast.success(copy.added);
    }

    router.push('/cart');
  };

  return (
    <button
      onClick={handleReorder}
      className="inline-flex items-center gap-1.5 rounded-lg bg-cream-100 px-3 py-2 text-xs font-medium text-espresso-600 transition-colors hover:bg-cream-200"
    >
      <RotateCcw size={14} />
      {copy.action}
    </button>
  );
}
