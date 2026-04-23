import type { Item } from '@/types';

export const ITEM_SELECT_ENHANCED =
  'id, name, english_name, description, price, category_id, image_url, stock, stock_alert_threshold, is_available, popular_override, new_arrival_override, created_at, updated_at';

export const ITEM_SELECT_LEGACY =
  'id, name, description, price, category_id, image_url, stock, stock_alert_threshold, is_available, created_at, updated_at';

export const FAVORITE_ITEM_SELECT_ENHANCED =
  'item:items(id, name, english_name, price, stock, is_available)';

export const FAVORITE_ITEM_SELECT_LEGACY =
  'item:items(id, name, price, stock, is_available)';

export const ORDER_ITEMS_SELECT_ENHANCED =
  'order_items(item_name, quantity, item:items(id, name, english_name, price, stock, is_available, stock_alert_threshold, category_id, image_url, description, popular_override, new_arrival_override, created_at, updated_at))';

export const ORDER_ITEMS_SELECT_LEGACY =
  'order_items(item_name, quantity, item:items(id, name, price, stock, is_available, stock_alert_threshold, category_id, image_url, description, created_at, updated_at))';

export function isMissingItemEnhancementColumns(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const message = 'message' in error && typeof error.message === 'string' ? error.message : '';
  const code = 'code' in error && typeof error.code === 'string' ? error.code : '';

  return (
    code === '42703' ||
    message.includes('english_name') ||
    message.includes('popular_override') ||
    message.includes('new_arrival_override')
  );
}

export function normalizeItem<T extends Partial<Item>>(item: T): T & Pick<Item, 'english_name' | 'popular_override' | 'new_arrival_override'> {
  return {
    ...item,
    english_name: item.english_name ?? null,
    popular_override: item.popular_override ?? 'auto',
    new_arrival_override: item.new_arrival_override ?? 'auto',
  };
}
