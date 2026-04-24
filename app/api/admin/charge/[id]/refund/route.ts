import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/server';
import { requireAdminSession } from '@/lib/admin-session';
import { logAdminAction } from '@/lib/admin-audit';
import { insertCashboxEntry } from '@/lib/cashbox';

type RewardPointRow = {
  delta: number | null;
};

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

  if (charge.status !== 'approved') {
    return NextResponse.json({ error: '反映済みのチャージだけ返金できます' }, { status: 400 });
  }

  const [{ data: targetUser, error: userError }, { data: existingCashEntry }, { data: rewardRows }] =
    await Promise.all([
      supabase
        .from('users')
        .select('balance, deferred_balance')
        .eq('id', charge.user_id)
        .single(),
      supabase
        .from('cashbox_entries')
        .select('id')
        .eq('charge_request_id', charge.id)
        .maybeSingle(),
      supabase
        .from('point_transactions')
        .select('delta')
        .eq('charge_request_id', charge.id)
        .eq('reason_type', 'charge_reward'),
    ]);

  if (userError || !targetUser) {
    return NextResponse.json({ error: userError?.message ?? 'ユーザーが見つかりません' }, { status: 404 });
  }

  if ((targetUser.balance ?? 0) < charge.amount || (targetUser.deferred_balance ?? 0) < charge.amount) {
    return NextResponse.json(
      { error: '現在の残高または後払い残高が不足しているため返金できません' },
      { status: 400 }
    );
  }

  const { error: balanceError } = await supabase
    .from('users')
    .update({
      balance: targetUser.balance - charge.amount,
      deferred_balance: targetUser.deferred_balance - charge.amount,
    })
    .eq('id', charge.user_id);

  if (balanceError) {
    return NextResponse.json({ error: balanceError.message }, { status: 500 });
  }

  if (charge.method === 'cash' && existingCashEntry) {
    await insertCashboxEntry(supabase, {
      entry_type: 'manual_out',
      direction: 'out',
      amount: charge.amount,
      note: `チャージ返金: ${charge.id}`,
      created_by: adminSession.user.id,
    });
  }

  const rewardPoints = ((rewardRows ?? []) as RewardPointRow[]).reduce(
    (sum: number, row: RewardPointRow) => sum + (row.delta ?? 0),
    0
  );
  if (rewardPoints > 0) {
    const { error: rewardError } = await supabase.rpc('record_point_transaction', {
      p_user_id: charge.user_id,
      p_delta: -rewardPoints,
      p_reason_type: 'charge_refund_reversal',
      p_charge_request_id: charge.id,
      p_order_id: null,
      p_note: `チャージ返金によるポイント取消 ${rewardPoints}pt`,
      p_created_by: adminSession.user.id,
      p_subscription_payment_id: null,
    });

    if (rewardError) {
      console.error('[admin charge refund] point reversal failed', rewardError);
    }
  }

  const note = charge.note ? `${charge.note}\n返金処理済み` : '返金処理済み';
  const { error: updateError } = await supabase
    .from('charge_requests')
    .update({
      status: 'refunded',
      note,
      updated_at: new Date().toISOString(),
    })
    .eq('id', charge.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
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
  revalidatePath('/admin/transactions');
  revalidatePath('/admin/cashbox');
  revalidatePath('/admin/audit');

  return NextResponse.json({ ok: true });
}
