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
    .select('id, user_id, amount, method, status, settled_at, settlement_source')
    .eq('id', params.id)
    .single();

  if (chargeError || !charge) {
    return NextResponse.json({ error: chargeError?.message ?? 'チャージ記録が見つかりません' }, { status: 404 });
  }

  if (charge.status !== 'approved' || charge.method !== 'cash') {
    return NextResponse.json({ error: '現金チャージの反映済み記録だけ精算確認できます' }, { status: 400 });
  }

  if (charge.settlement_source === 'deferred_settlement') {
    return NextResponse.json(
      { error: 'この現金チャージは後払い精算に含めて精算済みです' },
      { status: 400 }
    );
  }

  if (charge.settled_at) {
    return NextResponse.json({ ok: true });
  }

  const now = new Date().toISOString();
  const { data: targetUser } = await supabase
    .from('users')
    .select('deferred_balance')
    .eq('id', charge.user_id)
    .single();

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

  await supabase
    .from('charge_requests')
    .update({
      settled_at: now,
      settlement_source: 'individual_cash_charge',
      settlement_id: null,
    })
    .eq('id', charge.id);

  await supabase
    .from('users')
    .update({
      deferred_balance: Math.max(0, (targetUser?.deferred_balance ?? 0) - charge.amount),
    })
    .eq('id', charge.user_id);

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
    .select('id, user_id, amount, method, status, settlement_source')
    .eq('id', params.id)
    .single();

  if (chargeError || !charge) {
    return NextResponse.json({ error: chargeError?.message ?? 'チャージ記録が見つかりません' }, { status: 404 });
  }

  if (charge.status !== 'approved' || charge.method !== 'cash') {
    return NextResponse.json({ error: '現金チャージだけ未精算に戻せます' }, { status: 400 });
  }

  if (charge.settlement_source !== 'individual_cash_charge') {
    return NextResponse.json(
      { error: '後払い精算に含まれた現金チャージはここから戻せません' },
      { status: 400 }
    );
  }

  await supabase.from('cashbox_entries').delete().eq('charge_request_id', charge.id);
  await supabase
    .from('charge_requests')
    .update({
      settled_at: null,
      settlement_source: null,
      settlement_id: null,
    })
    .eq('id', charge.id);
  const { data: targetUser } = await supabase
    .from('users')
    .select('deferred_balance')
    .eq('id', charge.user_id)
    .single();
  await supabase
    .from('users')
    .update({
      deferred_balance: (targetUser?.deferred_balance ?? 0) + charge.amount,
    })
    .eq('id', charge.user_id);

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
