import { runAdminPayment } from '@/lib/payment-api';
import { isObjectId } from '@/lib/admin-objects';

// Old clients use the same transactional path as person-level reimbursement.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return runAdminPayment(request, 'admin_reimburse_advance', async actor => {
    if (!isObjectId(id)) throw new Error('invalid advance');
    return { p_purchase_run_id: id, p_actor_id: actor };
  });
}
