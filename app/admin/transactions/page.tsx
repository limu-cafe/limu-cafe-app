import { createAdminClient } from '@/lib/supabase/server';
import { ORDER_ITEMS_SELECT_ENHANCED, ORDER_ITEMS_SELECT_LEGACY } from '@/lib/item-select';
import { needsLegacyOrderSelect } from '@/lib/orders';
import { fetchRecentAndPendingRows } from '@/lib/transaction-history';
import TransactionsClient from './TransactionsClient';

export const dynamic = 'force-dynamic';

const ORDER_SELECT = `id, user_id, total_amount, points_used, payment_method, deferred_settlement_method, payment_status, settled_at, settlement_source, settlement_id, created_at, user:users!orders_user_id_fkey(id, name, avatar_url), ${ORDER_ITEMS_SELECT_ENHANCED}`;
const ORDER_SELECT_NO_SETTLEMENT = `id, user_id, total_amount, points_used, payment_method, deferred_settlement_method, payment_status, created_at, user:users!orders_user_id_fkey(id, name, avatar_url), ${ORDER_ITEMS_SELECT_ENHANCED}`;
const ORDER_SELECT_FULL_LEGACY = `id, user_id, total_amount, payment_method, payment_status, created_at, user:users!orders_user_id_fkey(id, name, avatar_url), ${ORDER_ITEMS_SELECT_LEGACY}`;

type OrderFetchRow = {
  id: string;
  user_id: string;
  total_amount: number;
  payment_method: string;
  payment_status: string;
  created_at: string;
  user?: {
    id: string;
    name: string;
    avatar_url?: string | null;
  } | null;
  order_items?: Array<{ item_name: string; quantity: number }>;
  points_used?: number | null;
  deferred_settlement_method?: string | null;
  settled_at?: string | null;
  settlement_source?: 'individual_deferred_order' | 'deferred_settlement' | null;
  settlement_id?: string | null;
};

type ChargeFetchRow = {
  id: string;
  user_id: string;
  amount: number;
  method: string;
  status: string;
  note?: string | null;
  created_at: string;
  approved_at?: string | null;
  settled_at?: string | null;
  settlement_source?: string | null;
  user?: {
    id: string;
    name: string;
    avatar_url?: string | null;
  } | null;
};

type SubscriptionPaymentFetchRow = {
  id: string;
  user_id: string;
  user_subscription_id: string;
  amount: number;
  payment_method: string;
  payment_status: string;
  points_used: number;
  balance_used: number;
  cash_due_amount: number;
  billing_period_start_at: string;
  billing_period_end_at: string;
  created_at: string;
  user?: {
    id: string;
    name: string;
    avatar_url?: string | null;
  } | null;
  subscription_product?: {
    id: string;
    name: string;
    english_name?: string | null;
  } | null;
  user_subscription?: {
    status: string;
  } | null;
};

async function fetchOrdersWithSelect(
  select: string,
  options: { settlementTracking: boolean; deferredMethod: boolean }
) {
  const supabase = createAdminClient();
  const queryOrders = () =>
    supabase.from('orders').select(select).order('created_at', { ascending: false }).order('id', { ascending: false });

  const orders = await fetchRecentAndPendingRows<OrderFetchRow>({
    recent: queryOrders().limit(80),
    pending: [
      (from, to) =>
        queryOrders().eq('payment_method', 'cash').eq('payment_status', 'pending').range(from, to),
      (from, to) => {
        let query = queryOrders().eq('payment_method', 'deferred').eq('payment_status', 'completed');
        if (options.deferredMethod) {
          query = query.or('deferred_settlement_method.is.null,deferred_settlement_method.eq.cash');
        }
        if (options.settlementTracking) {
          query = query.is('settled_at', null);
        }
        return query.range(from, to);
      },
    ],
  });

  return orders.map((order) => ({
    ...order,
    points_used: order.points_used ?? 0,
    deferred_settlement_method: order.deferred_settlement_method ?? null,
    settled_at: order.settled_at ?? null,
    settlement_source: order.settlement_source ?? null,
    settlement_id: order.settlement_id ?? null,
  }));
}

async function fetchOrders() {
  try {
    return await fetchOrdersWithSelect(ORDER_SELECT, {
      settlementTracking: true,
      deferredMethod: true,
    });
  } catch (error) {
    const message = error && typeof error === 'object' && 'message' in error
      ? String(error.message)
      : '';
    const missingSettlementTracking =
      message.includes('settled_at') || message.includes('settlement_source') || message.includes('settlement_id');
    if (!needsLegacyOrderSelect(error) && !missingSettlementTracking) throw error;

    const fullLegacy = needsLegacyOrderSelect(error);
    return fetchOrdersWithSelect(fullLegacy ? ORDER_SELECT_FULL_LEGACY : ORDER_SELECT_NO_SETTLEMENT, {
      settlementTracking: false,
      deferredMethod: !fullLegacy,
    });
  }
}

export default async function AdminTransactionsPage() {
  const supabase = createAdminClient();

  const queryCharges = () =>
    supabase
      .from('charge_requests')
      .select('id, user_id, amount, method, status, note, created_at, approved_at, settled_at, settlement_source, user:users!charge_requests_user_id_fkey(id, name, avatar_url)')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false });
  const querySubscriptionPayments = () =>
    supabase
      .from('subscription_payments')
      .select('id, user_id, user_subscription_id, amount, payment_method, payment_status, points_used, balance_used, cash_due_amount, billing_period_start_at, billing_period_end_at, created_at, user:users!subscription_payments_user_id_fkey(id, name, avatar_url), subscription_product:subscription_products!subscription_payments_subscription_product_id_fkey(id, name, english_name), user_subscription:user_subscriptions!subscription_payments_user_subscription_id_fkey(status)')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false });

  const [orders, charges, { data: settlements }, subscriptionPayments] =
    await Promise.all([
      fetchOrders(),
      fetchRecentAndPendingRows<ChargeFetchRow>({
        recent: queryCharges().limit(80),
        pending: [
          (from, to) => queryCharges().eq('status', 'pending').range(from, to),
          (from, to) =>
            queryCharges().eq('method', 'cash').eq('status', 'approved').is('settled_at', null).range(from, to),
        ],
      }),
      supabase
        .from('settlements')
        .select(
          'id, user_id, amount, method, status, period_start, period_end, created_at, user:users!settlements_user_id_fkey(id, name, avatar_url)'
        )
        .order('created_at', { ascending: false })
        .limit(80),
      fetchRecentAndPendingRows<SubscriptionPaymentFetchRow>({
        recent: querySubscriptionPayments().limit(80),
        pending: [
          (from, to) => querySubscriptionPayments().eq('payment_status', 'pending_cash_settlement').range(from, to),
        ],
      }),
    ]);

  const normalizedCharges = charges.map((charge) => ({
    ...charge,
    is_cash_settled: charge.method === 'cash' ? Boolean(charge.settled_at) : false,
  }));

  return (
    <TransactionsClient
      orders={orders}
      charges={normalizedCharges}
      settlements={settlements ?? []}
      subscriptionPayments={subscriptionPayments}
    />
  );
}
