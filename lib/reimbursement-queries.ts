import { fetchRecentAndPendingRows } from '@/lib/transaction-history';
import type { ReimbursementRecord } from '@/lib/reimbursements';
import { isObjectId } from '@/lib/admin-objects';

/** Only requested receipt is read, after the page's management session guard. */
export async function readAdvanceReceipt(db: any, id: unknown) {
  if (!isObjectId(id)) return null;
  const result = await db.from('advance_reimbursement_batches')
    .select('operation_id,recipient_id,recipient_name,amount,created_at,items').eq('operation_id', id).maybeSingle();
  if (result.error) throw result.error;
  return result.data;
}

const SELECT = 'id, total_amount, payment_source, reimbursement_status, vendor, note, created_at, purchased_on, reimbursed_at, purchased_by, purchased_by_user:users!purchase_runs_purchased_by_fkey(id, name), created_by_user:users!purchase_runs_created_by_fkey(name), purchase_run_items(item_id, item_name, quantity, subtotal)';
const PAGE_SIZE = 40;

/** Read-only collection: all unpaid advances, a page of settled history, and an exact linked record. */
export async function readReimbursements(db: any, params: { page?: unknown; run?: unknown } = {}) {
  const candidate = Number(params.page);
  const historyPage = Number.isSafeInteger(candidate) && candidate > 0 && candidate <= 10000 ? candidate : 1;
  let hasMoreHistory = false;
  const collection = (withCount = false) => db.from('purchase_runs').select(SELECT, withCount ? { count: 'exact' } : undefined)
    .eq('payment_source', 'personal_advance');
  const recent = async () => {
    const result = await collection().in('reimbursement_status', ['reimbursed', 'not_needed'])
      .order('created_at', { ascending: false }).order('id', { ascending: false })
      .range((historyPage - 1) * PAGE_SIZE, historyPage * PAGE_SIZE);
    if (result.error) throw result.error;
    hasMoreHistory = (result.data?.length ?? 0) > PAGE_SIZE;
    return { ...result, data: result.data?.slice(0, PAGE_SIZE) ?? [] };
  };
  const purchaseRuns = await fetchRecentAndPendingRows<ReimbursementRecord>({
    recent: recent(),
    pending: [(from, to) => collection(true).eq('reimbursement_status', 'pending_reimbursement')
      .order('created_at', { ascending: false }).order('id', { ascending: false }).range(from, to)],
  });
  if (typeof params.run === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(params.run)
      && !purchaseRuns.some(run => run.id === params.run)) {
    const result = await collection().eq('id', params.run).maybeSingle();
    if (result.error) throw result.error;
    if (result.data) purchaseRuns.unshift(result.data);
  }
  return { purchaseRuns, historyPage, hasMoreHistory };
}
