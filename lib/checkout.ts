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

export function validCheckoutRequestId(value: unknown): value is string { return typeof value === 'string' && UUID.test(value); }
/** Retain a request ID after an uncertain response so retrying the same order cannot register it twice. */
export class CheckoutSubmission {
  private readonly attempts = new Map<string, string>();
  requestId(input: unknown) {
    const fingerprint = JSON.stringify(input);
    let id = this.attempts.get(fingerprint);
    if (!id) { id = crypto.randomUUID(); this.attempts.set(fingerprint, id); }
    return id;
  }
  complete(input: unknown) { this.attempts.delete(JSON.stringify(input)); }
}

export type PaymentTiming = 'balance' | 'deferred';
/**
 * Which payment timing the checkout screen uses for the amount left after points.
 * The member's own choice is kept and comes back as soon as it is possible again;
 * it is only set aside while it cannot be used. deferredRemaining is null while the
 * allowance is unknown, in which case the server alone decides.
 */
export function resolvePaymentTiming(input: { chosen: PaymentTiming | null; due: number; balance: number; deferredRemaining: number | null }) {
  const { chosen, due, balance, deferredRemaining } = input;
  if (due <= 0) return { timing: 'balance' as PaymentTiming, balanceAvailable: true, deferredAvailable: false, canOrder: true };
  const balanceAvailable = balance >= due;
  const deferredAvailable = deferredRemaining === null || due <= deferredRemaining;
  const preferred: PaymentTiming = chosen ?? (balanceAvailable ? 'balance' : 'deferred');
  const timing: PaymentTiming = preferred === 'balance'
    ? (balanceAvailable || !deferredAvailable ? 'balance' : 'deferred')
    : (deferredAvailable || !balanceAvailable ? 'deferred' : 'balance');
  return { timing, balanceAvailable, deferredAvailable, canOrder: balanceAvailable || deferredAvailable };
}
