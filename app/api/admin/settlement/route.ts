import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { insertCashboxEntry } from '@/lib/cashbox';

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
  }).select('id').single();

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

  revalidatePath('/admin');
  revalidatePath('/admin/settlement');
  revalidatePath('/admin/users');
  revalidatePath('/admin/cashbox');

  return NextResponse.json({ ok: true });
}
