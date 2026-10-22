import { requireAdminPage } from '@/lib/admin-page-session';
import { createAdminClient } from '@/lib/supabase/server';
import ReimbursementsClient from './ReimbursementsClient';

export const dynamic = 'force-dynamic';

type MiscExpenseNoteRow = {
  note: string | null;
};

type PurchaseRunListRow = {
  purchase_run_items?: Array<{ item_name: string; quantity: number }> | null;
  note: string | null;
};

export default async function AdminReimbursementsPage({searchParams: pendingSearch}: {searchParams?: Promise<{run?:string}>}) {
  await requireAdminPage();
  const supabase = createAdminClient();

  const [{ data: items }, { data: purchaseRuns }, { data: miscExpenseNotes }] = await Promise.all([
    supabase
      .from('items')
      .select('id, name, category:categories(name, icon)')
      .order('name'),
    supabase
      .from('purchase_runs')
      .select(
        'id, total_amount, payment_source, reimbursement_status, vendor, note, created_at, reimbursed_at, created_by_user:users!purchase_runs_created_by_fkey(name), purchase_run_items(item_name, quantity)'
      )
      .eq('payment_source', 'personal_advance')
      .order('created_at', { ascending: false })
      .limit(40),
    supabase
      .from('cashbox_entries')
      .select('note')
      .eq('entry_type', 'misc_expense')
      .order('created_at', { ascending: false })
      .limit(30),
  ]);

  const purchaseRunData = [...(purchaseRuns ?? [])];
  const selectedId = (await pendingSearch)?.run;
  // A contextual link must still find an older record beyond the recent list.
  if (selectedId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(selectedId) && !purchaseRunData.some(run=>run.id===selectedId)) {
    const {data: selectedRun,error} = await supabase.from('purchase_runs').select('id, total_amount, payment_source, reimbursement_status, vendor, note, created_at, reimbursed_at, created_by_user:users!purchase_runs_created_by_fkey(name), purchase_run_items(item_name, quantity)').eq('id',selectedId).eq('payment_source','personal_advance').maybeSingle();
    if(error) throw error;
    if(selectedRun) purchaseRunData.unshift(selectedRun);
  }

  const miscExamples = Array.from(
    new Set(
      [
        ...((miscExpenseNotes ?? []) as MiscExpenseNoteRow[])
          .map((entry: MiscExpenseNoteRow) => entry.note?.split(' / ')[0]?.trim())
          .filter(Boolean),
        ...(purchaseRunData as PurchaseRunListRow[])
          .filter((run: PurchaseRunListRow) => (run.purchase_run_items ?? []).length === 0)
          .map((run: PurchaseRunListRow) => run.note?.split(' / ')[0]?.trim())
          .filter(Boolean),
      ] as string[]
    )
  ).slice(0, 20);

  return (
    <ReimbursementsClient
      items={(items ?? []) as Array<{ id: string; name: string; category?: { name?: string; icon?: string } | null }>}
      purchaseRuns={purchaseRunData}
      miscExamples={miscExamples}
    />
  );
}
