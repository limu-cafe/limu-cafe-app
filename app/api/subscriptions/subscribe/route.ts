import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { syncUserProfile } from '@/lib/supabase/sync-user';
import {
  monthValueToStorageDate,
  parseMonthValue,
  sanitizeSubscriptionPaymentPriority,
} from '@/lib/subscriptions';
import { createSubscriptionBilling } from '@/lib/subscription-service';

export async function POST(request: Request) {
  const supabase = await createClient();
  const adminSupabase = createAdminClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await syncUserProfile(user);

  const { product_id, end_month, payment_priority, allow_partial_payment } = await request.json();

  if (typeof product_id !== 'string' || product_id.length === 0) {
    return NextResponse.json({ error: '対象サブスクが不正です' }, { status: 400 });
  }

  if (typeof end_month !== 'string' || !parseMonthValue(end_month)) {
    return NextResponse.json({ error: '終了予定年月を入力してください' }, { status: 400 });
  }

  const storageEndMonth = monthValueToStorageDate(end_month);
  if (!storageEndMonth) {
    return NextResponse.json({ error: '終了予定年月が不正です' }, { status: 400 });
  }

  const currentMonth = new Date().toISOString().slice(0, 7);
  if (end_month < currentMonth) {
    return NextResponse.json({ error: '終了予定年月は今月以降を指定してください' }, { status: 400 });
  }

  const { data: product, error: productError } = await adminSupabase
    .from('subscription_products')
    .select('*')
    .eq('id', product_id)
    .eq('is_active', true)
    .single();

  if (productError || !product) {
    return NextResponse.json({ error: productError?.message ?? 'サブスク商品が見つかりません' }, { status: 404 });
  }

  const { data: existing } = await adminSupabase
    .from('user_subscriptions')
    .select('id')
    .eq('user_id', user.id)
    .eq('subscription_product_id', product_id)
    .in('status', ['active', 'cancel_at_period_end'])
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ error: 'このサブスクはすでに契約中です' }, { status: 409 });
  }

  const priority = sanitizeSubscriptionPaymentPriority(payment_priority);
  const now = new Date();

  const { data: subscription, error: subscriptionError } = await adminSupabase
    .from('user_subscriptions')
    .insert({
      user_id: user.id,
      subscription_product_id: product_id,
      status: 'active',
      billing_anchor_at: now.toISOString(),
      current_period_start_at: null,
      current_period_end_at: null,
      next_billing_at: now.toISOString(),
      end_month: storageEndMonth,
      payment_priority: priority,
      allow_partial_payment: allow_partial_payment !== false,
      cancelled_at: null,
    })
    .select('*')
    .single();

  if (subscriptionError || !subscription) {
    return NextResponse.json(
      { error: subscriptionError?.message ?? 'サブスク契約の作成に失敗しました' },
      { status: 500 }
    );
  }

  try {
    const payment = await createSubscriptionBilling(adminSupabase, {
      subscription: subscription as any,
      product: product as any,
      billedAt: now,
      actorId: user.id,
    });

    revalidatePath('/subscriptions');
    revalidatePath(`/subscriptions/${product_id}`);
    revalidatePath('/mypage');
    revalidatePath('/admin');
    revalidatePath('/admin/subscriptions');
    revalidatePath('/admin/transactions');

    return NextResponse.json({
      ok: true,
      subscription_id: subscription.id,
      payment: {
        id: payment.id,
        amount: payment.amount,
        payment_method: payment.payment_method,
        payment_status: payment.payment_status,
        points_used: payment.points_used,
        balance_used: payment.balance_used,
        cash_due_amount: payment.cash_due_amount,
        billing_period_start_at: payment.billing_period_start_at,
        billing_period_end_at: payment.billing_period_end_at,
      },
    });
  } catch (error: any) {
    await adminSupabase.from('user_subscriptions').delete().eq('id', subscription.id);
    return NextResponse.json(
      { error: error?.message ?? 'サブスク初回請求に失敗しました' },
      { status: 500 }
    );
  }
}
