import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createAdminClient, createClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  const supabase = await createClient();
  const adminSupabase = createAdminClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { amount, method } = await request.json();

  if (!amount || amount < 100) {
    return NextResponse.json({ error: '100円以上で入力してください' }, { status: 400 });
  }

  const { data: req, error } = await adminSupabase
    .from('charge_requests')
    .insert({
      user_id: user.id,
      amount,
      method,
      status: 'approved',
      approved_at: new Date().toISOString(),
      approved_by: user.id,
      note: '即時反映・定期精算対象',
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { error: applyError } = await adminSupabase.rpc(
    'apply_immediate_charge_to_deferred',
    {
      p_user_id: user.id,
      p_amount: amount,
    }
  );

  if (applyError) {
    await adminSupabase.from('charge_requests').delete().eq('id', req.id);
    return NextResponse.json({ error: applyError.message }, { status: 500 });
  }

  revalidatePath('/mypage');
  revalidatePath('/admin');
  revalidatePath('/admin/charge');
  revalidatePath('/admin/settlement');
  revalidatePath('/admin/users');
  revalidatePath('/admin/cashbox');

  return NextResponse.json({ ok: true });
}
