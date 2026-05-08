import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/server';
import { requireAdminSession } from '@/lib/admin-session';
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
  const { data: settlement, error: settlementError } = await supabase
    .from('settlements')
    .select('id, user_id, amount, method, status')
    .eq('id', params.id)
    .single();

  if (settlementError || !settlement) {
    return NextResponse.json({ error: settlementError?.message ?? '精算記録が見つかりません' }, { status: 404 });
  }

  if (settlement.status !== 'completed') {
    return NextResponse.json({ error: '完了済みの精算だけ未精算に戻せます' }, { status: 400 });
  }

  if (settlement.method === 'balance') {
    const { data: user } = await supabase
      .from('users')
      .select('balance')
      .eq('id', settlement.user_id)
      .single();

    const { error: balanceError } = await supabase
      .from('users')
      .update({ balance: (user?.balance ?? 0) + settlement.amount })
      .eq('id', settlement.user_id);

    if (balanceError) {
      return NextResponse.json({ error: balanceError.message }, { status: 500 });
    }
  }

  const { data: deferredUser } = await supabase
    .from('users')
    .select('deferred_balance')
    .eq('id', settlement.user_id)
    .single();

  const { error: deferredError } = await supabase
    .from('users')
    .update({ deferred_balance: (deferredUser?.deferred_balance ?? 0) + settlement.amount })
    .eq('id', settlement.user_id);

  if (deferredError) {
    return NextResponse.json({ error: deferredError.message }, { status: 500 });
  }

  if (settlement.method === 'cash') {
    await supabase.from('cashbox_entries').delete().eq('settlement_id', settlement.id);
  }

  await supabase
    .from('charge_requests')
    .update({
      settled_at: null,
      settlement_source: null,
      settlement_id: null,
    })
    .eq('settlement_id', settlement.id)
    .eq('settlement_source', 'deferred_settlement');

  await supabase
    .from('orders')
    .update({
      settled_at: null,
      settlement_source: null,
      settlement_id: null,
    })
    .eq('settlement_id', settlement.id)
    .eq('settlement_source', 'deferred_settlement');

  const { error: updateError } = await supabase
    .from('settlements')
    .update({
      status: 'pending',
      settled_at: null,
      settled_by: null,
    })
    .eq('id', settlement.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  await logAdminAction(supabase, {
    actor_id: adminSession.user.id,
    action_type: 'settlement_reverted',
    target_type: 'settlement',
    target_id: settlement.id,
    summary: `${settlement.amount.toLocaleString()}円の精算を未精算に戻しました`,
    metadata: {
      user_id: settlement.user_id,
      method: settlement.method,
      amount: settlement.amount,
    },
  });

  revalidatePath('/admin');
  revalidatePath('/admin/settlement');
  revalidatePath('/admin/transactions');
  revalidatePath('/admin/users');
  revalidatePath('/admin/cashbox');
  revalidatePath('/admin/audit');

  return NextResponse.json({ ok: true });
}
