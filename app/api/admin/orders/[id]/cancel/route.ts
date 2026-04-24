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

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('id, user_id, total_amount, payment_method, payment_status')
    .eq('id', params.id)
    .single();

  if (orderError || !order) {
    return NextResponse.json({ error: orderError?.message ?? '注文が見つかりません' }, { status: 404 });
  }

  if (!['balance', 'deferred'].includes(order.payment_method)) {
    return NextResponse.json({ error: 'この支払い方法の注文はキャンセルできません' }, { status: 400 });
  }

  if (order.payment_status !== 'completed') {
    return NextResponse.json({ error: '完了済みの注文だけキャンセルできます' }, { status: 400 });
  }

  const { error: cancelError } = await supabase.rpc('cancel_non_card_order', {
    p_order_id: params.id,
    p_actor_id: adminSession.user.id,
  });

  if (cancelError) {
    return NextResponse.json({ error: cancelError.message }, { status: 500 });
  }

  await logAdminAction(supabase, {
    actor_id: adminSession.user.id,
    action_type: 'order_cancelled',
    target_type: 'order',
    target_id: params.id,
    summary: `${order.total_amount.toLocaleString()}円の注文をキャンセルしました`,
    metadata: {
      user_id: order.user_id,
      payment_method: order.payment_method,
      amount: order.total_amount,
    },
  });

  revalidatePath('/');
  revalidatePath('/mypage');
  revalidatePath('/admin');
  revalidatePath('/admin/orders');
  revalidatePath('/admin/transactions');
  revalidatePath('/admin/stock');
  revalidatePath('/admin/items');
  revalidatePath('/admin/audit');

  return NextResponse.json({ ok: true });
}
