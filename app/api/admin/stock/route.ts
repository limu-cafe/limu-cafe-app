import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  const supabase = createAdminClient();
  const { item_id, quantity, note } = await request.json();

  if (!item_id || !quantity || quantity <= 0) {
    return NextResponse.json({ error: '無効なリクエストです' }, { status: 400 });
  }

  const { data: item } = await supabase
    .from('items').select('stock').eq('id', item_id).single();

  if (!item) return NextResponse.json({ error: '商品が見つかりません' }, { status: 404 });

  const { error } = await supabase
    .from('items')
    .update({ stock: item.stock + quantity })
    .eq('id', item_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from('stock_history').insert({
    item_id,
    change_amount: quantity,
    reason: 'restock',
    note: note ?? '入荷',
  });

  revalidatePath('/');
  revalidatePath('/admin');
  revalidatePath('/admin/stock');
  revalidatePath('/admin/items');

  return NextResponse.json({ ok: true });
}
