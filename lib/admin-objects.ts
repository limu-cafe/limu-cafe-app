export const isObjectId = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export type ObjectKind = 'items' | 'users';
export const OBJECT_RELATIONS = {
  items: [{ id: 'stock', label: '在庫履歴' }, { id: 'orders', label: '関連注文' }],
  users: [{ id: 'orders', label: '注文' }, { id: 'charges', label: 'チャージ' }, { id: 'points', label: 'ポイント履歴' }, { id: 'subscriptions', label: '契約' }],
} as const;

export type ObjectRecords = { rows: Record<string, any>[]; page: number; hasNextPage: boolean };
export type AdminOrder = {
  id: string; user_id: string; total_amount: number; points_used?: number | null;
  payment_method: string; payment_status: string; deferred_settlement_method?: string | null;
  settled_at?: string | null; settlement_source?: string | null; created_at: string;
  user?: { id: string; name: string; avatar_url?: string | null } | null;
  order_items?: { id?: string; item_id?: string; item_name: string; item_price?: number; quantity: number; subtotal?: number }[];
};

export const isPendingCashOrder = (order: AdminOrder) => order.payment_method === 'cash' && order.payment_status === 'pending';
export const isPendingDeferredOrder = (order: AdminOrder) => order.payment_method === 'deferred' && order.payment_status === 'completed' && (order.deferred_settlement_method ?? 'cash') === 'cash' && !order.settled_at;
export const paymentLabel = (method: string) => ({ balance: '残高', deferred: '後払い', cash: '現金', stripe: 'クレカ' }[method] ?? method);
export function orderStateLabel(order: AdminOrder) {
  if (isPendingDeferredOrder(order)) return '未精算';
  if (order.payment_method === 'deferred' && order.payment_status === 'completed' && order.settled_at) return '精算済み';
  return ({ pending: '未精算', completed: '完了', cancelled: 'キャンセル', refunded: '返金済み' }[order.payment_status] ?? order.payment_status);
}

// The existing transaction screen's action policy. APIs remain the authority for writes.
export function orderActions(order: AdminOrder) {
  const actions: { id: string; label: string; endpoint: string; method: 'POST' | 'DELETE'; danger?: boolean; success: string }[] = [];
  const add = (id: string, label: string, endpoint: string, method: 'POST' | 'DELETE', success: string, danger = false) => actions.push({ id, label, endpoint: `/api/admin/orders/${order.id}/${endpoint}`, method, success, danger });
  if (isPendingDeferredOrder(order)) add('settle', '精算完了', 'deferred-settlement', 'POST', '精算済みにしました');
  if (isPendingCashOrder(order)) add('settle', '精算完了', 'cash-settlement', 'POST', '精算済みにしました');
  if (order.payment_method === 'cash' && order.payment_status === 'completed') add('unsettle', '未精算に戻す', 'cash-settlement', 'DELETE', '未精算に戻しました');
  if (!isPendingDeferredOrder(order) && order.payment_method === 'deferred' && (order.deferred_settlement_method ?? 'cash') === 'cash' && order.settlement_source === 'individual_deferred_order') add('unsettle', '未精算に戻す', 'deferred-settlement', 'DELETE', '未精算に戻しました');
  if (['pending', 'completed'].includes(order.payment_status)) add('refund', '返金', 'refund', 'POST', '返金しました', true);
  if (['balance', 'deferred'].includes(order.payment_method) && order.payment_status === 'completed') add('cancel', 'キャンセル', 'cancel', 'POST', 'キャンセルしました', true);
  return actions;
}
