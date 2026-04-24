import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/server';
import { requireAdminSession } from '@/lib/admin-session';
import {
  monthValueToStorageDate,
  parseMonthValue,
  sanitizeSubscriptionPaymentPriority,
} from '@/lib/subscriptions';
import { recomputeUserSubscriptionState } from '@/lib/subscription-service';

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const adminSession = await requireAdminSession();
  if (!adminSession.user) {
    return NextResponse.json({ error: adminSession.error }, { status: adminSession.status });
  }

  const supabase = createAdminClient();
  const { data: subscription, error } = await supabase
    .from('user_subscriptions')
    .select('id, status, subscription_product_id, current_period_end_at')
    .eq('id', params.id)
    .single();

  if (error || !subscription) {
    return NextResponse.json({ error: error?.message ?? '契約情報が見つかりません' }, { status: 404 });
  }

  const { status, payment_priority, allow_partial_payment, end_month } = await request.json();
  const patch: Record<string, unknown> = {};

  if (status !== undefined) {
    if (!['active', 'cancel_at_period_end', 'expired'].includes(status)) {
      return NextResponse.json({ error: '契約状態が不正です' }, { status: 400 });
    }
    patch.status = status;
    patch.cancelled_at = status === 'cancel_at_period_end' ? new Date().toISOString() : null;
    patch.next_billing_at = status === 'cancel_at_period_end' || status === 'expired' ? null : undefined;
  }

  if (payment_priority !== undefined) {
    patch.payment_priority = sanitizeSubscriptionPaymentPriority(payment_priority);
  }

  if (allow_partial_payment !== undefined) {
    patch.allow_partial_payment = Boolean(allow_partial_payment);
  }

  if (end_month !== undefined) {
    if (typeof end_month !== 'string' || !parseMonthValue(end_month)) {
      return NextResponse.json({ error: '終了予定年月が不正です' }, { status: 400 });
    }
    patch.end_month = monthValueToStorageDate(end_month);
  }

  const { error: updateError } = await supabase
    .from('user_subscriptions')
    .update(patch)
    .eq('id', subscription.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  await recomputeUserSubscriptionState(supabase, subscription.id);

  revalidatePath('/admin/subscriptions');
  revalidatePath('/admin/transactions');
  revalidatePath('/subscriptions');
  revalidatePath(`/subscriptions/${subscription.subscription_product_id}`);

  return NextResponse.json({ ok: true });
}
