import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient();

  // 後払い残高が残っていたら警告
  const { data: targetUser } = await supabase
    .from('users').select('deferred_balance, name').eq('id', params.id).single();

  if (targetUser?.deferred_balance && targetUser.deferred_balance > 0) {
    return NextResponse.json(
      { error: `後払い残高 ¥${targetUser.deferred_balance.toLocaleString()} が残っています。先に精算してください。` },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from('users')
    .update({ is_active: false })
    .eq('id', params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
