import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { item_id, quantity, note } = await request.json();

  if (!item_id || !quantity || quantity <= 0) {
    return NextResponse.json({ error: '無効なリクエストです' }, { status: 400 });
  }

  // 現在の在庫を取得
  const { data: item } = await supabase
    .from('items').select('stock').eq('id', item_id).single();

  if (!item) return NextResponse.json({ error: '商品が見つかりません' }, { status: 404 });

  // 在庫を増やす
  const { error: updateError } = await supabase
    .from('items')
    .update({ stock: item.stock + quantity })
    .eq('id', item_id);

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  // 在庫履歴を記録
  await supabase.from('stock_history').insert({
    item_id,
    change_amount: quantity,
    reason: 'restock',
    note: note ?? '入荷',
    created_by: user.id,
  });

  return NextResponse.json({ ok: true });
}
