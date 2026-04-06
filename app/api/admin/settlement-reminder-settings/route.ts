import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/server';
import { requireAdminSession } from '@/lib/admin-session';

export async function POST(request: Request) {
  const adminSession = await requireAdminSession();
  if (!adminSession.user) {
    return NextResponse.json({ error: adminSession.error }, { status: adminSession.status });
  }

  const { is_enabled, next_notification_on, interval_months } = await request.json();

  if (typeof is_enabled !== 'boolean') {
    return NextResponse.json({ error: '通知の有効/無効が不正です' }, { status: 400 });
  }

  if (typeof next_notification_on !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(next_notification_on)) {
    return NextResponse.json({ error: '次回通知日が不正です' }, { status: 400 });
  }

  if (!Number.isInteger(interval_months) || interval_months < 1 || interval_months > 12) {
    return NextResponse.json({ error: '通知間隔は1〜12か月で指定してください' }, { status: 400 });
  }

  const notificationDay = Number(next_notification_on.slice(-2));
  const supabase = createAdminClient();

  const { error } = await supabase.from('settlement_reminder_settings').upsert({
    singleton: 'default',
    is_enabled,
    next_notification_on,
    interval_months,
    notification_day: notificationDay,
    updated_by: adminSession.user.id,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidatePath('/admin/settlement');
  revalidatePath('/admin');

  return NextResponse.json({ ok: true });
}
