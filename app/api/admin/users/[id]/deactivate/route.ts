import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/server';
import {
  buildCashCollectionEntries,
  describeCashCollectionBreakdown,
  type DeferredCashCollectionRow,
  type PendingCashOrderRow,
  type PendingSubscriptionCashRow,
} from '@/lib/cash-collection';

export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createAdminClient();

  const [{ data: targetUser }, { data: pendingCashOrders }, { data: pendingSubscriptionPayments }] =
    await Promise.all([
      supabase
        .from('users')
        .select('id, name, avatar_url, deferred_balance')
        .eq('id', params.id)
        .single(),
      supabase
        .from('orders')
        .select('user_id, total_amount, user:users!orders_user_id_fkey(id, name, avatar_url)')
        .eq('user_id', params.id)
        .eq('payment_method', 'cash')
        .eq('payment_status', 'pending'),
      supabase
        .from('subscription_payments')
        .select(
          'user_id, cash_due_amount, user:users!subscription_payments_user_id_fkey(id, name, avatar_url)'
        )
        .eq('user_id', params.id)
        .eq('payment_status', 'pending_cash_settlement')
        .gt('cash_due_amount', 0),
    ]);

  const cashCollection = buildCashCollectionEntries({
    deferredUsers: targetUser ? [targetUser as DeferredCashCollectionRow] : [],
    pendingCashOrders: (pendingCashOrders ?? []) as PendingCashOrderRow[],
    pendingSubscriptionPayments:
      (pendingSubscriptionPayments ?? []) as PendingSubscriptionCashRow[],
  })[0];

  if (cashCollection && cashCollection.totalAmount > 0) {
    return NextResponse.json(
      {
        error: `要回収額 ¥${cashCollection.totalAmount.toLocaleString()} が残っています。先に精算してください。(${describeCashCollectionBreakdown(
          cashCollection
        )})`,
      },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from('users')
    .update({ is_active: false })
    .eq('id', params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  revalidatePath('/admin/users');

  return NextResponse.json({ ok: true });
}
