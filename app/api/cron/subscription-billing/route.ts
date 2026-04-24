import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/server';
import { createSubscriptionBilling, recomputeUserSubscriptionState } from '@/lib/subscription-service';
import { sanitizeSubscriptionPaymentPriority } from '@/lib/subscriptions';

type SubscriptionBillingCandidate = {
  id: string;
  user_id: string;
  status: 'active' | 'cancel_at_period_end' | 'expired';
  end_month: string;
  payment_priority: string[];
  allow_partial_payment: boolean;
  billing_anchor_at: string;
  next_billing_at: string | null;
  user?: {
    is_active: boolean;
  } | null;
  product?: {
    id: string;
    name: string;
    price: number;
    billing_interval_count: number;
    billing_interval_unit: 'day' | 'week' | 'month';
    points_enabled: boolean;
    balance_enabled: boolean;
    is_active: boolean;
  } | null;
};

type RecomputedSubscription = {
  id: string;
  user_id: string;
  status: 'active' | 'cancel_at_period_end' | 'expired';
  end_month: string;
  payment_priority: ReturnType<typeof sanitizeSubscriptionPaymentPriority>;
  allow_partial_payment: boolean;
  billing_anchor_at: string;
  next_billing_at: string | null;
};

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const now = new Date();
  const { data: candidates, error } = await supabase
    .from('user_subscriptions')
    .select(
      `
        id,
        user_id,
        status,
        end_month,
        payment_priority,
        allow_partial_payment,
        billing_anchor_at,
        next_billing_at,
        user:users!user_subscriptions_user_id_fkey(is_active),
        product:subscription_products!user_subscriptions_subscription_product_id_fkey(
          id,
          name,
          price,
          billing_interval_count,
          billing_interval_unit,
          points_enabled,
          balance_enabled,
          is_active
        )
      `
    )
    .in('status', ['active', 'cancel_at_period_end'])
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let created = 0;
  let expired = 0;
  let skipped = 0;
  let failed = 0;

  for (const candidate of (candidates ?? []) as SubscriptionBillingCandidate[]) {
    try {
      await recomputeUserSubscriptionState(supabase, candidate.id, now);
    } catch (recomputeError) {
      console.error('[subscription-billing] failed to recompute subscription state', candidate.id, recomputeError);
      failed += 1;
      continue;
    }

    const { data: recomputed, error: recomputedError } = await supabase
      .from('user_subscriptions')
      .select(
        'id, user_id, status, end_month, payment_priority, allow_partial_payment, billing_anchor_at, next_billing_at'
      )
      .eq('id', candidate.id)
      .single();

    if (recomputedError || !recomputed) {
      console.error(
        '[subscription-billing] failed to fetch recomputed subscription',
        candidate.id,
        recomputedError
      );
      failed += 1;
      continue;
    }

    if (recomputed.status === 'expired') {
      expired += 1;
      continue;
    }

    if (candidate.user?.is_active === false) {
      skipped += 1;
      continue;
    }

    if (!candidate.product) {
      failed += 1;
      continue;
    }

    if (!recomputed.next_billing_at || new Date(recomputed.next_billing_at) > now) {
      skipped += 1;
      continue;
    }

    try {
      await createSubscriptionBilling(supabase, {
        subscription: {
          ...recomputed,
          payment_priority: sanitizeSubscriptionPaymentPriority(recomputed.payment_priority),
        } as RecomputedSubscription,
        product: candidate.product,
        billedAt: new Date(recomputed.next_billing_at),
        actorId: null,
      });
      created += 1;
    } catch (billingError) {
      console.error('[subscription-billing] failed to create billing', candidate.id, billingError);
      failed += 1;
    }
  }

  if (created > 0 || expired > 0) {
    revalidatePath('/subscriptions');
    revalidatePath('/mypage');
    revalidatePath('/admin');
    revalidatePath('/admin/subscriptions');
    revalidatePath('/admin/transactions');
  }

  return NextResponse.json({
    ok: true,
    scanned: (candidates ?? []).length,
    created,
    expired,
    skipped,
    failed,
  });
}
