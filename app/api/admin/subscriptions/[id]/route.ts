import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/server';
import { requireAdminSession } from '@/lib/admin-session';
import { sendSlackDirectMessages } from '@/lib/slack';

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const adminSession = await requireAdminSession();
  if (!adminSession.user) {
    return NextResponse.json({ error: adminSession.error }, { status: adminSession.status });
  }

  const supabase = createAdminClient();
  const { data: currentProduct, error: productError } = await supabase
    .from('subscription_products')
    .select('*')
    .eq('id', params.id)
    .single();

  if (productError || !currentProduct) {
    return NextResponse.json({ error: productError?.message ?? 'サブスク商品が見つかりません' }, { status: 404 });
  }

  const {
    name,
    english_name,
    description,
    price,
    billing_interval_count,
    billing_interval_unit,
    points_enabled,
    balance_enabled,
    is_active,
  } = await request.json();

  const patch: Record<string, unknown> = {};

  if (typeof name === 'string' && name.trim()) patch.name = name.trim();
  if (english_name !== undefined) patch.english_name = typeof english_name === 'string' && english_name.trim() ? english_name.trim() : null;
  if (description !== undefined) patch.description = typeof description === 'string' && description.trim() ? description.trim() : null;
  if (typeof price === 'number' && Number.isInteger(price) && price > 0) patch.price = price;
  if (typeof billing_interval_count === 'number' && Number.isInteger(billing_interval_count) && billing_interval_count > 0) {
    patch.billing_interval_count = billing_interval_count;
  }
  if (typeof billing_interval_unit === 'string' && ['day', 'week', 'month'].includes(billing_interval_unit)) {
    patch.billing_interval_unit = billing_interval_unit;
  }
  if (typeof points_enabled === 'boolean') patch.points_enabled = points_enabled;
  if (typeof balance_enabled === 'boolean') patch.balance_enabled = balance_enabled;
  if (typeof is_active === 'boolean') patch.is_active = is_active;

  const { error: updateError } = await supabase
    .from('subscription_products')
    .update(patch)
    .eq('id', params.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  if (typeof patch.price === 'number' && patch.price !== currentProduct.price) {
    const { data: activeMembers } = await supabase
      .from('user_subscriptions')
      .select('user:users!user_subscriptions_user_id_fkey(slack_user_id)')
      .eq('subscription_product_id', params.id)
      .in('status', ['active', 'cancel_at_period_end']);

    const slackUserIds = (activeMembers ?? [])
      .map((row: any) => row.user?.slack_user_id)
      .filter((value: string | null | undefined): value is string => Boolean(value));

    if (slackUserIds.length > 0) {
      try {
        await sendSlackDirectMessages({
          slackUserIds,
          text:
            `☕ ${currentProduct.name} のサブスク料金が変更されました。\n` +
            `新しい料金: ¥${Number(patch.price).toLocaleString()}\n` +
            `変更は次回請求から反映されます。`,
        });
      } catch (error) {
        console.error('[subscriptions] failed to notify price change', error);
      }
    }
  }

  revalidatePath('/admin');
  revalidatePath('/admin/subscriptions');
  revalidatePath('/subscriptions');
  revalidatePath(`/subscriptions/${params.id}`);

  return NextResponse.json({ ok: true });
}
