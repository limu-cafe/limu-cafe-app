import { isPendingCashOrder, isPendingDeferredOrder, type AdminOrder } from '@/lib/admin-objects';

export type BalancePayableOrder = AdminOrder & { accounting_ready: boolean; cash_confirmed_at?: string | null; settlement_id?: string | null };
export function orderCashDue(order: Pick<AdminOrder, 'total_amount' | 'points_used'>) {
  return order.total_amount - (order.points_used ?? 0);
}
export function canPayOrderFromBalance(order: AdminOrder) {
  return order.accounting_ready === true && (order.points_used ?? 0) >= 0 && (isPendingCashOrder(order) || isPendingDeferredOrder(order)) &&
    !order.settled_at && !order.settlement_source && !order.settlement_id && !order.cash_confirmed_at && orderCashDue(order) > 0;
}
export function parseBalancePaymentQuote(body: any) {
  if (body?.confirm_unpaid !== true || !Number.isSafeInteger(body.expected_amount) || body.expected_amount <= 0 || body.expected_amount > 2147483647 || !Number.isSafeInteger(body.expected_balance) || body.expected_balance < 0 || body.expected_balance > 2147483647) throw new Error('金額・残高と、現金未払いの確認が必要です');
  return { expectedAmount: body.expected_amount as number, expectedBalance: body.expected_balance as number };
}
