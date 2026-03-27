import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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
  return NextResponse.json(data);
}
