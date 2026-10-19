import { requireAdminPage } from '@/lib/admin-page-session';
import { createAdminClient } from '@/lib/supabase/server';
import { needsLegacyOrderSelect } from '@/lib/orders';
import { fetchRecentAndPendingRows } from '@/lib/transaction-history';
import { TransactionFilter } from '@/lib/transaction-filter';
import TransactionsClient from './TransactionsClient';

export const dynamic = 'force-dynamic';

// The collection only needs historical names/quantities. Full prices are loaded for one order on demand.
const ORDER_LINES_SELECT = 'order_items(item_name, quantity)';
const ORDER_SELECT = `id, user_id, total_amount, points_used, payment_method, deferred_settlement_method, payment_status, settled_at, settlement_source, settlement_id, created_at, user:users!orders_user_id_fkey(id, name, avatar_url), ${ORDER_LINES_SELECT}`;
const ORDER_SELECT_NO_SETTLEMENT = `id, user_id, total_amount, points_used, payment_method, deferred_settlement_method, payment_status, created_at, user:users!orders_user_id_fkey(id, name, avatar_url), ${ORDER_LINES_SELECT}`;
const ORDER_SELECT_FULL_LEGACY = `id, user_id, total_amount, payment_method, payment_status, created_at, user:users!orders_user_id_fkey(id, name, avatar_url), ${ORDER_LINES_SELECT}`;

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
  options: { settlementTracking: boolean; deferredMethod: boolean },
  filter: TransactionFilter
) {
  const supabase = createAdminClient();
  const queryOrders = () =>
    filter.apply(supabase.from('orders').select(select)).order('created_at', { ascending: false }).order('id', { ascending: false });

  const orders = await fetchRecentAndPendingRows<OrderFetchRow>({
    recent: filter.recent(queryOrders()),
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

async function fetchOrders(filter: TransactionFilter) {
  try {
    return await fetchOrdersWithSelect(ORDER_SELECT, {
      settlementTracking: true,
      deferredMethod: true,
    }, filter);
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
    }, filter);
  }
}

async function fetchUserChoices(supabase: any) {
  const users: { id: string; name: string }[] = [];
  while (true) {
    const { data, error } = await supabase.from('users').select('id, name').order('name').order('id').range(users.length, users.length + 199);
    if (error) throw error;
    if (!data?.length) return users;
    users.push(...data);
  }
}

export default async function AdminTransactionsPage({ searchParams = {} }: { searchParams?: { user?: string; page?: string } }) {
  await requireAdminPage();
  const filter = new TransactionFilter(searchParams);
  const supabase = createAdminClient();

  const queryCharges = () =>
    filter.apply(supabase
      .from('charge_requests')
      .select('id, user_id, amount, method, status, note, created_at, approved_at, settled_at, settlement_source, user:users!charge_requests_user_id_fkey(id, name, avatar_url)'))
      .order('created_at', { ascending: false })
      .order('id', { ascending: false });
  const querySubscriptionPayments = () =>
    filter.apply(supabase
      .from('subscription_payments')
      .select('id, user_id, user_subscription_id, amount, payment_method, payment_status, points_used, balance_used, cash_due_amount, billing_period_start_at, billing_period_end_at, created_at, user:users!subscription_payments_user_id_fkey(id, name, avatar_url), subscription_product:subscription_products!subscription_payments_subscription_product_id_fkey(id, name, english_name), user_subscription:user_subscriptions!subscription_payments_user_subscription_id_fkey(status)'))
      .order('created_at', { ascending: false })
      .order('id', { ascending: false });

  const [orders, charges, settlementsResult, subscriptionPayments, userChoices] =
    await Promise.all([
      fetchOrders(filter),
      fetchRecentAndPendingRows<ChargeFetchRow>({
        recent: filter.recent(queryCharges()),
        pending: [
          (from, to) => queryCharges().eq('status', 'pending').range(from, to),
          (from, to) =>
            queryCharges().eq('method', 'cash').eq('status', 'approved').is('settled_at', null).range(from, to),
        ],
      }),
      filter.recent(filter.apply(supabase
        .from('settlements')
        .select(
          'id, user_id, amount, method, status, period_start, period_end, created_at, user:users!settlements_user_id_fkey(id, name, avatar_url)'
        ))
        .order('created_at', { ascending: false }).order('id', { ascending: false })),
      fetchRecentAndPendingRows<SubscriptionPaymentFetchRow>({
        recent: filter.recent(querySubscriptionPayments()),
        pending: [
          (from, to) => querySubscriptionPayments().eq('payment_status', 'pending_cash_settlement').range(from, to),
        ],
      }),
      fetchUserChoices(supabase),
    ]);

  if (settlementsResult.error) throw settlementsResult.error;
  const settlements = settlementsResult.data;
  const normalizedCharges = charges.map((charge) => ({
    ...charge,
    is_cash_settled: charge.method === 'cash' ? Boolean(charge.settled_at) : false,
  }));

  return (
    <TransactionsClient
      selectedUserId={filter.userId}
      userChoices={userChoices}
      page={filter.page}
      hasNextPage={filter.hasNextPage}
      orders={orders}
      charges={normalizedCharges}
      settlements={settlements ?? []}
      subscriptionPayments={subscriptionPayments}
    />
  );
}
