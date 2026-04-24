import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/server';
import { requireAdminSession } from '@/lib/admin-session';
import { insertCashboxEntry } from '@/lib/cashbox';
import { logAdminAction } from '@/lib/admin-audit';

export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const adminSession = await requireAdminSession();
  if (!adminSession.user) {
    return NextResponse.json({ error: adminSession.error }, { status: adminSession.status });
  }

  const supabase = createAdminClient();
  const { data: charge, error: chargeError } = await supabase
    .from('charge_requests')
    .select('id, amount, method, status')
    .eq('id', params.id)
    .single();

  if (chargeError || !charge) {
    return NextResponse.json({ error: chargeError?.message ?? 'チャージ記録が見つかりません' }, { status: 404 });
  }

  if (charge.status !== 'approved' || charge.method !== 'cash') {
    return NextResponse.json({ error: '現金チャージの反映済み記録だけ精算確認できます' }, { status: 400 });
  }

  const { data: existingCashEntry } = await supabase
    .from('cashbox_entries')
    .select('id')
    .eq('charge_request_id', charge.id)
    .maybeSingle();

  if (!existingCashEntry) {
    await insertCashboxEntry(supabase, {
      entry_type: 'cash_charge',
      direction: 'in',
      amount: charge.amount,
      note: '現金チャージの受け取り確認',
      charge_request_id: charge.id,
      created_by: adminSession.user.id,
    });
  }

  await logAdminAction(supabase, {
    actor_id: adminSession.user.id,
    action_type: 'cash_charge_confirmed',
    target_type: 'charge_request',
    target_id: charge.id,
    summary: `${charge.amount.toLocaleString()}円の現金チャージを精算済みにしました`,
    metadata: { amount: charge.amount },
  });

  revalidatePath('/admin');
  revalidatePath('/admin/charge');
  revalidatePath('/admin/transactions');
  revalidatePath('/admin/cashbox');
  revalidatePath('/admin/audit');

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const adminSession = await requireAdminSession();
  if (!adminSession.user) {
    return NextResponse.json({ error: adminSession.error }, { status: adminSession.status });
  }

  const supabase = createAdminClient();
  const { data: charge, error: chargeError } = await supabase
    .from('charge_requests')
    .select('id, amount, method, status')
    .eq('id', params.id)
    .single();

  if (chargeError || !charge) {
    return NextResponse.json({ error: chargeError?.message ?? 'チャージ記録が見つかりません' }, { status: 404 });
  }

  if (charge.status !== 'approved' || charge.method !== 'cash') {
    return NextResponse.json({ error: '現金チャージだけ未精算に戻せます' }, { status: 400 });
  }

  await supabase.from('cashbox_entries').delete().eq('charge_request_id', charge.id);

  await logAdminAction(supabase, {
    actor_id: adminSession.user.id,
    action_type: 'cash_charge_unconfirmed',
    target_type: 'charge_request',
    target_id: charge.id,
    summary: `${charge.amount.toLocaleString()}円の現金チャージを未精算に戻しました`,
    metadata: { amount: charge.amount },
  });

  revalidatePath('/admin');
  revalidatePath('/admin/charge');
  revalidatePath('/admin/transactions');
  revalidatePath('/admin/cashbox');
  revalidatePath('/admin/audit');

  return NextResponse.json({ ok: true });
}
