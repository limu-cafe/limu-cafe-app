import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createAdminClient, createClient } from '@/lib/supabase/server';

export async function POST(
  _request: Request,
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

  if (subscription.status !== 'active') {
    return NextResponse.json({ error: 'この契約は解約できません' }, { status: 400 });
  }

  const { error: updateError } = await adminSupabase
    .from('user_subscriptions')
    .update({
      status: 'cancel_at_period_end',
      next_billing_at: null,
      cancelled_at: new Date().toISOString(),
    })
    .eq('id', subscription.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  revalidatePath('/subscriptions');
  revalidatePath(`/subscriptions/${subscription.subscription_product_id}`);
  revalidatePath('/mypage');
  revalidatePath('/admin/subscriptions');
  revalidatePath('/admin/transactions');

  return NextResponse.json({ ok: true });
}
