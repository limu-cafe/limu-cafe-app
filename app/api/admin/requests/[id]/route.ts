import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { notifyRequestApproved } from '@/lib/slack';
import { logAdminAction } from '@/lib/admin-audit';

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createAdminClient();
  const sessionClient = await createClient();
  const {
    data: { user: adminUser },
  } = await sessionClient.auth.getUser();

  const { status, admin_note } = await request.json();

  // 要望と申請者情報を取得
  const { data: req } = await supabase
    .from('item_requests')
    .select('*, user:users!item_requests_user_id_fkey(slack_user_id, name)')
    .eq('id', params.id)
    .single();

  if (!req) return NextResponse.json({ error: '要望が見つかりません' }, { status: 404 });

  const { error } = await supabase
    .from('item_requests')
    .update({
      status,
      admin_note: admin_note || null,
      reviewed_by: adminUser?.id ?? null,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminAction(supabase, {
    actor_id: adminUser?.id ?? null,
    action_type: status === 'approved' ? 'item_request_approved' : 'item_request_rejected',
    target_type: 'item_request',
    target_id: req.id,
    summary: `${req.item_name} の要望を${status === 'approved' ? '採用' : '却下'}しました`,
    metadata: {
      user_name: req.user?.name ?? null,
      desired_price: req.desired_price ?? null,
      admin_note: admin_note || null,
    },
  });

  revalidatePath('/admin/requests');
  revalidatePath('/admin/audit');

  // 採用された場合はSlack DMで通知
  if (status === 'approved' && req.user?.slack_user_id) {
    await notifyRequestApproved({
      slackUserId: req.user.slack_user_id,
      itemName: req.item_name,
    });
  }

  return NextResponse.json({ ok: true });
}
