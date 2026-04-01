import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createAdminClient, createClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  const sessionClient = await createClient();
  const {
    data: { user },
  } = await sessionClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { legacy_name, note } = await request.json();
  const supabase = createAdminClient();

  const { data: existingPending } = await supabase
    .from('legacy_transfer_requests')
    .select('id')
    .eq('user_id', user.id)
    .eq('status', 'pending')
    .limit(1);

  if ((existingPending ?? []).length > 0) {
    return NextResponse.json({ error: 'すでに申請中です' }, { status: 400 });
  }

  const { error } = await supabase.from('legacy_transfer_requests').insert({
    user_id: user.id,
    legacy_name: legacy_name?.trim() || null,
    note: note?.trim() || null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidatePath('/mypage');
  revalidatePath('/admin/legacy');

  return NextResponse.json({ ok: true });
}
