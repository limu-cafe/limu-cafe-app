import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { notifyCashOrderPending, notifyNewOrder, notifyLowStock } from '@/lib/slack';

interface OrderItemInput {
  item_id: string;
  item_name: string;
  item_price: number;
  quantity: number;
  subtotal: number;
}

async function rollbackOrder(
  adminSupabase: ReturnType<typeof createAdminClient>,
  orderId: string,
  processedItems: Array<{ itemId: string; quantity: number }>
) {
  for (const processedItem of processedItems) {
    const { data: currentItem } = await adminSupabase
      .from('items')
      .select('stock')
      .eq('id', processedItem.itemId)
      .single();

    if (!currentItem) continue;

    await adminSupabase
      .from('items')
      .update({ stock: currentItem.stock + processedItem.quantity })
      .eq('id', processedItem.itemId);
  }

  await adminSupabase.from('stock_history').delete().eq('order_id', orderId);
  await adminSupabase.from('order_items').delete().eq('order_id', orderId);
  await adminSupabase.from('orders').delete().eq('id', orderId);
}

async function notifyOrderSideEffects(params: {
  userName: string;
  items: OrderItemInput[];
  totalAmount: number;
  paymentMethod: string;
}) {
  try {
    await notifyNewOrder({
      userName: params.userName,
      items: params.items.map((i) => ({
        name: i.item_name,
        quantity: i.quantity,
        price: i.item_price,
      })),
      total: params.totalAmount,
      paymentMethod: params.paymentMethod,
    });

    if (params.paymentMethod === 'cash') {
      await notifyCashOrderPending({
        userName: params.userName,
        total: params.totalAmount,
        items: params.items.map((item) => ({
          name: item.item_name,
          quantity: item.quantity,
        })),
      });
    }
  } catch (error) {
    console.error('[orders] notification failed', error);
  }
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const adminSupabase = createAdminClient();
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
  for (const item of items as OrderItemInput[]) {
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
  const { data: order, error: orderError } = await adminSupabase
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

  const processedItems: Array<{ itemId: string; quantity: number }> = [];

  try {
    // 2. 注文明細作成
    const { error: orderItemsError } = await adminSupabase.from('order_items').insert(
      (items as OrderItemInput[]).map((item) => ({ ...item, order_id: order.id }))
    );

    if (orderItemsError) {
      throw orderItemsError;
    }

    // 3. 在庫を減らす & 在庫履歴
    for (const item of items as OrderItemInput[]) {
      const { error: decrementError } = await adminSupabase.rpc('decrement_stock', {
        p_item_id: item.item_id,
        p_quantity: item.quantity,
      });

      if (decrementError) {
        throw decrementError;
      }

      processedItems.push({ itemId: item.item_id, quantity: item.quantity });

      const { error: stockHistoryError } = await adminSupabase.from('stock_history').insert({
        item_id: item.item_id,
        change_amount: -item.quantity,
        reason: 'purchase',
        order_id: order.id,
        created_by: user.id,
      });

      if (stockHistoryError) {
        throw stockHistoryError;
      }

      // 在庫アラートチェック
      const { data: updatedItem, error: updatedItemError } = await adminSupabase
        .from('items')
        .select('stock, stock_alert_threshold, name')
        .eq('id', item.item_id)
        .single();

      if (updatedItemError) {
        throw updatedItemError;
      }

      if (updatedItem.stock <= updatedItem.stock_alert_threshold) {
        await notifyLowStock({
          itemName: updatedItem.name,
          currentStock: updatedItem.stock,
          threshold: updatedItem.stock_alert_threshold,
        });
      }
    }

    // 4. 残高・後払い残高を更新
    if (payment_method === 'balance') {
      const { error: balanceUpdateError } = await adminSupabase.rpc(
        'decrement_user_balance_if_available',
        {
          p_user_id: user.id,
          p_amount: total_amount,
        }
      );

      if (balanceUpdateError) {
        throw balanceUpdateError;
      }
    } else if (payment_method === 'deferred') {
      const { error: deferredUpdateError } = await adminSupabase.rpc(
        'increment_user_deferred_balance',
        {
          p_user_id: user.id,
          p_amount: total_amount,
        }
      );

      if (deferredUpdateError) {
        throw deferredUpdateError;
      }
    }
  } catch (error) {
    await rollbackOrder(adminSupabase, order.id, processedItems);
    console.error('[orders] failed to finalize order', error);
    return NextResponse.json({ error: '注文処理に失敗しました' }, { status: 500 });
  }

  // 注文自体は成立させ、通知失敗ではロールバックしない
  await notifyOrderSideEffects({
    userName: profile.name,
    items: items as OrderItemInput[],
    totalAmount: total_amount,
    paymentMethod: payment_method,
  });

  revalidatePath('/mypage');
  revalidatePath('/');
  revalidatePath('/admin');
  revalidatePath('/admin/orders');
  revalidatePath('/admin/stock');
  revalidatePath('/admin/items');

  return NextResponse.json({ ok: true, order_id: order.id });
}
