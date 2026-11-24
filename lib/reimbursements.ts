import { isObjectId } from '@/lib/admin-objects';

export type ReimbursementItem = {
  id: string;
  name: string;
  is_unlimited_stock?:boolean;
  category?: { name?: string; icon?: string } | null;
};

export type ReimbursementRecord = {
  id: string;
  total_amount: number;
  payment_source: 'cashbox' | 'personal_advance';
  reimbursement_status: 'not_needed' | 'pending_reimbursement' | 'reimbursed';
  vendor: string | null;
  note: string | null;
  created_at: string;
  purchased_on?: string | null;
  reimbursed_at?: string | null;
  purchased_by?: string | null;
  purchased_by_user?: { id?: string; name?: string | null } | null;
  created_by_user?: { name?: string | null } | null;
  purchase_run_items?: Array<{ item_id?: string | null; item_name: string; quantity: number; subtotal?: number | null }> | null;
};

export type AdvanceDraft = {
  kind: 'product' | 'misc'; itemId: string; quantity: string;
  label: string; amount: string; vendor: string; note: string;
};
export const emptyAdvanceDraft = (): AdvanceDraft => ({
  kind: 'product', itemId: '', quantity: '', label: '', amount: '', vendor: '', note: '',
});
export function reimbursementTitle(record: ReimbursementRecord) {
  return (record.purchase_run_items ?? []).map(item => `${item.item_name} × ${item.quantity}`).join(' / ')
    || record.note?.split(' / ')[0] || '立替記録';
}
export function reimbursementOwner(record: ReimbursementRecord) {
  // Old preview/legacy callers had only the recorder. A present-but-null payer
  // must never be replaced with a different person who entered the record.
  return ('purchased_by_user' in record ? record.purchased_by_user?.name : record.created_by_user?.name) ?? '立替者未登録';
}
export function reimbursementPayerId(record: ReimbursementRecord) {
  return (('purchased_by' in record ? record.purchased_by : record.purchased_by_user?.id) || null)?.toLowerCase() ?? null;
}
export type ReimbursementPerson = { id: string; name: string; records: ReimbursementRecord[]; total: number };
export function groupPendingAdvances(records: ReimbursementRecord[]) {
  const byId = new Map<string, ReimbursementPerson>();
  const unassigned: ReimbursementRecord[] = [];
  for (const record of records) {
    if (record.payment_source !== 'personal_advance' || record.reimbursement_status !== 'pending_reimbursement') continue;
    const id = reimbursementPayerId(record);
    if (!id) { unassigned.push(record); continue; }
    const person = byId.get(id) ?? { id, name: reimbursementOwner(record), records: [], total: 0 };
    person.records.push(record); person.total += record.total_amount; byId.set(id, person);
  }
  return { people: Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name, 'ja') || a.id.localeCompare(b.id)), unassigned };
}
export function parseAdvanceBatch(body: any) {
  if (!body || !isObjectId(body.operation_id) || body.confirm_cash_paid !== true || !Array.isArray(body.runs) || body.runs.length < 1 || body.runs.length > 10000) throw new Error('invalid batch');
  const runs = body.runs.map((row: any) => {
    if (!row || !isObjectId(row.id) || !Number.isInteger(row.expected_amount) || row.expected_amount < 1 || row.expected_amount > 2147483647) throw new Error('invalid advance');
    return { id: row.id.toLowerCase() as string, expected_amount: row.expected_amount as number };
  }).sort((a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id));
  if (new Set(runs.map((row: { id: string }) => row.id)).size !== runs.length) throw new Error('duplicate advance');
  return { operationId: body.operation_id.toLowerCase() as string, runs };
}
/** This screen records an existing advance; it does not add inventory. */
export function advancePayload(draft: AdvanceDraft) {
  const total = Number(draft.amount);
  if (!Number.isSafeInteger(total) || total < 1 || total > 2147483647) throw new Error('立替額は1円以上の整数で入力してください');
  const common = { total_amount: total, vendor: draft.vendor.trim(), note: draft.note.trim() };
  if (draft.kind === 'misc') {
    if (!draft.label.trim()) throw new Error('立て替えたものを入力してください');
    return { kind: 'misc' as const, label: draft.label.trim(), ...common };
  }
  if (!draft.itemId) throw new Error('商品を選択してください');
  const quantity = Number(draft.quantity);
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 2147483647) throw new Error('個数は1以上の整数で入力してください');
  return { kind: 'product' as const, item_id: draft.itemId, quantity, ...common };
}
