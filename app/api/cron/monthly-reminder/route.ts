import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { notifyMonthlySettlement } from '@/lib/slack';
import {
  buildCashCollectionEntries,
  type DeferredCashCollectionRow,
  type PendingCashOrderRow,
  type PendingSubscriptionCashRow,
} from '@/lib/cash-collection';
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
  avatar_url?: string | null;
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

  const [{ data: users }, { data: subscriptionPayments }, { data: pendingCashOrders }] =
    await Promise.all([
    supabase
      .from('users')
      .select('id, slack_user_id, name, avatar_url, deferred_balance')
      .eq('is_active', true),
    supabase
      .from('subscription_payments')
      .select('user_id, cash_due_amount, user:users!subscription_payments_user_id_fkey(id, name, avatar_url)')
      .eq('payment_status', 'pending_cash_settlement')
      .gt('cash_due_amount', 0),
    supabase
      .from('orders')
      .select('user_id, total_amount, user:users!orders_user_id_fkey(id, name, avatar_url)')
      .eq('payment_method', 'cash')
      .eq('payment_status', 'pending'),
  ]);

  const cashCollectionEntries = buildCashCollectionEntries({
    deferredUsers: ((users ?? []) as ReminderUser[]).filter((user) => (user.deferred_balance ?? 0) > 0) as DeferredCashCollectionRow[],
    pendingCashOrders: (pendingCashOrders ?? []) as PendingCashOrderRow[],
    pendingSubscriptionPayments: (subscriptionPayments ?? []) as PendingSubscriptionCashRow[],
  });

  const cashCollectionByUserId = new Map(cashCollectionEntries.map((entry) => [entry.userId, entry]));

  const targets = ((users ?? []) as ReminderUser[])
    .map((user) => {
      const collection = cashCollectionByUserId.get(user.id);
      const amount = collection?.totalAmount ?? 0;

      return {
        slackUserId: user.slack_user_id,
        name: user.name,
        amount,
        deferredAmount: collection?.deferredAmount ?? 0,
        cashOrderAmount: collection?.cashOrderAmount ?? 0,
        subscriptionAmount: collection?.subscriptionCashAmount ?? 0,
      };
    })
    .filter((user) => Boolean(user.slackUserId) && user.amount > 0)
    .map((user) => ({
      slackUserId: user.slackUserId!,
      name: user.name,
      amount: user.amount,
      deferredAmount: user.deferredAmount,
      cashOrderAmount: user.cashOrderAmount,
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
