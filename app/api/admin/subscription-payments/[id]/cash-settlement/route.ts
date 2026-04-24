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
  const { data: payment, error } = await supabase
    .from('subscription_payments')
    .select(
      'id, amount, cash_due_amount, payment_status, subscription_product:subscription_products!subscription_payments_subscription_product_id_fkey(name)'
    )
    .eq('id', params.id)
    .single();

  if (error || !payment) {
    return NextResponse.json({ error: error?.message ?? 'サブスク支払が見つかりません' }, { status: 404 });
  }

  if (payment.cash_due_amount <= 0) {
    return NextResponse.json({ error: '現金精算が必要な支払ではありません' }, { status: 400 });
  }

  if (payment.payment_status !== 'pending_cash_settlement') {
    return NextResponse.json({ error: '未精算の支払だけ精算できます' }, { status: 400 });
  }

  await insertCashboxEntry(supabase, {
    entry_type: 'cash_subscription',
    direction: 'in',
    amount: payment.cash_due_amount,
    note: 'サブスク現金精算',
    subscription_payment_id: payment.id,
    created_by: adminSession.user.id,
  });

  const { error: updateError } = await supabase
    .from('subscription_payments')
    .update({ payment_status: 'completed' })
    .eq('id', payment.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  await logAdminAction(supabase, {
    actor_id: adminSession.user.id,
    action_type: 'subscription_payment_settled',
    target_type: 'subscription_payment',
    target_id: payment.id,
    summary: `${payment.subscription_product?.name ?? 'サブスク'}の現金精算を完了しました`,
    metadata: { cash_due_amount: payment.cash_due_amount, amount: payment.amount },
  });

  revalidatePath('/admin');
  revalidatePath('/admin/transactions');
  revalidatePath('/admin/cashbox');
  revalidatePath('/admin/subscriptions');
  revalidatePath('/mypage');

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
  const { data: payment, error } = await supabase
    .from('subscription_payments')
    .select('id, cash_due_amount, payment_status')
    .eq('id', params.id)
    .single();

  if (error || !payment) {
    return NextResponse.json({ error: error?.message ?? 'サブスク支払が見つかりません' }, { status: 404 });
  }

  if (payment.cash_due_amount <= 0 || payment.payment_status !== 'completed') {
    return NextResponse.json({ error: '未精算に戻せる支払ではありません' }, { status: 400 });
  }

  await supabase
    .from('cashbox_entries')
    .delete()
    .eq('subscription_payment_id', payment.id);

  const { error: updateError } = await supabase
    .from('subscription_payments')
    .update({ payment_status: 'pending_cash_settlement' })
    .eq('id', payment.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  revalidatePath('/admin');
  revalidatePath('/admin/transactions');
  revalidatePath('/admin/cashbox');
  revalidatePath('/admin/subscriptions');
  revalidatePath('/mypage');

  return NextResponse.json({ ok: true });
}
