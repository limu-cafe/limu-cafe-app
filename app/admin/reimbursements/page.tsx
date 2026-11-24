import {emptyIntake} from '@/lib/stock-intakes';
import { requireAdminPage } from '@/lib/admin-page-session';
import { createAdminClient } from '@/lib/supabase/server';
import ReimbursementsClient from './ReimbursementsClient';
import { readReimbursements, readAdvanceReceipt } from '@/lib/reimbursement-queries';

export const dynamic = 'force-dynamic';

type MiscExpenseNoteRow = {
  note: string | null;
};

type PurchaseRunListRow = {
  purchase_run_items?: Array<{ item_name: string; quantity: number;item_id?:string|null }> | null;
  note: string | null;
};

export default async function AdminReimbursementsPage({searchParams: pendingSearch}: {searchParams?: Promise<{run?:string;page?:string;receipt?:string}>}) {
  await requireAdminPage();
  const supabase = createAdminClient();
  const params = (await pendingSearch) ?? {};

  const [itemsResult, records, notesResult, receipt] = await Promise.all([
    supabase
      .from('items')
      .select('id, name, is_unlimited_stock, category:categories(name, icon)')
      .order('name'),
    readReimbursements(supabase, params),
    supabase
      .from('cashbox_entries')
      .select('note')
      .eq('entry_type', 'misc_expense')
      .order('created_at', { ascending: false })
      .limit(30),
    readAdvanceReceipt(supabase, params.receipt),
  ]);

  if (itemsResult.error) throw itemsResult.error;
  if (notesResult.error) throw notesResult.error;
  const items = itemsResult.data;
  const miscExpenseNotes = notesResult.data;
  const purchaseRunData = records.purchaseRuns;

  const miscExamples = Array.from(
    new Set(
      [
        ...((miscExpenseNotes ?? []) as MiscExpenseNoteRow[])
          .map((entry: MiscExpenseNoteRow) => entry.note?.split(' / ')[0]?.trim())
          .filter(Boolean),
        ...(purchaseRunData as PurchaseRunListRow[]).flatMap(run=>(run.purchase_run_items??[]).filter(line=>line.item_id===null).map(line=>line.item_name)),
        ...(purchaseRunData as PurchaseRunListRow[])
          .filter((run: PurchaseRunListRow) => (run.purchase_run_items ?? []).length === 0)
          .map((run: PurchaseRunListRow) => run.note?.split(' / ')[0]?.trim())
          .filter(Boolean),
      ] as string[]
    )
  ).slice(0, 20);

  return (
    <ReimbursementsClient initialDraft={emptyIntake('personal_advance')}
      items={(items ?? []) as Array<{ id: string; name: string; category?: { name?: string; icon?: string } | null }>}
      purchaseRuns={purchaseRunData}
      miscExamples={miscExamples}
      historyPage={records.historyPage}
      hasMoreHistory={records.hasMoreHistory}
      receipt={receipt}
    />
  );
}
