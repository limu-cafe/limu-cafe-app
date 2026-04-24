import { NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { ORDER_ITEMS_SELECT_ENHANCED, ORDER_ITEMS_SELECT_LEGACY } from '@/lib/item-select';
import {
  isMissingDeferredSettlementMethodColumn,
  isMissingOrderPointsColumn,
  needsLegacyOrderSelect,
} from '@/lib/orders';

const PAGE_SIZE_DEFAULT = 10;

type UnifiedPaymentEntry =
  | {
      id: string;
      kind: 'order';
      created_at: string;
      amount: number;
      status: string;
      payment_method: string;
      title: string;
      detail: string;
      points_used: number;
    }
  | {
      id: string;
      kind: 'charge';
      created_at: string;
      amount: number;
      status: string;
      payment_method: string;
      title: string;
      detail: string;
    }
  | {
      id: string;
      kind: 'settlement';
      created_at: string;
      amount: number;
      status: string;
      payment_method: string;
      title: string;
      detail: string;
    }
  | {
      id: string;
      kind: 'subscription';
      created_at: string;
      amount: number;
      status: string;
      payment_method: string;
      title: string;
      detail: string;
      points_used: number;
      balance_used: number;
      cash_due_amount: number;
    };

export async function GET(request: Request) {
  const supabase = await createClient();
  const adminSupabase = createAdminClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const offset = Number(url.searchParams.get('offset') ?? '0');
  const limit = Number(url.searchParams.get('limit') ?? PAGE_SIZE_DEFAULT.toString());
  const fetchWindow = Math.max(30, offset + limit + 20);

  const primaryOrderSelect = `id, total_amount, points_used, payment_method, deferred_settlement_method, payment_status, created_at, ${ORDER_ITEMS_SELECT_ENHANCED}`;
  const legacyOrderSelect = `id, total_amount, payment_method, payment_status, created_at, ${ORDER_ITEMS_SELECT_LEGACY}`;

  let orderQuery = await adminSupabase
    .from('orders')
    .select(primaryOrderSelect)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(fetchWindow);

  if (isMissingDeferredSettlementMethodColumn(orderQuery.error) || isMissingOrderPointsColumn(orderQuery.error)) {
    orderQuery = await adminSupabase
      .from('orders')
      .select(legacyOrderSelect)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(fetchWindow);
  } else if (needsLegacyOrderSelect(orderQuery.error)) {
    return NextResponse.json({ error: orderQuery.error?.message ?? '履歴の取得に失敗しました' }, { status: 500 });
  }

  const [
    { data: charges, error: chargesError },
    { data: settlements, error: settlementsError },
    { data: subscriptionPayments, error: subscriptionPaymentsError },
  ] = await Promise.all([
    adminSupabase
      .from('charge_requests')
      .select('id, amount, method, status, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(fetchWindow),
    adminSupabase
      .from('settlements')
      .select('id, amount, method, status, period_start, period_end, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(fetchWindow),
    adminSupabase
      .from('subscription_payments')
      .select(
        'id, amount, payment_method, payment_status, points_used, balance_used, cash_due_amount, billing_period_start_at, billing_period_end_at, created_at, subscription_product:subscription_products!subscription_payments_subscription_product_id_fkey(name, english_name)'
      )
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(fetchWindow),
  ]);

  if (chargesError || settlementsError || subscriptionPaymentsError || orderQuery.error) {
    return NextResponse.json(
      {
        error:
          chargesError?.message ??
          settlementsError?.message ??
          subscriptionPaymentsError?.message ??
          orderQuery.error?.message ??
          '履歴の取得に失敗しました',
      },
      { status: 500 }
    );
  }

  const orderEntries: UnifiedPaymentEntry[] = ((orderQuery.data ?? []) as any[]).map((order) => ({
    id: order.id,
    kind: 'order',
    created_at: order.created_at,
    amount: order.total_amount,
    status: order.payment_status,
    payment_method:
      order.payment_method === 'deferred' && order.deferred_settlement_method
        ? `${order.payment_method}:${order.deferred_settlement_method}`
        : order.payment_method,
    title: '商品購入',
    detail:
      (order.order_items ?? [])
        .map((item: any) => item.item?.english_name ?? item.item_name)
        .join(', ') || '商品購入',
    points_used: order.points_used ?? 0,
  }));

  const chargeEntries: UnifiedPaymentEntry[] = ((charges ?? []) as any[]).map((charge) => ({
    id: charge.id,
    kind: 'charge',
    created_at: charge.created_at,
    amount: charge.amount,
    status: charge.status,
    payment_method: charge.method,
    title: 'チャージ',
    detail: charge.method === 'cash' ? '現金チャージ' : 'クレカチャージ',
  }));

  const settlementEntries: UnifiedPaymentEntry[] = ((settlements ?? []) as any[]).map((settlement) => ({
    id: settlement.id,
    kind: 'settlement',
    created_at: settlement.created_at,
    amount: settlement.amount,
    status: settlement.status,
    payment_method: settlement.method,
    title: '精算',
    detail: `${String(settlement.period_start).slice(0, 10)} - ${String(settlement.period_end).slice(0, 10)}`,
  }));

  const subscriptionEntries: UnifiedPaymentEntry[] = ((subscriptionPayments ?? []) as any[]).map((payment) => ({
    id: payment.id,
    kind: 'subscription',
    created_at: payment.created_at,
    amount: payment.amount,
    status: payment.payment_status,
    payment_method: payment.payment_method,
    title: `${payment.subscription_product?.english_name ?? payment.subscription_product?.name ?? 'サブスク'} サブスク`,
    detail: `${String(payment.billing_period_start_at).slice(0, 10)} - ${String(payment.billing_period_end_at).slice(0, 10)}`,
    points_used: payment.points_used ?? 0,
    balance_used: payment.balance_used ?? 0,
    cash_due_amount: payment.cash_due_amount ?? 0,
  }));

  const entries = [...orderEntries, ...chargeEntries, ...settlementEntries, ...subscriptionEntries]
    .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime());

  const pageEntries = entries.slice(offset, offset + limit);

  return NextResponse.json({
    payments: pageEntries,
    hasMore: offset + limit < entries.length,
  });
}
