import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { insertCashboxEntry } from '@/lib/cashbox';
import { logAdminAction } from '@/lib/admin-audit';

export async function POST(request: Request) {
  const sessionClient = await createClient();
  const { data: { user } } = await sessionClient.auth.getUser();
  const supabase = createAdminClient();
  const { user_id, amount, method, period_start, period_end } = await request.json();

  const { data: settlement, error: settlementError } = await supabase.from('settlements').insert({
    user_id, amount, method, period_start, period_end,
    status: 'completed',
    settled_at: new Date().toISOString(),
    settled_by: user?.id ?? null,
  }).select('id, settled_at').single();

  if (settlementError || !settlement) {
    return NextResponse.json({ error: settlementError?.message ?? '精算に失敗しました' }, { status: 500 });
  }

  if (method === 'balance') {
    const { data: targetUser } = await supabase
      .from('users').select('balance').eq('id', user_id).single();
    await supabase.from('users')
      .update({ balance: (targetUser?.balance ?? 0) - amount })
      .eq('id', user_id);
  }

  await supabase.from('users')
    .update({ deferred_balance: 0 })
    .eq('id', user_id);

  await supabase
    .from('orders')
    .update({
      settled_at: settlement.settled_at ?? new Date().toISOString(),
      settlement_source: 'deferred_settlement',
      settlement_id: settlement.id,
    })
    .eq('user_id', user_id)
    .eq('payment_method', 'deferred')
    .eq('payment_status', 'completed')
    .or('deferred_settlement_method.is.null,deferred_settlement_method.eq.cash')
    .is('settled_at', null);

  await supabase
    .from('charge_requests')
    .update({
      settled_at: settlement.settled_at ?? new Date().toISOString(),
      settlement_source: 'deferred_settlement',
      settlement_id: settlement.id,
    })
    .eq('user_id', user_id)
    .eq('method', 'cash')
    .eq('status', 'approved')
    .is('settled_at', null);

  if (method === 'cash') {
    await insertCashboxEntry(supabase, {
      entry_type: 'cash_settlement',
      direction: 'in',
      amount,
      note: '後払いの現金精算',
      settlement_id: settlement.id,
      created_by: user?.id ?? null,
    });
  }

  await logAdminAction(supabase, {
    actor_id: user?.id ?? null,
    action_type: 'settlement_completed',
    target_type: 'settlement',
    target_id: settlement.id,
    summary: `${amount.toLocaleString()}円の精算を完了しました`,
    metadata: {
      user_id,
      method,
      amount,
      period_start,
      period_end,
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
