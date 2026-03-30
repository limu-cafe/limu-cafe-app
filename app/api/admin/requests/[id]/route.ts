import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/server';
import { notifyRequestApproved } from '@/lib/slack';

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createAdminClient();

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
      reviewed_by: null,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  revalidatePath('/admin/requests');

  // 採用された場合はSlack DMで通知
  if (status === 'approved' && req.user?.slack_user_id) {
    await notifyRequestApproved({
      slackUserId: req.user.slack_user_id,
      itemName: req.item_name,
    });
  }

  return NextResponse.json({ ok: true });
}
