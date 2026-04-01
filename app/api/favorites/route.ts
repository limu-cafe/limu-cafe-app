import { NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function POST(request: Request) {
  const sessionClient = await createClient();
  const {
    data: { user },
  } = await sessionClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { item_id } = await request.json();

  if (!item_id) {
    return NextResponse.json({ error: 'item_id is required' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { error } = await supabase.from('favorite_items').upsert(
    {
      user_id: user.id,
      item_id,
    },
    {
      onConflict: 'user_id,item_id',
      ignoreDuplicates: true,
    }
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidatePath('/');
  revalidatePath('/mypage');

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const sessionClient = await createClient();
  const {
    data: { user },
  } = await sessionClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { item_id } = await request.json();

  if (!item_id) {
    return NextResponse.json({ error: 'item_id is required' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('favorite_items')
    .delete()
    .eq('user_id', user.id)
    .eq('item_id', item_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidatePath('/');
  revalidatePath('/mypage');

  return NextResponse.json({ ok: true });
}
