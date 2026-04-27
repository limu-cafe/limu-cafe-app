import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { notifyBotWelcome } from '@/lib/slack';
import { requireAdminSession } from '@/lib/admin-session';
import { createAdminClient } from '@/lib/supabase/server';

export async function POST() {
  const adminSession = await requireAdminSession();
  if (!adminSession.user) {
    return NextResponse.json({ error: adminSession.error }, { status: adminSession.status });
  }

  const allowedWorkspaceId = process.env.ALLOWED_SLACK_WORKSPACE_ID?.trim() || null;
  const supabase = createAdminClient();

  let query = supabase
    .from('users')
    .select('id, name, slack_user_id, slack_workspace_id')
    .eq('is_active', true)
    .not('slack_user_id', 'is', null)
    .is('bot_intro_sent_at', null);

  if (allowedWorkspaceId) {
    query = query.eq('slack_workspace_id', allowedWorkspaceId);
  }

  const { data: eligibleUsers, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const eligible = eligibleUsers?.length ?? 0;
  let sent = 0;
  let failed = 0;
  const failedUsers: Array<{ id: string; name: string | null }> = [];

  for (const user of eligibleUsers ?? []) {
    const dmResult = await notifyBotWelcome({
      slackUserId: user.slack_user_id!,
      userName: user.name,
    });

    if (!dmResult) {
      failed += 1;
      failedUsers.push({ id: user.id, name: user.name });
      continue;
    }

    const { error: updateError } = await supabase
      .from('users')
      .update({ bot_intro_sent_at: new Date().toISOString() })
      .eq('id', user.id);

    if (updateError) {
      console.error('failed to store bot intro timestamp after broadcast', updateError);
      failed += 1;
      failedUsers.push({ id: user.id, name: user.name });
      continue;
    }

    sent += 1;
  }

  revalidatePath('/admin/operations');
  revalidatePath('/admin');

  return NextResponse.json({ ok: true, eligible, sent, failed, failed_users: failedUsers });
}
