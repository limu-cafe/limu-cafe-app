import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/server';
import { requireAdminSession } from '@/lib/admin-session';
import { logAdminAction } from '@/lib/admin-audit';

export async function POST(request: Request) {
  const adminSession = await requireAdminSession();
  if (!adminSession.user) {
    return NextResponse.json({ error: adminSession.error }, { status: adminSession.status });
  }

  const supabase = createAdminClient();
  const body = await request.json();

  const kind = body.kind === 'misc' ? 'misc' : 'product';
  const totalAmount = Number(body.total_amount);
  const vendor = typeof body.vendor === 'string' ? body.vendor.trim() || null : null;
  const note = typeof body.note === 'string' ? body.note.trim() || null : null;

  if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
    return NextResponse.json({ error: '立替額を入力してください' }, { status: 400 });
  }

  let summary = '';
  let purchaseRunId: string | null = null;

  if (kind === 'product') {
    const itemId = typeof body.item_id === 'string' ? body.item_id : '';
    const quantity = Number(body.quantity);

    if (!itemId) {
      return NextResponse.json({ error: '商品を選択してください' }, { status: 400 });
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      return NextResponse.json({ error: '個数を入力してください' }, { status: 400 });
    }

    const { data: item, error: itemError } = await supabase
      .from('items')
      .select('id, name')
      .eq('id', itemId)
      .single();

    if (itemError || !item) {
      return NextResponse.json({ error: '商品が見つかりません' }, { status: 404 });
    }

    const { data: purchaseRun, error: purchaseRunError } = await supabase
      .from('purchase_runs')
      .insert({
        total_amount: totalAmount,
        payment_source: 'personal_advance',
        reimbursement_status: 'pending_reimbursement',
        vendor,
        note,
        purchased_by: adminSession.user.id,
        created_by: adminSession.user.id,
      })
      .select('id')
      .single();

    if (purchaseRunError || !purchaseRun) {
      return NextResponse.json(
        { error: purchaseRunError?.message ?? '立替記録に失敗しました' },
        { status: 500 }
      );
    }

    const { error: purchaseItemError } = await supabase.from('purchase_run_items').insert({
      purchase_run_id: purchaseRun.id,
      item_id: item.id,
      item_name: item.name,
      quantity,
      unit_price: Math.round(totalAmount / quantity),
      subtotal: totalAmount,
    });

    if (purchaseItemError) {
      return NextResponse.json({ error: purchaseItemError.message }, { status: 500 });
    }

    purchaseRunId = purchaseRun.id;
    summary = `${item.name} の立替 ${totalAmount.toLocaleString()}円を記録しました`;
  } else {
    const label = typeof body.label === 'string' ? body.label.trim() : '';
    if (!label) {
      return NextResponse.json({ error: '立て替えたものを入力してください' }, { status: 400 });
    }

    const compositeNote = [label, note].filter(Boolean).join(' / ') || label;

    const { data: purchaseRun, error: purchaseRunError } = await supabase
      .from('purchase_runs')
      .insert({
        total_amount: totalAmount,
        payment_source: 'personal_advance',
        reimbursement_status: 'pending_reimbursement',
        vendor,
        note: compositeNote,
        purchased_by: adminSession.user.id,
        created_by: adminSession.user.id,
      })
      .select('id')
      .single();

    if (purchaseRunError || !purchaseRun) {
      return NextResponse.json(
        { error: purchaseRunError?.message ?? '立替記録に失敗しました' },
        { status: 500 }
      );
    }

    purchaseRunId = purchaseRun.id;
    summary = `${label} の立替 ${totalAmount.toLocaleString()}円を記録しました`;
  }

  if (purchaseRunId) {
    await logAdminAction(supabase, {
      actor_id: adminSession.user.id,
      action_type: 'purchase_advance_recorded',
      target_type: 'purchase_run',
      target_id: purchaseRunId,
      summary,
      metadata: body,
    });
  }

  revalidatePath('/admin');
  revalidatePath('/admin/reimbursements');
  revalidatePath('/admin/cashbox');
  revalidatePath('/admin/audit');

  return NextResponse.json({ ok: true });
}
