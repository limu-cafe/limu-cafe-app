import { runAdminPayment } from '@/lib/payment-api';
import { isObjectId } from '@/lib/admin-objects';

export function POST(request: Request) {
  return runAdminPayment(request, 'complete_deferred_collection', async (actor) => {
    const body = await request.json();
    const date = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(value + 'T00:00:00Z').toISOString().slice(0,10) === value;
    if (!isObjectId(body.user_id) || !Number.isSafeInteger(body.amount) || body.amount <= 0 || body.amount > 2147483647 || !['cash','balance','stripe'].includes(body.method) || !date(body.period_start) || !date(body.period_end)) throw new Error('invalid input');
    return { p_user_id: body.user_id, p_amount: body.amount, p_method: body.method, p_period_start: body.period_start, p_period_end: body.period_end, p_actor_id: actor };
  });
}
