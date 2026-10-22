import { runAdminPayment } from '@/lib/payment-api';
import { isObjectId } from '@/lib/admin-objects';
import { parseBalancePaymentQuote } from '@/lib/order-balance-payment';

export async function POST(request: Request, { params: pendingParams }: { params: Promise<{ id: string }> }) {
  const params = await pendingParams;
  return runAdminPayment(request, 'admin_pay_order_from_balance', async (actorId) => {
    if (!isObjectId(params.id)) throw new Error('invalid order');
    const body = await request.json();
    const quote = parseBalancePaymentQuote(body);
    if (typeof body.reason !== 'string' || !body.reason.trim() || body.reason.trim().length > 300) throw new Error('reason required');
    return { p_order_id: params.id, p_expected_amount: quote.expectedAmount,
      p_expected_balance: quote.expectedBalance, p_actor_id: actorId, p_reason: body.reason.trim() };
  });
}
