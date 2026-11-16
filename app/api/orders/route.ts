import { requireMemberSession } from '@/lib/member-session';
import { NextResponse, after } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/server';
import { notifyCashOrderPending, notifyNewOrder, notifyLowStock } from '@/lib/slack';
import { parseCheckout, validCheckoutRequestId } from '@/lib/checkout';

export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: '不正な送信元です' }, { status: 403 });
  }
  const memberAccess = await requireMemberSession();
  const user = memberAccess.user;
  if (!user) return NextResponse.json({ error: memberAccess.error }, { status: memberAccess.status });

  let input, requestId;
  try {
    const body = await request.json();
    input = parseCheckout(body);
    requestId = body.request_id;
  }
  catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '注文内容が不正です' }, { status: 400 });
  }
  // A page loaded before request IDs existed cannot be retried safely.
  if (!validCheckoutRequestId(requestId)) {
    return NextResponse.json({ error: 'ページを再読み込みしてから、もう一度注文してください' }, { status: 400 });
  }

  const db = createAdminClient();
  const { data, error } = await db.rpc('checkout_order', {
    p_user_id: user.id, p_items: input.items, p_expected_total: input.total_amount,
    p_payment_method: input.payment_method, p_deferred_method: input.deferred_settlement_method,
    p_requested_points: input.points_used, p_request_id: requestId.toLowerCase(),
  });
  if (error || !data?.ok) {
    const code = error?.code ?? '';
    // LM001: the order would push the unsettled debt above the deferred balance ceiling.
    const status = ({ '22023': 400, '42501': 403, P0001: 409, LM001: 409, P0002: 404 } as Record<string, number>)[code];
    if (status) return NextResponse.json({ error: error.message }, { status });
    console.error('[orders] checkout failed', { code });
    return NextResponse.json({ error: '注文を完了できませんでした。履歴を確認してください' }, { status: 500 });
  }

  // The order is already committed, so the response does not wait for Slack: the
  // notifications run after it is sent. When the same request ID arrives again, the
  // first attempt already sent them.
  if (!data.replayed) after(async () => {
    try {
      await notifyNewOrder({ userName: data.user_name, items: data.items.map((i: any) => ({ name: i.item_name, quantity: i.quantity, price: i.item_price })), total: data.total_amount, paymentMethod: data.payment_method });
      if (data.payment_method === 'cash') {
        await notifyCashOrderPending({ userName: data.user_name, total: data.total_amount, items: data.items.map((i: any) => ({ name: i.item_name, quantity: i.quantity })) });
      }
      for (const item of data.low_stock_items) {
        await notifyLowStock({ itemName: item.name, currentStock: item.stock, threshold: item.stock_alert_threshold });
      }
    } catch (notificationError) {
      console.error('[orders] notification failed', notificationError);
    }
  });
  for (const path of ['/', '/mypage', '/admin', '/admin/orders', '/admin/transactions', '/admin/stock', '/admin/items', '/admin/users', '/admin/points']) revalidatePath(path);
  return NextResponse.json({ ok: true, order_id: data.order_id });
}
