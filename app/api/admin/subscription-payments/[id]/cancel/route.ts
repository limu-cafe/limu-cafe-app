import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/server';
import { requireAdminSession } from '@/lib/admin-session';
import { cancelSubscriptionPayment } from '@/lib/subscription-service';
import { logAdminAction } from '@/lib/admin-audit';

export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const adminSession = await requireAdminSession();
  if (!adminSession.user) {
    return NextResponse.json({ error: adminSession.error }, { status: adminSession.status });
  }

  const supabase = createAdminClient();
  const { data: payment, error } = await supabase
    .from('subscription_payments')
    .select(
      'id, amount, user_subscription_id, subscription_product:subscription_products!subscription_payments_subscription_product_id_fkey(name)'
    )
    .eq('id', params.id)
    .single();

  if (error || !payment) {
    return NextResponse.json({ error: error?.message ?? 'サブスク支払が見つかりません' }, { status: 404 });
  }

  try {
    await cancelSubscriptionPayment(supabase, payment.id, adminSession.user.id);
  } catch (serviceError: any) {
    return NextResponse.json({ error: serviceError.message }, { status: 400 });
  }

  await logAdminAction(supabase, {
    actor_id: adminSession.user.id,
    action_type: 'subscription_payment_cancelled',
    target_type: 'subscription_payment',
    target_id: payment.id,
    summary: `${payment.subscription_product?.name ?? 'サブスク'}の支払をキャンセルしました`,
    metadata: { amount: payment.amount, user_subscription_id: payment.user_subscription_id },
  });

  revalidatePath('/admin');
  revalidatePath('/admin/transactions');
  revalidatePath('/admin/subscriptions');
  revalidatePath('/mypage');
  revalidatePath('/subscriptions');

  return NextResponse.json({ ok: true });
}
