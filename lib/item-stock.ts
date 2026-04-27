import type { Item } from '@/types';
import { isMissingItemEnhancementColumns } from '@/lib/item-select';

type StockLikeItem = Partial<
  Pick<Item, 'stock' | 'stock_alert_threshold' | 'is_available' | 'is_unlimited_stock'>
>;

export function isUnlimitedStockItem(item: StockLikeItem | null | undefined) {
  return Boolean(item?.is_unlimited_stock);
}

export function isItemOutOfStock(item: StockLikeItem | null | undefined) {
  if (!item?.is_available) return true;
  if (isUnlimitedStockItem(item)) return false;
  return (item.stock ?? 0) <= 0;
}

export function isItemLowStock(item: StockLikeItem | null | undefined) {
  if (!item?.is_available) return false;
  if (isUnlimitedStockItem(item)) return false;

  const stock = item.stock ?? 0;
  const threshold = item.stock_alert_threshold ?? 0;

  return stock > 0 && stock <= threshold;
}

export function isItemPurchasable(item: StockLikeItem | null | undefined) {
  return !isItemOutOfStock(item);
}

export function canIncreaseCartQuantity(
  item: StockLikeItem | null | undefined,
  currentQuantity: number
) {
  if (!item?.is_available) return false;
  if (isUnlimitedStockItem(item)) return true;
  return currentQuantity < (item?.stock ?? 0);
}

export async function countLowStockItems(supabase: any) {
  const enhancedQuery = await supabase
    .from('items')
    .select('id, stock, stock_alert_threshold, is_available, is_unlimited_stock')
    .eq('is_available', true);

  let data = enhancedQuery.data;
  let error = enhancedQuery.error;

  if (isMissingItemEnhancementColumns(error)) {
    const legacyQuery = await supabase
      .from('items')
      .select('id, stock, stock_alert_threshold, is_available')
      .eq('is_available', true);

    data = legacyQuery.data;
    error = legacyQuery.error;
  }

  if (error) {
    throw error;
  }

  return (data ?? []).filter((item: StockLikeItem) => isItemLowStock(item)).length;
}
