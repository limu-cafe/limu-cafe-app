import { verifiedSlackIdentity, safeNextPath } from '@/lib/slack-identity';
import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import type { CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { notifyBotWelcome } from '@/lib/slack';
import { createAdminClient } from '@/lib/supabase/server';
import { syncUserProfile } from '@/lib/supabase/sync-user';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next');
  const redirectPath = safeNextPath(next);

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=no_code`);
  }

  const cookieStore = await cookies();
  const response = NextResponse.redirect(`${origin}${redirectPath}`);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          response.cookies.set(name, value, options);
        },
        remove(name: string, options: CookieOptions) {
          response.cookies.set(name, '', { ...options, maxAge: 0 });
        },
      },
    }
  );

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (!error && data.user) {
    const identity = verifiedSlackIdentity(data.user);
    const rejectLogin = async (reason: string) => {
      await supabase.auth.signOut({ scope: 'local' });
      const rejected = NextResponse.redirect(new URL(`/login?error=${reason}`, origin));
      for (const cookie of response.cookies.getAll()) rejected.cookies.set(cookie);
      return rejected;
    };
    if (!identity) return rejectLogin('workspace_not_allowed');
    let profile;
    try { profile = await syncUserProfile(data.user); }
    catch { return rejectLogin('auth_failed'); }
    if (!profile.is_active || !profile.is_approved) return rejectLogin('access_denied');
    const workspaceId = identity.workspaceId;

    {
      const adminClient = createAdminClient();
      const { data: userRecord, error: userError } = await adminClient
        .from('users')
        .select('id, name, slack_user_id, slack_workspace_id, bot_intro_sent_at')
        .eq('id', data.user.id)
        .maybeSingle();

      if (userError) {
        console.error('failed to load user for bot intro', userError);
      } else if (
        userRecord?.slack_user_id &&
        userRecord.slack_workspace_id === workspaceId &&
        !userRecord.bot_intro_sent_at
      ) {
        const dmResult = await notifyBotWelcome({
          slackUserId: userRecord.slack_user_id,
          userName: userRecord.name,
        });

        if (dmResult) {
          const { error: updateError } = await adminClient
            .from('users')
            .update({ bot_intro_sent_at: new Date().toISOString() })
            .eq('id', userRecord.id);

          if (updateError) {
            console.error('failed to store bot intro timestamp', updateError);
          }
        } else {
          console.error('failed to send bot intro DM', { userId: userRecord.id });
        }
      }
    }

    return response;
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
