import {
  isMissingItemEnhancementColumns,
  ORDER_ITEMS_SELECT_ENHANCED,
  ORDER_ITEMS_SELECT_LEGACY,
} from '@/lib/item-select';

export const ORDERS_SELECT_WITH_DEFERRED = `id, total_amount, points_used, payment_method, deferred_settlement_method, payment_status, created_at, ${ORDER_ITEMS_SELECT_ENHANCED}`;

export const ORDERS_SELECT_WITH_DEFERRED_LEGACY_ITEMS = `id, total_amount, points_used, payment_method, deferred_settlement_method, payment_status, created_at, ${ORDER_ITEMS_SELECT_LEGACY}`;

export const ORDERS_SELECT_LEGACY = `id, total_amount, payment_method, payment_status, created_at, ${ORDER_ITEMS_SELECT_ENHANCED}`;

export const ORDERS_SELECT_FULL_LEGACY = `id, total_amount, payment_method, payment_status, created_at, ${ORDER_ITEMS_SELECT_LEGACY}`;

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

export function needsLegacyOrderSelect(error: unknown) {
  return (
    isMissingDeferredSettlementMethodColumn(error) ||
    isMissingOrderPointsColumn(error) ||
    isMissingItemEnhancementColumns(error)
  );
}
