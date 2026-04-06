import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { notifyMonthlySettlement } from '@/lib/slack';
import {
  addMonthsWithDay,
  buildDefaultSettlementReminderSettings,
  getTodayInTokyo,
  type SettlementReminderSettings,
} from '@/lib/settlement-reminder';

type ReminderUser = {
  slack_user_id: string | null;
  name: string;
  deferred_balance: number;
};

// Vercel Cron: 毎日 朝9時に実行し、DB設定に合う日だけ通知する
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data: settingsRow } = await supabase
    .from('settlement_reminder_settings')
    .select('is_enabled, next_notification_on, interval_months, notification_day, last_notified_on')
    .eq('singleton', 'default')
    .maybeSingle();

  const settings = (settingsRow as SettlementReminderSettings | null) ?? buildDefaultSettlementReminderSettings();
  const today = getTodayInTokyo();

  if (!settings.is_enabled) {
    return NextResponse.json({ ok: true, skipped: 'disabled' });
  }

  if (settings.last_notified_on === today) {
    return NextResponse.json({ ok: true, skipped: 'already_notified_today' });
  }

  if (settings.next_notification_on > today) {
    return NextResponse.json({ ok: true, skipped: 'not_due_yet', next: settings.next_notification_on });
  }

  const { data: users } = await supabase
    .from('users')
    .select('slack_user_id, name, deferred_balance')
    .gt('deferred_balance', 0)
    .eq('is_active', true);

  const targets = ((users ?? []) as ReminderUser[])
    .filter((u: ReminderUser) => Boolean(u.slack_user_id))
    .map((u) => ({
      slackUserId: u.slack_user_id!,
      name: u.name,
      amount: u.deferred_balance,
    }));

  if (targets.length > 0) {
    await notifyMonthlySettlement({ users: targets });
  }

  let nextNotificationOn = settings.next_notification_on;
  while (nextNotificationOn <= today) {
    nextNotificationOn = addMonthsWithDay(
      nextNotificationOn,
      settings.interval_months,
      settings.notification_day
    );
  }

  await supabase.from('settlement_reminder_settings').upsert({
    singleton: 'default',
    is_enabled: settings.is_enabled,
    next_notification_on: nextNotificationOn,
    interval_months: settings.interval_months,
    notification_day: settings.notification_day,
    last_notified_on: today,
  });

  return NextResponse.json({ ok: true, notified: targets.length, next: nextNotificationOn });
}
