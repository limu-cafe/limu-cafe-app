import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient();
  const { amount } = await request.json();

  if (!amount || amount <= 0) {
    return NextResponse.json({ error: '無効な金額です' }, { status: 400 });
  }

  const { data: targetUser } = await supabase
    .from('users').select('balance').eq('id', params.id).single();

  const { error } = await supabase
    .from('users')
    .update({ balance: (targetUser?.balance ?? 0) + amount })
    .eq('id', params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
