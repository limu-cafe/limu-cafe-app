import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  SubscriptionBillingIntervalUnit,
  SubscriptionPayment,
  SubscriptionProduct,
  SubscriptionStatus,
  UserSubscription,
} from '@/types';
import {
  getEndMonthDeadline,
  getSubscriptionPeriod,
  resolveSubscriptionFunding,
  sanitizeSubscriptionPaymentPriority,
} from '@/lib/subscriptions';

type AdminSupabase = SupabaseClient<any, any, any>;

type SubscriptionUserFunding = {
  id: string;
  points_balance: number;
  balance: number;
};

type BillingContext = {
  subscription: Pick<
    UserSubscription,
    | 'id'
    | 'user_id'
    | 'status'
    | 'end_month'
    | 'payment_priority'
    | 'allow_partial_payment'
    | 'billing_anchor_at'
  >;
  product: Pick<
    SubscriptionProduct,
    | 'id'
    | 'name'
    | 'price'
    | 'billing_interval_count'
    | 'billing_interval_unit'
    | 'points_enabled'
    | 'balance_enabled'
  >;
  billedAt?: Date;
  actorId?: string | null;
};

export async function fetchSubscriptionFundingUser(
  supabase: AdminSupabase,
  userId: string
) {
  const { data, error } = await supabase
    .from('users')
    .select('id, points_balance, balance')
    .eq('id', userId)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? '対象ユーザーが見つかりません');
  }

  return data as SubscriptionUserFunding;
}

