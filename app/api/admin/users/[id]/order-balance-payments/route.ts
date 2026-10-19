import { runAdminPayment } from '@/lib/payment-api';
import { isObjectId } from '@/lib/admin-objects';
import { parseBatchBalancePayment } from '@/lib/order-balance-payment';

export function POST(request: Request, { params }: { params: { id: string } }) {
  return runAdminPayment(request, 'admin_pay_orders_from_balance', async actor => {
    if (!isObjectId(params.id)) throw new Error('invalid user');
    const batch = parseBatchBalancePayment(await request.json());
    return { p_operation_id: batch.operationId, p_user_id: params.id, p_orders: batch.orders,
      p_expected_balance: batch.expectedBalance, p_actor_id: actor, p_reason: batch.reason };
  });
}
