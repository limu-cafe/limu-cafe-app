import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      // usersテーブルに存在しなければ作成
      const { data: existing } = await supabase
        .from('users')
        .select('id')
        .eq('id', data.user.id)
        .single();

      if (!existing) {
        const slackMeta = data.user.user_metadata;
        await supabase.from('users').insert({
          id: data.user.id,
          slack_user_id: slackMeta?.provider_id ?? null,
          slack_workspace_id: slackMeta?.team_id ?? null,
          name: slackMeta?.full_name ?? slackMeta?.name ?? data.user.email ?? '名無し',
          avatar_url: slackMeta?.avatar_url ?? null,
          email: data.user.email,
          is_approved: false,
          role: 'member',
        });
      }

      return NextResponse.redirect(`${origin}/`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
