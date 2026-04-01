import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { logAdminAction } from '@/lib/admin-audit';

export async function POST(request: Request) {
  const sessionClient = await createClient();
  const {
    data: { user },
  } = await sessionClient.auth.getUser();
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
    created_by: user?.id ?? null,
  });

  await logAdminAction(supabase, {
    actor_id: user?.id ?? null,
    action_type: 'stock_restocked',
    target_type: 'item',
    target_id: item_id,
    summary: `在庫を ${Number(quantity).toLocaleString()} 個追加しました`,
    metadata: {
      quantity: Number(quantity),
      note: note ?? '入荷',
    },
  });

  revalidatePath('/');
  revalidatePath('/admin');
  revalidatePath('/admin/stock');
  revalidatePath('/admin/items');
  revalidatePath('/admin/audit');

  return NextResponse.json({ ok: true });
}
