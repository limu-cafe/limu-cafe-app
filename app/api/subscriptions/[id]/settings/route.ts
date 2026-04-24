import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createAdminClient, createClient } from '@/lib/supabase/server';
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
  const supabase = await createClient();
  const adminSupabase = createAdminClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: subscription, error } = await adminSupabase
    .from('user_subscriptions')
    .select('id, subscription_product_id, status')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .single();

  if (error || !subscription) {
    return NextResponse.json({ error: error?.message ?? '契約情報が見つかりません' }, { status: 404 });
  }

  const { end_month, payment_priority, allow_partial_payment } = await request.json();

  const patch: Record<string, unknown> = {};

  if (end_month !== undefined) {
    if (typeof end_month !== 'string' || !parseMonthValue(end_month)) {
      return NextResponse.json({ error: '終了予定年月が不正です' }, { status: 400 });
    }

    const currentMonth = new Date().toISOString().slice(0, 7);
    if (end_month < currentMonth) {
      return NextResponse.json({ error: '終了予定年月は今月以降を指定してください' }, { status: 400 });
    }

    patch.end_month = monthValueToStorageDate(end_month);
  }

  if (payment_priority !== undefined) {
    patch.payment_priority = sanitizeSubscriptionPaymentPriority(payment_priority);
  }

  if (allow_partial_payment !== undefined) {
    patch.allow_partial_payment = Boolean(allow_partial_payment);
  }

  const { error: updateError } = await adminSupabase
    .from('user_subscriptions')
    .update(patch)
    .eq('id', subscription.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  await recomputeUserSubscriptionState(adminSupabase, subscription.id);

  revalidatePath('/subscriptions');
  revalidatePath(`/subscriptions/${subscription.subscription_product_id}`);
  revalidatePath('/mypage');
  revalidatePath('/admin/subscriptions');

  return NextResponse.json({ ok: true });
}
