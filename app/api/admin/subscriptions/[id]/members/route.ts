import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireAdminSession } from '@/lib/admin-session';

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const adminSession = await requireAdminSession();
  if (!adminSession.user) {
    return NextResponse.json({ error: adminSession.error }, { status: adminSession.status });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('user_subscriptions')
    .select(
      `id, status, current_period_start_at, current_period_end_at, next_billing_at, end_month, payment_priority, allow_partial_payment, cancelled_at, created_at,
       user:users!user_subscriptions_user_id_fkey(id, name, email, avatar_url, balance, points_balance)`
    )
    .eq('subscription_product_id', params.id)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ members: data ?? [] });
}
