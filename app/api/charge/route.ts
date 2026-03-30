import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { notifyCashChargeRequest } from '@/lib/slack';

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { amount, method } = await request.json();

  if (!amount || amount < 100) {
    return NextResponse.json({ error: '100円以上で入力してください' }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from('users').select('name').eq('id', user.id).single();

  // Stripeの場合は即時完了
  if (method === 'stripe') {
    // TODO: Stripe決済処理を追加
    // 今は仮で即時承認
    await supabase.from('charge_requests').insert({
      user_id: user.id,
      amount,
      method,
      status: 'approved',
      approved_at: new Date().toISOString(),
    });

    const { data: currentUser } = await supabase
      .from('users').select('balance').eq('id', user.id).single();
    await supabase
      .from('users')
      .update({ balance: (currentUser?.balance ?? 0) + amount })
      .eq('id', user.id);

    revalidatePath('/mypage');
    revalidatePath('/admin');
    revalidatePath('/admin/charge');
    revalidatePath('/admin/users');

    return NextResponse.json({ ok: true });
  }

  // 現金の場合は申請として作成
  const { data: req, error } = await supabase
    .from('charge_requests')
    .insert({ user_id: user.id, amount, method, status: 'pending' })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await notifyCashChargeRequest({
    userName: profile?.name ?? '不明',
    amount,
    requestId: req.id,
  });

  revalidatePath('/mypage');
  revalidatePath('/admin');
  revalidatePath('/admin/charge');

  return NextResponse.json({ ok: true });
}
