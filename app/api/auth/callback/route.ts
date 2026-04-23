import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import type { CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { syncUserProfile } from '@/lib/supabase/sync-user';

function getWorkspaceId(user: any) {
  return (
    user?.user_metadata?.['https://slack.com/team_id'] ??
    user?.user_metadata?.team_id ??
    user?.user_metadata?.team?.id ??
    user?.user_metadata?.workspace_id ??
    user?.app_metadata?.['https://slack.com/team_id'] ??
    user?.app_metadata?.team_id ??
    user?.app_metadata?.team?.id ??
    user?.identities?.find((identity: any) => identity?.identity_data?.['https://slack.com/team_id'])
      ?.identity_data?.['https://slack.com/team_id'] ??
    user?.identities?.find((identity: any) => identity?.identity_data?.team_id)?.identity_data?.team_id ??
    user?.identities?.find((identity: any) => identity?.identity_data?.team?.id)?.identity_data?.team?.id ??
    null
  );
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next');
  const redirectPath = next && next.startsWith('/') ? next : '/';
  const allowedWorkspaceId = process.env.ALLOWED_SLACK_WORKSPACE_ID?.trim() || null;

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
    const detectedWorkspaceId = getWorkspaceId(data.user);
    const workspaceId = detectedWorkspaceId ?? allowedWorkspaceId;

    if (allowedWorkspaceId && detectedWorkspaceId && detectedWorkspaceId !== allowedWorkspaceId) {
      await supabase.auth.signOut();
      const loginUrl = new URL('/login', origin);
      loginUrl.searchParams.set('error', 'workspace_not_allowed');
      if (detectedWorkspaceId) {
        loginUrl.searchParams.set('detected_workspace_id', detectedWorkspaceId);
      }
      return NextResponse.redirect(loginUrl.toString());
    }

    await syncUserProfile({
      ...data.user,
      user_metadata: {
        ...data.user.user_metadata,
        workspace_id: workspaceId,
      },
    });

    return response;
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
