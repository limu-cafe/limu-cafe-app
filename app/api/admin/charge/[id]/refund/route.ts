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

  const { data: charge, error: chargeError } = await supabase
    .from('charge_requests')
    .select('id, user_id, amount, method, status')
    .eq('id', params.id)
    .single();

  if (chargeError || !charge) {
    return NextResponse.json({ error: chargeError?.message ?? 'チャージ記録が見つかりません' }, { status: 404 });
  }

  const { error: refundError } = await supabase.rpc('refund_charge_request', {
    p_charge_request_id: params.id,
    p_actor_id: adminSession.user.id,
  });

  if (refundError) {
    return NextResponse.json({ error: refundError.message }, { status: 500 });
  }

  await logAdminAction(supabase, {
    actor_id: adminSession.user.id,
    action_type: 'charge_refunded',
    target_type: 'charge_request',
    target_id: params.id,
    summary: `${charge.amount.toLocaleString()}円のチャージを返金しました`,
    metadata: {
      user_id: charge.user_id,
      method: charge.method,
      amount: charge.amount,
      previous_status: charge.status,
    },
  });

  revalidatePath('/mypage');
  revalidatePath('/admin');
  revalidatePath('/admin/charge');
  revalidatePath('/admin/cashbox');
  revalidatePath('/admin/audit');

  return NextResponse.json({ ok: true });
}
