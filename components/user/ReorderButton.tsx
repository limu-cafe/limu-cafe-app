'use client';

import { RotateCcw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { useCartStore } from '@/lib/store/cart';
import type { Item } from '@/types';

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

  const handleReorder = () => {
    let addedCount = 0;
    const skippedItems: string[] = [];

    for (const orderItem of orderItems) {
      const item = orderItem.item;
      if (!item || !item.is_available || item.stock <= 0) {
        skippedItems.push(orderItem.item_name);
        continue;
      }

      const purchasableQuantity = Math.min(orderItem.quantity, item.stock);
      for (let index = 0; index < purchasableQuantity; index += 1) {
        addItem(item);
      }
      addedCount += purchasableQuantity;

      if (purchasableQuantity < orderItem.quantity) {
        skippedItems.push(`${orderItem.item_name}（在庫不足）`);
      }
    }

    if (addedCount === 0) {
      toast.error('再注文できる商品がありませんでした');
      return;
    }

    if (skippedItems.length > 0) {
      toast.success(`カートに追加しました（一部未追加: ${skippedItems.join('、')}）`, {
        duration: 3500,
      });
    } else {
      toast.success('前回と同じ内容をカートに追加しました');
    }

    router.push('/cart');
  };

  return (
    <button
      onClick={handleReorder}
      className="inline-flex items-center gap-1.5 rounded-lg bg-cream-100 px-3 py-2 text-xs font-medium text-espresso-600 transition-colors hover:bg-cream-200"
    >
      <RotateCcw size={14} />
      もう一度注文
    </button>
  );
}
