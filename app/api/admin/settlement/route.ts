import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  const supabase = createAdminClient();
  const { user_id, amount, method, period_start, period_end } = await request.json();

  await supabase.from('settlements').insert({
    user_id, amount, method, period_start, period_end,
    status: 'completed',
    settled_at: new Date().toISOString(),
  });

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

  return NextResponse.json({ ok: true });
}
