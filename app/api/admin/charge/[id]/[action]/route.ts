import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

export async function POST(
  _request: Request,
  { params }: { params: { id: string; action: string } }
) {
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
    })
    .eq('id', id);

  if (action === 'approve') {
    const { data: targetUser } = await supabase
      .from('users').select('balance').eq('id', req.user_id).single();
    await supabase
      .from('users')
      .update({ balance: (targetUser?.balance ?? 0) + req.amount })
      .eq('id', req.user_id);
  }

  return NextResponse.json({ ok: true });
}
