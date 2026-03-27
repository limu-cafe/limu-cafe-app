import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { user_id, amount, method, period_start, period_end } = await request.json();

  // 精算レコード作成
  const { error: settlementError } = await supabase
    .from('settlements')
    .insert({
      user_id,
      amount,
      method,
      period_start,
      period_end,
      status: 'completed',
      settled_by: user.id,
      settled_at: new Date().toISOString(),
    });

  if (settlementError) {
    return NextResponse.json({ error: settlementError.message }, { status: 500 });
  }

  // 残高払いの場合は残高から引く
  if (method === 'balance') {
    const { data: targetUser } = await supabase
      .from('users').select('balance').eq('id', user_id).single();
    const newBalance = (targetUser?.balance ?? 0) - amount;
    if (newBalance < 0) {
      return NextResponse.json({ error: '残高が不足しています' }, { status: 400 });
    }
    await supabase.from('users').update({ balance: newBalance }).eq('id', user_id);
  }

  // 後払い残高をリセット
  await supabase
    .from('users')
    .update({ deferred_balance: 0 })
    .eq('id', user_id);

  // 対象期間の後払い注文を完了に更新
  await supabase
    .from('orders')
    .update({ payment_status: 'completed' })
    .eq('user_id', user_id)
    .eq('payment_method', 'deferred')
    .eq('payment_status', 'pending');

  return NextResponse.json({ ok: true });
}
