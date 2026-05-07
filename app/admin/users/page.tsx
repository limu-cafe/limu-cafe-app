import { createAdminClient } from '@/lib/supabase/server';
import {
  buildCashCollectionEntries,
  type DeferredCashCollectionRow,
  type PendingCashOrderRow,
  type PendingSubscriptionCashRow,
} from '@/lib/cash-collection';
import UsersClient from './UsersClient';

export const dynamic = 'force-dynamic';

export default async function AdminUsersPage() {
  const supabase = createAdminClient();
  const [{ data: users }, { data: pendingCashOrders }, { data: pendingSubscriptionPayments }] =
    await Promise.all([
      supabase.from('users').select('*').order('created_at', { ascending: false }),
      supabase
        .from('orders')
        .select('user_id, total_amount, user:users!orders_user_id_fkey(id, name, avatar_url)')
        .eq('payment_method', 'cash')
        .eq('payment_status', 'pending'),
      supabase
        .from('subscription_payments')
        .select(
          'user_id, cash_due_amount, user:users!subscription_payments_user_id_fkey(id, name, avatar_url)'
        )
        .eq('payment_status', 'pending_cash_settlement')
        .gt('cash_due_amount', 0),
    ]);

  const cashCollectionEntries = buildCashCollectionEntries({
    deferredUsers: ((users ?? []).filter((user: { deferred_balance?: number | null }) => (user.deferred_balance ?? 0) > 0) ??
      []) as DeferredCashCollectionRow[],
    pendingCashOrders: (pendingCashOrders ?? []) as PendingCashOrderRow[],
    pendingSubscriptionPayments:
      (pendingSubscriptionPayments ?? []) as PendingSubscriptionCashRow[],
  });

  const cashCollectionsByUserId = Object.fromEntries(
    cashCollectionEntries.map((entry) => [entry.userId, entry])
  );

  return <UsersClient users={users ?? []} cashCollectionsByUserId={cashCollectionsByUserId} />;
}
