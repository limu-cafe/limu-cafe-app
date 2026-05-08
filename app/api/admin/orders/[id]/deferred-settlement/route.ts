import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/server';
import { requireAdminSession } from '@/lib/admin-session';
import { insertCashboxEntry } from '@/lib/cashbox';
import { logAdminAction } from '@/lib/admin-audit';

function orderPeriodDate(value: string) {
  return new Date(value).toISOString().slice(0, 10);
}

export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const adminSession = await requireAdminSession();
  if (!adminSession.user) {
    return NextResponse.json({ error: adminSession.error }, { status: adminSession.status });
  }

  const supabase = createAdminClient();
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select(
      'id, user_id, total_amount, payment_method, deferred_settlement_method, payment_status, created_at, settled_at, settlement_source'
    )
    .eq('id', params.id)
    .single();

  if (orderError || !order) {
    return NextResponse.json({ error: orderError?.message ?? '注文が見つかりません' }, { status: 404 });
  }

  const deferredMethod = order.deferred_settlement_method ?? 'cash';
  if (order.payment_method !== 'deferred' || deferredMethod !== 'cash') {
    return NextResponse.json({ error: '現金で回収する後払い注文だけ精算確認できます' }, { status: 400 });
  }

  if (order.payment_status !== 'completed') {
    return NextResponse.json({ error: '完了済みの後払い注文だけ精算確認できます' }, { status: 400 });
  }

  if (order.settlement_source === 'deferred_settlement') {
    return NextResponse.json({ error: 'この後払い注文は別の精算に含まれて処理済みです' }, { status: 400 });
  }

  if (order.settlement_source === 'individual_deferred_order' && order.settled_at) {
    return NextResponse.json({ ok: true });
  }

  const { data: targetUser } = await supabase
    .from('users')
    .select('deferred_balance')
    .eq('id', order.user_id)
    .single();

  if ((targetUser?.deferred_balance ?? 0) < order.total_amount) {
    return NextResponse.json(
      { error: '現在の要回収残高より大きい後払い注文は個別精算できません' },
      { status: 400 }
    );
  }

  const settledAt = new Date().toISOString();
  const { data: settlement, error: settlementError } = await supabase
    .from('settlements')
    .insert({
      user_id: order.user_id,
      amount: order.total_amount,
      method: 'cash',
      period_start: orderPeriodDate(order.created_at),
      period_end: orderPeriodDate(order.created_at),
      status: 'completed',
      settled_at: settledAt,
      settled_by: adminSession.user.id,
      note: '後払い注文の個別精算',
    })
    .select('id')
    .single();

  if (settlementError || !settlement) {
    return NextResponse.json({ error: settlementError?.message ?? '精算記録の作成に失敗しました' }, { status: 500 });
  }

  await insertCashboxEntry(supabase, {
    entry_type: 'cash_settlement',
    direction: 'in',
    amount: order.total_amount,
    note: '後払い注文の個別精算',
    settlement_id: settlement.id,
    created_by: adminSession.user.id,
  });

  await supabase
    .from('users')
    .update({
      deferred_balance: Math.max(0, (targetUser?.deferred_balance ?? 0) - order.total_amount),
    })
    .eq('id', order.user_id);

  await supabase
    .from('orders')
    .update({
      settled_at: settledAt,
      settlement_source: 'individual_deferred_order',
      settlement_id: settlement.id,
    })
    .eq('id', order.id);

  await logAdminAction(supabase, {
    actor_id: adminSession.user.id,
    action_type: 'deferred_order_settled',
    target_type: 'order',
    target_id: order.id,
    summary: `${order.total_amount.toLocaleString()}円の後払い注文を精算済みにしました`,
    metadata: { amount: order.total_amount, settlement_id: settlement.id },
  });

  revalidatePath('/admin');
  revalidatePath('/admin/orders');
  revalidatePath('/admin/transactions');
  revalidatePath('/admin/users');
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
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('id, user_id, total_amount, settlement_source, settlement_id')
    .eq('id', params.id)
    .single();

  if (orderError || !order) {
    return NextResponse.json({ error: orderError?.message ?? '注文が見つかりません' }, { status: 404 });
  }

  if (order.settlement_source !== 'individual_deferred_order' || !order.settlement_id) {
    return NextResponse.json({ error: '個別精算した後払い注文だけ未精算に戻せます' }, { status: 400 });
  }

  await supabase.from('cashbox_entries').delete().eq('settlement_id', order.settlement_id);

  const { data: targetUser } = await supabase
    .from('users')
    .select('deferred_balance')
    .eq('id', order.user_id)
    .single();

  await supabase
    .from('users')
    .update({
      deferred_balance: (targetUser?.deferred_balance ?? 0) + order.total_amount,
    })
    .eq('id', order.user_id);

  await supabase
    .from('orders')
    .update({
      settled_at: null,
      settlement_source: null,
      settlement_id: null,
    })
    .eq('id', order.id);

  await supabase
    .from('settlements')
    .update({
      status: 'pending',
      settled_at: null,
      settled_by: null,
    })
    .eq('id', order.settlement_id);

  await logAdminAction(supabase, {
    actor_id: adminSession.user.id,
    action_type: 'deferred_order_unsettled',
    target_type: 'order',
    target_id: order.id,
    summary: `${order.total_amount.toLocaleString()}円の後払い注文を未精算に戻しました`,
    metadata: { amount: order.total_amount, settlement_id: order.settlement_id },
  });

  revalidatePath('/admin');
  revalidatePath('/admin/orders');
  revalidatePath('/admin/transactions');
  revalidatePath('/admin/users');
  revalidatePath('/admin/cashbox');
  revalidatePath('/admin/audit');

  return NextResponse.json({ ok: true });
}
