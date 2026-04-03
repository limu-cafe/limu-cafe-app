import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

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

  revalidatePath('/request');
  revalidatePath('/admin/requests');
  return NextResponse.json(data);
}
