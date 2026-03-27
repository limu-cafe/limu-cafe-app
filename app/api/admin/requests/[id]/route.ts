import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { notifyRequestApproved } from '@/lib/slack';

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { status, admin_note } = await request.json();

  // 要望と申請者情報を取得
  const { data: req } = await supabase
    .from('item_requests')
    .select('*, user:users(slack_user_id, name)')
    .eq('id', params.id)
    .single();

  if (!req) return NextResponse.json({ error: '要望が見つかりません' }, { status: 404 });

  const { error } = await supabase
    .from('item_requests')
    .update({
      status,
      admin_note: admin_note || null,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 採用された場合はSlack DMで通知
  if (status === 'approved' && req.user?.slack_user_id) {
    await notifyRequestApproved({
      slackUserId: req.user.slack_user_id,
      itemName: req.item_name,
    });
  }

  return NextResponse.json({ ok: true });
}
