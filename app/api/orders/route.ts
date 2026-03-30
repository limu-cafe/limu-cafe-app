import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { notifyCashOrderPending, notifyNewOrder, notifyLowStock } from '@/lib/slack';

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { items, total_amount, payment_method } = await request.json();

  // ユーザー情報取得
  const { data: profile } = await supabase
    .from('users').select('*').eq('id', user.id).single();

  if (!profile?.is_approved) {
    return NextResponse.json({ error: 'Account not approved' }, { status: 403 });
  }

  // 残高確認（残高払いの場合）
  if (payment_method === 'balance') {
    if (profile.balance < total_amount) {
      return NextResponse.json({ error: '残高が不足しています' }, { status: 400 });
    }
  }

  // 在庫確認
  for (const item of items) {
    const { data: dbItem } = await supabase
      .from('items').select('stock, name').eq('id', item.item_id).single();
    if (!dbItem || dbItem.stock < item.quantity) {
      return NextResponse.json(
        { error: `${dbItem?.name ?? '商品'}の在庫が不足しています` },
        { status: 400 }
      );
    }
  }

  // トランザクション的に処理
  // 1. 注文作成
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert({
      user_id: user.id,
      total_amount,
      payment_method,
      payment_status: payment_method === 'cash' ? 'pending' : 'completed',
    })
    .select()
    .single();

  if (orderError || !order) {
    return NextResponse.json({ error: '注文の作成に失敗しました' }, { status: 500 });
  }

  // 2. 注文明細作成
  await supabase.from('order_items').insert(
    items.map((item: any) => ({ ...item, order_id: order.id }))
  );

  // 3. 在庫を減らす & 在庫履歴
  for (const item of items) {
    await supabase.rpc('decrement_stock', {
      p_item_id: item.item_id,
      p_quantity: item.quantity,
    });

    await supabase.from('stock_history').insert({
      item_id: item.item_id,
      change_amount: -item.quantity,
      reason: 'purchase',
      order_id: order.id,
      created_by: user.id,
    });

    // 在庫アラートチェック
    const { data: updatedItem } = await supabase
      .from('items').select('stock, stock_alert_threshold, name').eq('id', item.item_id).single();
    if (updatedItem && updatedItem.stock <= updatedItem.stock_alert_threshold) {
      await notifyLowStock({
        itemName: updatedItem.name,
        currentStock: updatedItem.stock,
        threshold: updatedItem.stock_alert_threshold,
      });
    }
  }

  // 4. 残高・後払い残高を更新
  if (payment_method === 'balance') {
    await supabase
      .from('users')
      .update({ balance: profile.balance - total_amount })
      .eq('id', user.id);
  } else if (payment_method === 'deferred') {
    await supabase
      .from('users')
      .update({ deferred_balance: profile.deferred_balance + total_amount })
      .eq('id', user.id);
  }

  // 5. Slack通知
  await notifyNewOrder({
    userName: profile.name,
    items: items.map((i: any) => ({
      name: i.item_name,
      quantity: i.quantity,
      price: i.item_price,
    })),
    total: total_amount,
    paymentMethod: payment_method,
  });

  if (payment_method === 'cash') {
    await notifyCashOrderPending({
      userName: profile.name,
      total: total_amount,
      items: items.map((item: any) => ({
        name: item.item_name,
        quantity: item.quantity,
      })),
    });
  }

  revalidatePath('/mypage');
  revalidatePath('/');
  revalidatePath('/admin');
  revalidatePath('/admin/orders');
  revalidatePath('/admin/stock');
  revalidatePath('/admin/items');

  return NextResponse.json({ ok: true, order_id: order.id });
}
