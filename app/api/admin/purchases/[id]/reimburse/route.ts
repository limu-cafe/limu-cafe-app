import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { insertCashboxEntry } from '@/lib/cashbox';
import { logAdminAction } from '@/lib/admin-audit';

export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const sessionClient = await createClient();
  const {
    data: { user },
  } = await sessionClient.auth.getUser();
  const supabase = createAdminClient();

  const { data: purchaseRun, error: purchaseRunError } = await supabase
    .from('purchase_runs')
    .select('id, total_amount, vendor, note, reimbursement_status')
    .eq('id', params.id)
    .single();

  if (purchaseRunError || !purchaseRun) {
    return NextResponse.json({ error: '立替記録が見つかりません' }, { status: 404 });
  }

  if (purchaseRun.reimbursement_status !== 'pending_reimbursement') {
    return NextResponse.json({ error: 'この立替はすでに精算済みです' }, { status: 400 });
  }

  await insertCashboxEntry(supabase, {
    entry_type: 'advance_reimbursement',
    direction: 'out',
    amount: purchaseRun.total_amount,
    purchase_run_id: purchaseRun.id,
    note: purchaseRun.note?.trim() || `立替精算${purchaseRun.vendor ? ` / ${purchaseRun.vendor}` : ''}`,
    created_by: user?.id ?? null,
  });

  const { error: updateError } = await supabase
    .from('purchase_runs')
    .update({
      reimbursement_status: 'reimbursed',
      reimbursed_at: new Date().toISOString(),
      reimbursed_by: user?.id ?? null,
    })
    .eq('id', purchaseRun.id)
    .eq('reimbursement_status', 'pending_reimbursement');

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  await logAdminAction(supabase, {
    actor_id: user?.id ?? null,
    action_type: 'purchase_advance_reimbursed',
    target_type: 'purchase_run',
    target_id: purchaseRun.id,
    summary: `立替 ${purchaseRun.total_amount.toLocaleString()}円 を金庫から精算しました`,
    metadata: {
      amount: purchaseRun.total_amount,
      vendor: purchaseRun.vendor,
      note: purchaseRun.note,
    },
  });

  revalidatePath('/admin');
  revalidatePath('/admin/stock');
  revalidatePath('/admin/cashbox');
  revalidatePath('/admin/audit');

  return NextResponse.json({ ok: true });
}
