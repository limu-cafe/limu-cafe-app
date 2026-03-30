import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { insertCashboxEntry } from '@/lib/cashbox';

export async function POST(
  _request: Request,
  { params }: { params: { id: string; action: string } }
) {
  const sessionClient = await createClient();
  const { data: { user } } = await sessionClient.auth.getUser();
  const supabase = createAdminClient();
  const { id, action } = params;

  if (!['approve', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }

  const { data: req, error: fetchError } = await supabase
    .from('charge_requests')
    .select('*')
    .eq('id', id)
    .eq('status', 'pending')
    .single();

  if (fetchError || !req) {
    return NextResponse.json({ error: '申請が見つかりません' }, { status: 404 });
  }

  await supabase
    .from('charge_requests')
    .update({
      status: action === 'approve' ? 'approved' : 'rejected',
      approved_at: new Date().toISOString(),
      approved_by: user?.id ?? null,
    })
    .eq('id', id);

  if (action === 'approve') {
    const { data: targetUser } = await supabase
      .from('users').select('balance').eq('id', req.user_id).single();
    await supabase
      .from('users')
      .update({ balance: (targetUser?.balance ?? 0) + req.amount })
      .eq('id', req.user_id);

    if (req.method === 'cash') {
      await insertCashboxEntry(supabase, {
        entry_type: 'cash_charge',
        direction: 'in',
        amount: req.amount,
        note: '現金チャージ申請の承認',
        charge_request_id: req.id,
        created_by: user?.id ?? null,
      });
    }
  }

  revalidatePath('/admin');
  revalidatePath('/admin/charge');
  revalidatePath('/admin/users');
  revalidatePath('/admin/cashbox');
  revalidatePath('/mypage');

  return NextResponse.json({ ok: true });
}
