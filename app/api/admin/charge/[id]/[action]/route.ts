import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { insertCashboxEntry } from '@/lib/cashbox';
import { logAdminAction } from '@/lib/admin-audit';
import { notifyChargeReviewed } from '@/lib/slack';

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

  await logAdminAction(supabase, {
    actor_id: user?.id ?? null,
    action_type: action === 'approve' ? 'charge_approved' : 'charge_rejected',
    target_type: 'charge_request',
    target_id: req.id,
    summary: `${req.user_id} の ${req.amount.toLocaleString()}円チャージ申請を${action === 'approve' ? '承認' : '却下'}しました`,
    metadata: {
      method: req.method,
      amount: req.amount,
      user_id: req.user_id,
    },
  });

  revalidatePath('/admin');
  revalidatePath('/admin/charge');
  revalidatePath('/admin/users');
  revalidatePath('/admin/cashbox');
  revalidatePath('/admin/audit');
  revalidatePath('/mypage');

  const { data: targetUserProfile } = await supabase
    .from('users')
    .select('slack_user_id')
    .eq('id', req.user_id)
    .single();

  if (targetUserProfile?.slack_user_id) {
    await notifyChargeReviewed({
      slackUserId: targetUserProfile.slack_user_id,
      amount: req.amount,
      status: action === 'approve' ? 'approved' : 'rejected',
    });
  }

  return NextResponse.json({ ok: true });
}
