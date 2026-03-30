import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { notifyNewItemRequest } from '@/lib/slack';

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { item_name, reason, desired_price } = await request.json();

  if (!item_name?.trim()) {
    return NextResponse.json({ error: '商品名は必須です' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('item_requests')
    .insert({ user_id: user.id, item_name, reason, desired_price })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: profile } = await supabase
    .from('users')
    .select('name')
    .eq('id', user.id)
    .single();

  await notifyNewItemRequest({
    userName: profile?.name ?? '不明',
    itemName: item_name,
    desiredPrice: desired_price,
    reason,
  });

  revalidatePath('/request');
  revalidatePath('/admin');
  revalidatePath('/admin/requests');

  return NextResponse.json(data);
}
