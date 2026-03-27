import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { notifyMonthlySettlement } from '@/lib/slack';

// Vercel Cron: 毎月1日 朝9時に実行
// vercel.json で "schedule": "0 0 1 * *" を設定
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data: users } = await supabase
    .from('users')
    .select('slack_user_id, name, deferred_balance')
    .gt('deferred_balance', 0)
    .eq('is_active', true);

  if (!users || users.length === 0) {
    return NextResponse.json({ ok: true, notified: 0 });
  }

  const targets = users
    .filter(u => u.slack_user_id)
    .map(u => ({
      slackUserId: u.slack_user_id!,
      name: u.name,
      amount: u.deferred_balance,
    }));

  await notifyMonthlySettlement({ users: targets });

  return NextResponse.json({ ok: true, notified: targets.length });
}
