import { runAdminPayment } from '@/lib/payment-api';
import { isObjectId } from '@/lib/admin-objects';

export function POST(request: Request, { params }: { params: { id: string } }) {
  return runAdminPayment(request, 'refund_wallet_charge', async (actor) => {
    if (!isObjectId(params.id)) throw new Error('invalid id');
    return { p_charge_id: params.id, p_actor_id: actor };
  });
}
