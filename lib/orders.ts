export const ORDER_ITEMS_SELECT =
  'order_items(item_name, quantity, item:items(id, name, english_name, price, stock, is_available, stock_alert_threshold, category_id, image_url, description, popular_override, new_arrival_override, created_at, updated_at))';

export const ORDERS_SELECT_WITH_DEFERRED = `id, total_amount, points_used, payment_method, deferred_settlement_method, payment_status, created_at, ${ORDER_ITEMS_SELECT}`;

export const ORDERS_SELECT_LEGACY = `id, total_amount, payment_method, payment_status, created_at, ${ORDER_ITEMS_SELECT}`;

export function isMissingDeferredSettlementMethodColumn(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const message = 'message' in error && typeof error.message === 'string' ? error.message : '';
  const code = 'code' in error && typeof error.code === 'string' ? error.code : '';

  return code === '42703' || message.includes('deferred_settlement_method');
}

export function isMissingOrderPointsColumn(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const message = 'message' in error && typeof error.message === 'string' ? error.message : '';
  const code = 'code' in error && typeof error.code === 'string' ? error.code : '';

  return code === '42703' || message.includes('points_used');
}
