import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/server';
import { requireAdminSession } from '@/lib/admin-session';

export async function POST(request: Request) {
  const adminSession = await requireAdminSession();
  if (!adminSession.user) {
    return NextResponse.json({ error: adminSession.error }, { status: adminSession.status });
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

  if (typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json({ error: 'サブスク名を入力してください' }, { status: 400 });
  }

  if (!Number.isInteger(price) || price < 1) {
    return NextResponse.json({ error: '価格は1円以上で入力してください' }, { status: 400 });
  }

  if (!Number.isInteger(billing_interval_count) || billing_interval_count < 1) {
    return NextResponse.json({ error: '周期の間隔は1以上で入力してください' }, { status: 400 });
  }

  if (!['day', 'week', 'month'].includes(billing_interval_unit)) {
    return NextResponse.json({ error: '周期の単位が不正です' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { error } = await supabase.from('subscription_products').insert({
    name: name.trim(),
    english_name: typeof english_name === 'string' && english_name.trim() ? english_name.trim() : null,
    description: typeof description === 'string' && description.trim() ? description.trim() : null,
    price,
    billing_interval_count,
    billing_interval_unit,
    points_enabled: points_enabled !== false,
    balance_enabled: balance_enabled !== false,
    is_active: is_active !== false,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidatePath('/admin');
  revalidatePath('/admin/subscriptions');
  revalidatePath('/subscriptions');

  return NextResponse.json({ ok: true });
}
