import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import type { CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function GET(request: Request) {
  const { origin, searchParams } = new URL(request.url);
  const next = searchParams.get('next');
  const nextPath = next && next.startsWith('/') ? next : '/';
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          cookieStore.set(name, value, options);
        },
        remove(name: string, options: CookieOptions) {
          cookieStore.set(name, '', { ...options, maxAge: 0 });
        },
      },
    }
  );

  const callbackUrl = new URL('/api/auth/callback', origin);
  callbackUrl.searchParams.set('next', nextPath);

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'slack_oidc',
    options: {
      redirectTo: callbackUrl.toString(),
      scopes: 'openid profile email',
      skipBrowserRedirect: true,
      // We validate the workspace after callback, instead of forcing Slack's
      // `team` param here. That avoids Slack-side `invalid_team_for_non_distributed_app`
      // errors and lets users complete the normal sign-in flow.
    },
  });

  if (error || !data.url) {
    const loginUrl = new URL('/login', origin);
    loginUrl.searchParams.set('error', 'oauth_failed');
    loginUrl.searchParams.set('next', nextPath);
    return NextResponse.redirect(loginUrl);
  }

  // verifierがcookieに保存された状態でSlackへリダイレクト
  return NextResponse.redirect(data.url);
}
