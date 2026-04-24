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
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('id, total_amount, payment_method, payment_status')
    .eq('id', params.id)
    .single();

  if (orderError || !order) {
    return NextResponse.json({ error: orderError?.message ?? '注文が見つかりません' }, { status: 404 });
  }

  if (order.payment_method !== 'cash') {
    return NextResponse.json({ error: '現金注文だけ精算確認できます' }, { status: 400 });
  }

  const { data: existingCashEntry } = await supabase
    .from('cashbox_entries')
    .select('id')
    .eq('order_id', order.id)
    .maybeSingle();

  if (!existingCashEntry) {
    await insertCashboxEntry(supabase, {
      entry_type: 'cash_order',
      direction: 'in',
      amount: order.total_amount,
      note: '現金払い注文の受け取り確認',
      order_id: order.id,
      created_by: adminSession.user.id,
    });
  }

  const { error: updateError } = await supabase
    .from('orders')
    .update({
      payment_status: 'completed',
      cash_confirmed_at: new Date().toISOString(),
      cash_confirmed_by: adminSession.user.id,
    })
    .eq('id', order.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  await logAdminAction(supabase, {
    actor_id: adminSession.user.id,
    action_type: 'cash_order_confirmed',
    target_type: 'order',
    target_id: order.id,
    summary: `現金注文 ${order.total_amount.toLocaleString()}円を精算済みにしました`,
    metadata: { amount: order.total_amount },
  });

  revalidatePath('/admin');
  revalidatePath('/admin/orders');
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
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('id, total_amount, payment_method')
    .eq('id', params.id)
    .single();

  if (orderError || !order) {
    return NextResponse.json({ error: orderError?.message ?? '注文が見つかりません' }, { status: 404 });
  }

  if (order.payment_method !== 'cash') {
    return NextResponse.json({ error: '現金注文だけ未精算に戻せます' }, { status: 400 });
  }

  await supabase.from('cashbox_entries').delete().eq('order_id', order.id);

  const { error: updateError } = await supabase
    .from('orders')
    .update({
      payment_status: 'pending',
      cash_confirmed_at: null,
      cash_confirmed_by: null,
    })
    .eq('id', order.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  await logAdminAction(supabase, {
    actor_id: adminSession.user.id,
    action_type: 'cash_order_unconfirmed',
    target_type: 'order',
    target_id: order.id,
    summary: `現金注文 ${order.total_amount.toLocaleString()}円を未精算に戻しました`,
    metadata: { amount: order.total_amount },
  });

  revalidatePath('/admin');
  revalidatePath('/admin/orders');
  revalidatePath('/admin/transactions');
  revalidatePath('/admin/cashbox');
  revalidatePath('/admin/audit');

  return NextResponse.json({ ok: true });
}
