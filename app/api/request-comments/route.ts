import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { notifyRequestComment } from '@/lib/slack';

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { request_id, body } = await request.json();

  if (!request_id) {
    return NextResponse.json({ error: '要望が指定されていません' }, { status: 400 });
  }

  if (!body?.trim()) {
    return NextResponse.json({ error: 'コメントを入力してください' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('item_request_comments')
    .insert({
      request_id,
      user_id: user.id,
      body: body.trim(),
      source: 'app',
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const adminSupabase = createAdminClient();
  const { data: requestRow } = await adminSupabase
    .from('item_requests')
    .select('item_name, user:users!item_requests_user_id_fkey(id, slack_user_id, name)')
    .eq('id', request_id)
    .single();

  const owner = requestRow?.user as { id?: string; slack_user_id?: string | null; name?: string } | null;

  if (owner?.slack_user_id && owner.id !== user.id) {
    const { data: commenter } = await adminSupabase
      .from('users')
      .select('name')
      .eq('id', user.id)
      .single();

    await notifyRequestComment({
      slackUserId: owner.slack_user_id,
      itemName: requestRow?.item_name ?? '要望',
      commenterName: commenter?.name ?? '誰か',
      commentBody: body.trim(),
      requestId: request_id,
    });
  }

  revalidatePath('/request');
  revalidatePath(`/request/${request_id}`);
  revalidatePath('/admin/requests');
  return NextResponse.json(data);
}
