import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import type { CookieOptions } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';

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

function getSlackUserId(user: any) {
  return (
    user?.user_metadata?.['https://slack.com/user_id'] ??
    user?.user_metadata?.provider_id ??
    user?.app_metadata?.['https://slack.com/user_id'] ??
    user?.identities?.find((identity: any) => identity?.identity_data?.['https://slack.com/user_id'])
      ?.identity_data?.['https://slack.com/user_id'] ??
    user?.identities?.find((identity: any) => identity?.identity_data?.provider_id)?.identity_data?.provider_id ??
    user?.identities?.[0]?.id ??
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

    const adminClient = createAdminClient();
    const { data: existing } = await adminClient
      .from('users').select('id').eq('id', data.user.id).single();

    if (!existing) {
      const m = data.user.user_metadata;
      await adminClient.from('users').insert({
        id: data.user.id,
        slack_user_id: getSlackUserId(data.user),
        slack_workspace_id: workspaceId,
        name: m?.full_name ?? m?.name ?? data.user.email ?? '名無し',
        avatar_url: m?.avatar_url ?? null,
        email: data.user.email,
        is_approved: true,
        role: 'member',
      });
    }

    return response;
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