export async function recomputeUserSubscriptionState(
  supabase: AdminSupabase,
  userSubscriptionId: string,
  now = new Date()
) {
  const { data: subscription, error: subscriptionError } = await supabase
    .from('user_subscriptions')
    .select(
      'id, status, billing_anchor_at, end_month, subscription_product:subscription_products!user_subscriptions_subscription_product_id_fkey(billing_interval_count, billing_interval_unit)'
    )
    .eq('id', userSubscriptionId)
    .single();

  if (subscriptionError || !subscription) {
    throw new Error(subscriptionError?.message ?? '契約情報が見つかりません');
  }

  const { data: latestPayment } = await supabase
    .from('subscription_payments')
    .select('billing_period_start_at, billing_period_end_at')
    .eq('user_subscription_id', userSubscriptionId)
    .neq('payment_status', 'cancelled')
    .order('billing_period_end_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const product = Array.isArray(subscription.subscription_product)
    ? subscription.subscription_product[0]
    : subscription.subscription_product;

  const endMonthDeadline = getEndMonthDeadline(String(subscription.end_month));
  const latestPeriodEnd = latestPayment?.billing_period_end_at
    ? new Date(latestPayment.billing_period_end_at)
    : null;
  const hasPaidPeriodLeft = latestPeriodEnd ? latestPeriodEnd >= now : false;
  const isPastEndMonth = endMonthDeadline ? now > endMonthDeadline : false;

  let nextBillingAt: string | null = null;
  let nextStatus: SubscriptionStatus = subscription.status as SubscriptionStatus;

  if (subscription.status === 'active' && latestPeriodEnd && product && !isPastEndMonth) {
    const next = new Date(latestPeriodEnd.getTime() + 1);
    if (!endMonthDeadline || next <= endMonthDeadline) {
      nextBillingAt = next.toISOString();
    }
  }

  if (subscription.status === 'active' && isPastEndMonth && !hasPaidPeriodLeft) {
    nextStatus = 'expired';
    nextBillingAt = null;
  }

  if (
    (subscription.status === 'cancel_at_period_end' || subscription.status === 'expired') &&
    (!latestPeriodEnd || latestPeriodEnd < now)
  ) {
    nextStatus = 'expired';
    nextBillingAt = null;
  }

  const { error: updateError } = await supabase
    .from('user_subscriptions')
    .update({
      status: nextStatus,
      current_period_start_at: latestPayment?.billing_period_start_at ?? null,
      current_period_end_at: latestPayment?.billing_period_end_at ?? null,
      next_billing_at: nextBillingAt,
    })
    .eq('id', userSubscriptionId);

  if (updateError) {
    throw new Error(updateError.message);
  }
}

export async function createSubscriptionBilling(
  supabase: AdminSupabase,
  context: BillingContext
) {
  const billedAt = context.billedAt ?? new Date();
  const { currentPeriodStartAt, currentPeriodEndAt, nextBillingAt } = getSubscriptionPeriod(
    billedAt,
    context.product.billing_interval_count,
    context.product.billing_interval_unit as SubscriptionBillingIntervalUnit
  );

  const fundingUser = await fetchSubscriptionFundingUser(supabase, context.subscription.user_id);
  const funding = resolveSubscriptionFunding({
    amount: context.product.price,
    pointsBalance: fundingUser.points_balance,
    cashBalance: fundingUser.balance,
    priority: sanitizeSubscriptionPaymentPriority(context.subscription.payment_priority),
    allowPartialPayment: context.subscription.allow_partial_payment,
    pointsEnabled: context.product.points_enabled,
    balanceEnabled: context.product.balance_enabled,
  });

  const { data: payment, error: insertError } = await supabase
    .from('subscription_payments')
    .insert({
      user_subscription_id: context.subscription.id,
      user_id: context.subscription.user_id,
      subscription_product_id: context.product.id,
      amount: context.product.price,
      billing_period_start_at: currentPeriodStartAt.toISOString(),
      billing_period_end_at: currentPeriodEndAt.toISOString(),
      due_at: billedAt.toISOString(),
      payment_method: funding.paymentMethod,
      payment_status: funding.paymentStatus,
      points_used: funding.pointsUsed,
      balance_used: funding.balanceUsed,
      cash_due_amount: funding.cashDueAmount,
    })
    .select()
    .single();

  if (insertError || !payment) {
    throw new Error(insertError?.message ?? 'サブスク支払の作成に失敗しました');
  }

  let pointsApplied = false;
  let balanceApplied = false;

  try {
    if (funding.pointsUsed > 0) {
      const { error } = await supabase.rpc('record_point_transaction', {
        p_user_id: context.subscription.user_id,
        p_delta: -funding.pointsUsed,
        p_reason_type: 'subscription_use',
        p_charge_request_id: null,
        p_order_id: null,
        p_note: `${context.product.name} サブスク利用 ${funding.pointsUsed}pt`,
        p_created_by: context.actorId ?? context.subscription.user_id,
        p_subscription_payment_id: payment.id,
      });

      if (error) {
        throw new Error(error.message);
      }

      pointsApplied = true;
    }

    if (funding.balanceUsed > 0) {
      const { error } = await supabase.rpc('decrement_user_balance_if_available', {
        p_user_id: context.subscription.user_id,
        p_amount: funding.balanceUsed,
      });

      if (error) {
        throw new Error(error.message);
      }

      balanceApplied = true;
    }

    const endMonthDeadline = getEndMonthDeadline(String(context.subscription.end_month));
    const nextAllowedBillingAt =
      context.subscription.status === 'active' && endMonthDeadline && nextBillingAt <= endMonthDeadline
        ? nextBillingAt.toISOString()
        : context.subscription.status === 'active' && !endMonthDeadline
          ? nextBillingAt.toISOString()
          : null;

    const { error: subscriptionUpdateError } = await supabase
      .from('user_subscriptions')
      .update({
        current_period_start_at: currentPeriodStartAt.toISOString(),
        current_period_end_at: currentPeriodEndAt.toISOString(),
        next_billing_at: nextAllowedBillingAt,
      })
      .eq('id', context.subscription.id);

    if (subscriptionUpdateError) {
      throw new Error(subscriptionUpdateError.message);
    }

    return payment as SubscriptionPayment;
  } catch (error) {
    if (pointsApplied) {
      await supabase
        .from('point_transactions')
        .delete()
        .eq('subscription_payment_id', payment.id);
      await supabase
        .from('users')
        .update({ points_balance: fundingUser.points_balance })
        .eq('id', context.subscription.user_id);
    }

    if (balanceApplied) {
      await supabase
        .from('users')
        .update({ balance: fundingUser.balance })
        .eq('id', context.subscription.user_id);
    }

    await supabase
      .from('subscription_payments')
      .delete()
      .eq('id', payment.id);

    throw error;
  }
}

export async function cancelSubscriptionPayment(
  supabase: AdminSupabase,
  paymentId: string,
  actorId: string
) {
  const { data: payment, error: paymentError } = await supabase
    .from('subscription_payments')
    .select(
      'id, user_id, user_subscription_id, amount, payment_status, points_used, balance_used, cash_due_amount'
    )
    .eq('id', paymentId)
    .single();

  if (paymentError || !payment) {
    throw new Error(paymentError?.message ?? 'サブスク支払が見つかりません');
  }

  if (payment.payment_status === 'cancelled') {
    throw new Error('このサブスク支払はすでにキャンセルされています');
  }

  const { data: subscription, error: subscriptionError } = await supabase
    .from('user_subscriptions')
    .select('id, status')
    .eq('id', payment.user_subscription_id)
    .single();

  if (subscriptionError || !subscription) {
    throw new Error(subscriptionError?.message ?? '契約情報が見つかりません');
  }

  if (subscription.status === 'active') {
    throw new Error('先に解約してください');
  }

  const fundingUser =
    payment.balance_used > 0 ? await fetchSubscriptionFundingUser(supabase, payment.user_id) : null;

  if (payment.points_used > 0) {
    const { error } = await supabase.rpc('record_point_transaction', {
      p_user_id: payment.user_id,
      p_delta: payment.points_used,
      p_reason_type: 'subscription_refund',
      p_charge_request_id: null,
      p_order_id: null,
      p_note: `サブスク支払取消 ${payment.points_used}pt`,
      p_created_by: actorId,
      p_subscription_payment_id: payment.id,
    });

    if (error) {
      throw new Error(error.message);
    }
  }

  if (payment.balance_used > 0) {
    const { error } = await supabase
      .from('users')
      .update({
        balance: (fundingUser?.balance ?? 0) + payment.balance_used,
      })
      .eq('id', payment.user_id);

    if (error) {
      throw new Error(error.message);
    }
  }

  if (payment.cash_due_amount > 0) {
    await supabase
      .from('cashbox_entries')
      .delete()
      .eq('subscription_payment_id', payment.id);
  }

  const { error: updateError } = await supabase
    .from('subscription_payments')
    .update({
      payment_status: 'cancelled',
    })
    .eq('id', payment.id);

  if (updateError) {
    throw new Error(updateError.message);
  }

  await recomputeUserSubscriptionState(supabase, payment.user_subscription_id);
}
