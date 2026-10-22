const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_INT = 2147483647;

export type CheckoutInput = {
  items: { item_id: string; quantity: number }[];
  total_amount: number;
  payment_method: 'balance' | 'deferred' | 'cash';
  deferred_settlement_method: 'cash' | 'stripe' | null;
  points_used: number;
};

// Prices and product names supplied by the browser are never authoritative.
// The quoted total is checked against locked product rows inside checkout_order.
export function parseCheckout(value: unknown): CheckoutInput {
  if (!value || typeof value !== 'object') throw new Error('注文内容が不正です');
  const input = value as Record<string, unknown>;
  if (!Array.isArray(input.items) || !input.items.length || input.items.length > 100) {
    throw new Error('商品を1〜100種類選択してください');
  }
  const ids = new Set<string>();
  const items = input.items.map((raw: unknown) => {
    if (!raw || typeof raw !== 'object') throw new Error('商品情報が不正です');
    const item = raw as Record<string, unknown>;
    if (typeof item.item_id !== 'string' || !UUID.test(item.item_id)) throw new Error('商品IDが不正です');
    const id = item.item_id.toLowerCase();
    if (ids.has(id)) throw new Error('同じ商品が重複しています');
    ids.add(id);
    if (!Number.isSafeInteger(item.quantity) || Number(item.quantity) < 1 || Number(item.quantity) > MAX_INT) {
      throw new Error('個数は正の整数で入力してください');
    }
    return { item_id: id, quantity: item.quantity as number };
  });
  if (!Number.isSafeInteger(input.total_amount) || Number(input.total_amount) < 0 || Number(input.total_amount) > MAX_INT) {
    throw new Error('合計金額が不正です');
  }
  const points = input.points_used ?? 0;
  if (!Number.isSafeInteger(points) || Number(points) < 0 || Number(points) > MAX_INT) throw new Error('ポイント数が不正です');
  if (typeof input.payment_method !== 'string' || !['balance', 'deferred', 'cash'].includes(input.payment_method)) throw new Error('支払い方法が不正です');
  if (input.payment_method === 'deferred' && (typeof input.deferred_settlement_method !== 'string' || !['cash', 'stripe'].includes(input.deferred_settlement_method))) {
    throw new Error('後払い時の精算方法を選択してください');
  }
  return {
    items, total_amount: input.total_amount as number,
    payment_method: input.payment_method as CheckoutInput['payment_method'],
    deferred_settlement_method: input.payment_method === 'deferred' ? input.deferred_settlement_method as 'cash' | 'stripe' : null,
    points_used: points as number,
  };
}
