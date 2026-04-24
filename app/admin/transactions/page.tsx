import { createAdminClient } from '@/lib/supabase/server';
import { ORDER_ITEMS_SELECT_ENHANCED, ORDER_ITEMS_SELECT_LEGACY } from '@/lib/item-select';
import { needsLegacyOrderSelect } from '@/lib/orders';
import TransactionsClient from './TransactionsClient';

export const dynamic = 'force-dynamic';

const ORDER_SELECT = `id, user_id, total_amount, points_used, payment_method, deferred_settlement_method, payment_status, created_at, user:users!orders_user_id_fkey(id, name, avatar_url), ${ORDER_ITEMS_SELECT_ENHANCED}`;
const ORDER_SELECT_LEGACY = `id, user_id, total_amount, payment_method, payment_status, created_at, user:users!orders_user_id_fkey(id, name, avatar_url), ${ORDER_ITEMS_SELECT_LEGACY}`;

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
};

type CashboxChargeRow = {
  charge_request_id: string | null;
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
  user?: {
    id: string;
    name: string;
    avatar_url?: string | null;
  } | null;
};

async function fetchOrders() {
  const supabase = createAdminClient();
  const primary = await supabase
    .from('orders')
    .select(ORDER_SELECT)
    .order('created_at', { ascending: false })
    .limit(80);

  if (!primary.error) {
    return ((primary.data ?? []) as OrderFetchRow[]).map((order: OrderFetchRow) => ({
      ...order,
      points_used: order.points_used ?? 0,
      deferred_settlement_method: order.deferred_settlement_method ?? null,
    }));
  }

  if (!needsLegacyOrderSelect(primary.error)) {
    throw primary.error;
  }

  const legacy = await supabase
    .from('orders')
    .select(ORDER_SELECT_LEGACY)
    .order('created_at', { ascending: false })
    .limit(80);

  if (legacy.error) {
    throw legacy.error;
  }

  return ((legacy.data ?? []) as OrderFetchRow[]).map((order: OrderFetchRow) => ({
    ...order,
    points_used: 0,
    deferred_settlement_method: null,
  }));
}

export default async function AdminTransactionsPage() {
  const supabase = createAdminClient();

  const [orders, { data: charges }, { data: settlements }, { data: deferredUsers }, { data: chargeCashboxEntries }] =
    await Promise.all([
      fetchOrders(),
      supabase
        .from('charge_requests')
        .select(
          'id, user_id, amount, method, status, note, created_at, approved_at, user:users!charge_requests_user_id_fkey(id, name, avatar_url)'
        )
        .order('created_at', { ascending: false })
        .limit(80),
      supabase
        .from('settlements')
        .select(
          'id, user_id, amount, method, status, period_start, period_end, created_at, user:users!settlements_user_id_fkey(id, name, avatar_url)'
        )
        .order('created_at', { ascending: false })
        .limit(80),
      supabase
        .from('users')
        .select('id, name, avatar_url, deferred_balance')
        .gt('deferred_balance', 0)
        .eq('is_active', true)
        .order('deferred_balance', { ascending: false }),
      supabase
        .from('cashbox_entries')
        .select('charge_request_id')
        .not('charge_request_id', 'is', null),
    ]);

  const settledChargeIds = new Set(
    ((chargeCashboxEntries ?? []) as CashboxChargeRow[])
      .map((entry: CashboxChargeRow) => entry.charge_request_id)
      .filter((value): value is string => Boolean(value))
  );

  const normalizedCharges = ((charges ?? []) as ChargeFetchRow[]).map((charge: ChargeFetchRow) => ({
    ...charge,
    is_cash_settled: charge.method === 'cash' ? settledChargeIds.has(charge.id) : false,
  }));

  return (
    <TransactionsClient
      orders={orders}
      charges={normalizedCharges}
      settlements={settlements ?? []}
      deferredUsers={deferredUsers ?? []}
    />
  );
}
