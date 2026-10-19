import { isObjectId, isPendingCashOrder, isPendingDeferredOrder, type AdminOrder } from '@/lib/admin-objects';

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

export function parseBatchBalancePayment(body: any) {
  const quote = parseBalancePaymentQuote({ ...body, expected_amount: 1 });
  if (!isObjectId(body.operation_id) || !Array.isArray(body.orders) || !body.orders.length || body.orders.length > 1000 || typeof body.reason !== 'string' || !body.reason.trim() || body.reason.trim().length > 300) throw new Error('invalid batch');
  const orders = body.orders.map((entry: any) => {
    if (!isObjectId(entry?.id) || !Number.isSafeInteger(entry.expected_amount) || entry.expected_amount <= 0 || entry.expected_amount > 2147483647) throw new Error('invalid order');
    return { id: entry.id.toLowerCase(), expected_amount: entry.expected_amount as number };
  }).sort((a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id));
  if (new Set(orders.map((entry: { id: string }) => entry.id)).size !== orders.length || orders.reduce((sum: number, entry: { expected_amount: number }) => sum + entry.expected_amount, 0) > 2147483647) throw new Error('invalid total');
  return { orders, operationId: body.operation_id, expectedBalance: quote.expectedBalance, reason: body.reason.trim() };
}
