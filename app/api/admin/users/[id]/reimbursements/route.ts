import { runAdminPayment } from '@/lib/payment-api';
import { isObjectId } from '@/lib/admin-objects';
import { parseAdvanceBatch } from '@/lib/reimbursements';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return runAdminPayment(request, 'admin_reimburse_advances', async actor => {
    if (!isObjectId(id)) throw new Error('invalid recipient');
    const batch = parseAdvanceBatch(await request.json());
    return { p_operation_id: batch.operationId, p_recipient_id: id, p_runs: batch.runs, p_actor_id: actor };
  });
}
