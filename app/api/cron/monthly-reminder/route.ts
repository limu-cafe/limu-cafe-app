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
  id: string;
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

  const [{ data: users }, { data: subscriptionPayments }] = await Promise.all([
    supabase
      .from('users')
      .select('id, slack_user_id, name, deferred_balance')
      .eq('is_active', true),
    supabase
      .from('subscription_payments')
      .select('user_id, cash_due_amount')
      .eq('payment_status', 'pending_cash_settlement')
      .gt('cash_due_amount', 0),
  ]);

  const subscriptionAmountsByUser = new Map<string, number>();
  for (const payment of (subscriptionPayments ?? []) as Array<{ user_id: string; cash_due_amount: number }>) {
    subscriptionAmountsByUser.set(
      payment.user_id,
      (subscriptionAmountsByUser.get(payment.user_id) ?? 0) + payment.cash_due_amount
    );
  }

  const targets = ((users ?? []) as ReminderUser[])
    .map((user) => {
      const subscriptionAmount = subscriptionAmountsByUser.get(user.id) ?? 0;
      const deferredAmount = user.deferred_balance;
      const amount = deferredAmount + subscriptionAmount;

      return {
        slackUserId: user.slack_user_id,
        name: user.name,
        amount,
        deferredAmount,
        subscriptionAmount,
      };
    })
    .filter((user) => Boolean(user.slackUserId) && user.amount > 0)
    .map((user) => ({
      slackUserId: user.slackUserId!,
      name: user.name,
      amount: user.amount,
      deferredAmount: user.deferredAmount,
      subscriptionAmount: user.subscriptionAmount,
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
