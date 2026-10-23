import { requireMemberSession } from '@/lib/member-session';
import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  const supabase = await createClient();
  const memberAccess = await requireMemberSession();
  const user = memberAccess.user;

  if (!user) {
    return NextResponse.json({ error: memberAccess.error }, { status: memberAccess.status });
  }

  const { request_id } = await request.json();

  if (!request_id) {
    return NextResponse.json({ error: '要望が指定されていません' }, { status: 400 });
  }

  const { data: existingVote } = await supabase
    .from('item_request_votes')
    .select('id')
    .eq('request_id', request_id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (existingVote) {
    const { error } = await supabase
      .from('item_request_votes')
      .delete()
      .eq('id', existingVote.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    revalidatePath('/request');
    revalidatePath(`/request/${request_id}`);
    revalidatePath('/admin/requests');
    return NextResponse.json({ voted: false });
  }

  const { error } = await supabase.from('item_request_votes').insert({
    request_id,
    user_id: user.id,
    vote_type: 'up',
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidatePath('/request');
  revalidatePath(`/request/${request_id}`);
  revalidatePath('/admin/requests');
  return NextResponse.json({ voted: true });
}
